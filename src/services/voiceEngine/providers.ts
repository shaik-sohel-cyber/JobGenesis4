import { createParser } from "eventsource-parser";
import { supabase } from "@/integrations/supabase/client";
import { VoiceProviderError, type VoiceProvider } from "./provider";
import { voiceConfig, type SttProviderId, type TtsProviderId } from "./voiceConfig";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

type VoiceEvent = {
  type?: unknown;
  delta?: unknown;
  text?: unknown;
  error?: unknown;
  audio?: unknown;
};

function errFor(status: number) {
  if (status === 401) return new VoiceProviderError("auth");
  if (status === 429) return new VoiceProviderError("rate_limit");
  return new VoiceProviderError("unavailable");
}

async function readSSE(res: Response, onEvent: (payload: VoiceEvent) => void) {
  if (!res.headers.get("content-type")?.toLowerCase().includes("text/event-stream") || !res.body) {
    throw new VoiceProviderError("unavailable", "Unexpected voice response format.");
  }
  const parser = createParser({
    onEvent: (event) => {
      if (event.data === "[DONE]") return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        throw new VoiceProviderError("unavailable", "Malformed voice event.");
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new VoiceProviderError("unavailable", "Malformed voice event.");
      }
      onEvent(payload as VoiceEvent);
    },
  });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      parser.feed(next.value);
    }
  } finally {
    reader.releaseLock();
  }
}

const STT_TIMEOUT_MS = 75_000;
const TTS_TIMEOUT_MS = 55_000;

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
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/voice/transcribe", {
      method: "POST",
      headers: await authHeader(),
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) throw errFor(res.status);
    let text = "";
    let final: string | null = null;
    await readSSE(res, (payload) => {
      if (payload.type === "transcript.text.delta") {
        if (typeof payload.delta !== "string") throw new VoiceProviderError("unavailable", "Malformed transcript event.");
        text += payload.delta;
        onPartial(text);
      } else if (payload.type === "transcript.text.done") {
        if (payload.text != null && typeof payload.text !== "string")
          throw new VoiceProviderError("unavailable", "Malformed transcript event.");
        final = (payload.text as string | null | undefined) ?? text;
      } else if (payload.type === "error" || payload.error) {
        throw new VoiceProviderError("unavailable");
      }
    });
    const transcript = (final ?? text).trim();
    if (!transcript) throw new VoiceProviderError("unavailable", "No speech was detected.");
    return transcript;
  } catch (error) {
    if (controller.signal.aborted) throw new VoiceProviderError("network", "Transcription timed out.");
    if (error instanceof VoiceProviderError) throw error;
    throw new VoiceProviderError("network");
  } finally {
    clearTimeout(timeout);
    console.info("[voice-timing] phase=transcription duration_ms=" + Math.round(performance.now() - startedAt));
  }
}

