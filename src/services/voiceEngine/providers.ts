import { createParser } from "eventsource-parser";
import { supabase } from "@/integrations/supabase/client";
import { VoiceProviderError, type VoiceProvider } from "./provider";
import { voiceConfig, type SttProviderId, type TtsProviderId } from "./voiceConfig";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function errFor(status: number) {
  if (status === 401) return new VoiceProviderError("auth");
  if (status === 429) return new VoiceProviderError("rate_limit");
  return new VoiceProviderError("unavailable");
}

async function readSSE(res: Response, onEvent: (p: any) => void) {
  const parser = createParser({ onEvent: (e) => onEvent(JSON.parse(e.data)) });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  while (true) {
    const n = await reader.read();
    if (n.done) break;
    parser.feed(n.value);
  }
}

/** Transcribes one segment with the given speech-to-text service (server-side keys). */
export async function transcribeSegment(
  interviewId: string,
  provider: SttProviderId | "auto",
  audio: Blob,
  onPartial: (t: string) => void,
) {
  const form = new FormData();
  form.append("interviewId", interviewId);
  form.append("provider", provider);
  form.append("file", new File([audio], "answer.webm", { type: "audio/webm" }));
  let res: Response;
  try {
    res = await fetch("/api/voice/transcribe", { method: "POST", headers: await authHeader(), body: form });
  } catch {
    throw new VoiceProviderError("network");
  }
  if (!res.ok || !res.body) throw errFor(res.status);
  let text = "";
  let final: string | null = null;
  await readSSE(res, (p) => {
    if (p.type === "transcript.text.delta" && p.delta) {
      text += p.delta;
      onPartial(text);
    } else if (p.type === "transcript.text.done") final = p.text ?? text;
    else if (p.type === "error" || p.error) throw new VoiceProviderError("unavailable");
  });
  return (final ?? text).trim();
}

/** Any server-proxied voice (Lovable AI, Cartesia, ElevenLabs, Deepgram, Google, Azure): 24 kHz PCM over SSE. */
export class ServerSpeechProvider implements VoiceProvider {
  private ctx: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private abort: AbortController | null = null;
  constructor(private interviewId: string, public id: Exclude<TtsProviderId, "browser"> | "auto") {}
  isAvailable() {
    return typeof window !== "undefined" && "AudioContext" in window;
  }
  async connect() {
    this.ctx ??= new AudioContext({ sampleRate: 24000 });
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }
  async disconnect() {
    await this.interrupt();
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
  async interrupt() {
    this.abort?.abort();
    for (const s of this.sources) s.stop();
    this.sources.clear();
  }
  async speak(text: string) {
    await this.connect();
    const ctx = this.ctx!;
    const ac = new AbortController();
    this.abort = ac;
    let res: Response;
    try {
      res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId: this.interviewId, text, provider: this.id }),
        signal: ac.signal,
      });
    } catch {
      if (ac.signal.aborted) return;
      throw new VoiceProviderError("network");
    }
    if (!res.ok || !res.body) throw errFor(res.status);
    let playhead = 0;
    let pending = new Uint8Array(0);
    let last: Promise<void> = Promise.resolve();
    let played = 0;
    try {
      await readSSE(res, (p) => {
        if (p.type === "error" || p.error) throw new VoiceProviderError("unavailable");
        if (p.type !== "speech.audio.delta" || !p.audio) return;
        const inc = Uint8Array.from(atob(p.audio), (c) => c.charCodeAt(0));
        const bytes = new Uint8Array(pending.length + inc.length);
        bytes.set(pending);
        bytes.set(inc, pending.length);
        const usable = bytes.length - (bytes.length % 2);
        const view = new DataView(bytes.buffer);
        const samples = new Float32Array(usable / 2);
        for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
        pending = bytes.slice(usable);
        if (!samples.length) return;
        played += samples.length;
        const buf = ctx.createBuffer(1, samples.length, 24000);
        buf.copyToChannel(samples, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        this.sources.add(src);
        last = new Promise((r) => {
          src.onended = () => {
            this.sources.delete(src);
            r();
          };
        });
        playhead = Math.max(playhead, ctx.currentTime + 0.05);
        src.start(playhead);
        playhead += buf.duration;
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      throw e instanceof VoiceProviderError ? e : new VoiceProviderError("network");
    }
    if (!played && !ac.signal.aborted) throw new VoiceProviderError("unavailable");
    await last;
  }
  transcribe(audio: Blob, onPartial: (t: string) => void) {
    return transcribeSegment(this.interviewId, "lovable", audio, onPartial);
  }
}

/** Last resort: the browser's built-in speech synthesis. */
export class BrowserSpeechProvider implements VoiceProvider {
  id = "browser" as const;
  constructor(private interviewId: string) {}
  isAvailable() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }
  async connect() {}
  async disconnect() {
    window.speechSynthesis?.cancel();
  }
  async interrupt() {
    window.speechSynthesis?.cancel();
  }
  speak(text: string) {
    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voiceConfig.language;
      u.rate = voiceConfig.speed;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }
  transcribe(audio: Blob, onPartial: (t: string) => void) {
    return transcribeSegment(this.interviewId, "lovable", audio, onPartial);
  }
}