/** Any server-proxied voice (Lovable AI, Cartesia, ElevenLabs, Deepgram, Google, Azure): 24 kHz PCM over SSE. */
export class ServerSpeechProvider implements VoiceProvider {
  private ctx: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private abort: AbortController | null = null;
  private generation = 0;
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
    this.generation += 1;
    this.stopActive();
  }
  private stopActive() {
    this.abort?.abort();
    this.abort = null;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // A source can finish between checking the set and stopping it.
      }
    }
    this.sources.clear();
  }
  async speak(text: string) {
    const generation = ++this.generation;
    this.stopActive();
    const startedAt = performance.now();
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      this.stopActive();
      controller.abort();
    }, TTS_TIMEOUT_MS);
    this.abort = controller;
    let played = 0;
    const sourceCompletions: Promise<void>[] = [];
    try {
      await this.connect();
      if (generation !== this.generation) return;
      const ctx = this.ctx!;
      const responseStartedAt = performance.now();
      let res: Response;
      try {
        res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { ...(await authHeader()), "Content-Type": "application/json" },
          body: JSON.stringify({ interviewId: this.interviewId, text, provider: this.id }),
          signal: controller.signal,
        });
      } catch {
        if (generation !== this.generation) return;
        if (timedOut) throw new VoiceProviderError("network", "Speech request timed out.");
        throw new VoiceProviderError("network");
      }
      console.info("[voice-timing] phase=tts_response duration_ms=" + Math.round(performance.now() - responseStartedAt));
      if (!res.ok) throw errFor(res.status);
      let playhead = 0;
      let hasScheduledAudio = false;
      let pending = new Uint8Array(0);
      let firstAudioReceived = false;
      let firstPlaybackScheduled = false;
      let playbackStartedAt: number | null = null;
      await readSSE(res, (payload) => {
        if (generation !== this.generation) return;
        if (payload.type === "error" || payload.error) throw new VoiceProviderError("unavailable");
        if (payload.type !== "speech.audio.delta") return;
        if (typeof payload.audio !== "string" || !payload.audio || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.audio)) {
          throw new VoiceProviderError("unavailable", "Malformed PCM audio event.");
        }
        const inc = Uint8Array.from(atob(payload.audio), (c) => c.charCodeAt(0));
        if (!firstAudioReceived) {
          firstAudioReceived = true;
          console.info("[voice-timing] phase=first_tts_audio_received duration_ms=" + Math.round(performance.now() - responseStartedAt));
        }
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
        const buffer = ctx.createBuffer(1, samples.length, 24000);
        buffer.copyToChannel(samples, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        this.sources.add(source);
        sourceCompletions.push(
          new Promise<void>((resolve) => {
            source.onended = () => {
              this.sources.delete(source);
              resolve();
            };
          }),
        );
        if (!hasScheduledAudio) {
          playhead = ctx.currentTime + 0.12;
          hasScheduledAudio = true;
          playbackStartedAt = performance.now();
          if (!firstPlaybackScheduled) {
            firstPlaybackScheduled = true;
            console.info("[voice-timing] phase=first_audible_playback_estimated duration_ms=" + Math.round(playbackStartedAt - responseStartedAt + 120));
          }
        }
        source.start(playhead);
        playhead += buffer.duration;
      });
      if (generation !== this.generation) return;
      if (pending.length !== 0) throw new VoiceProviderError("unavailable", "Incomplete PCM audio sample.");
      if (!played) throw new VoiceProviderError("unavailable", "No PCM audio was received.");
      const aborted = new Promise<void>((resolve) => {
        if (controller.signal.aborted) {
          resolve();
          return;
        }
        controller.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      await Promise.race([Promise.all(sourceCompletions), aborted]);
      if (generation !== this.generation) return;
      if (timedOut) throw new VoiceProviderError("network", "Speech playback timed out.");
      console.info("[voice-timing] phase=full_response_playback duration_ms=" + Math.round(performance.now() - responseStartedAt));
      if (playbackStartedAt != null) {
        console.info("[voice-timing] phase=playback duration_ms=" + Math.round(performance.now() - playbackStartedAt));
      }
    } catch (error) {
      if (generation !== this.generation) return;
      if (timedOut) throw new VoiceProviderError("network", "Speech request timed out.");
      if (error instanceof VoiceProviderError) throw error;
      throw new VoiceProviderError("unavailable");
    } finally {
      clearTimeout(timeout);
      if (generation === this.generation) {
        this.stopActive();
        console.info("[voice-timing] phase=tts_total duration_ms=" + Math.round(performance.now() - startedAt));
      }
    }
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
      const startedAt = performance.now();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        console.info("[voice-timing] phase=browser_playback duration_ms=" + Math.round(performance.now() - startedAt));
        resolve();
      };
      const timeout = setTimeout(() => {
        window.speechSynthesis.cancel();
        finish();
      }, TTS_TIMEOUT_MS);
      u.lang = voiceConfig.language;
      u.rate = voiceConfig.speed;
      u.onend = finish;
      u.onerror = finish;
      window.speechSynthesis.speak(u);
    });
  }
  transcribe(audio: Blob, onPartial: (t: string) => void) {
    return transcribeSegment(this.interviewId, "lovable", audio, onPartial);
  }
}
