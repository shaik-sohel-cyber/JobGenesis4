/** Third-party text-to-speech adapters. Each returns raw PCM16 mono 24 kHz bytes. */
import {
  voiceConfig,
  type EnabledProviders,
  type SttProviderId,
  type TtsProviderId,
} from "./voiceConfig";

const env = (k: string) => process.env[k] || "";

/** Services whose key was rejected or whose free credits ran out; skipped for a while. */
const benchedUntil = new Map<string, number>();
export function bench(provider: string, ms = 60 * 60 * 1000) {
  benchedUntil.set(provider, Date.now() + ms);
}
const ok_ = (p: string) => (benchedUntil.get(p) ?? 0) < Date.now();

export function enabledProviders(): EnabledProviders {
  const tts: Record<TtsProviderId, boolean> = {
    lovable: !!env("LOVABLE_API_KEY"),
    cartesia: !!env("CARTESIA_API_KEY") && ok_("cartesia"),
    elevenlabs: !!env("ELEVENLABS_API_KEY") && ok_("elevenlabs"),
    deepgram: !!env("DEEPGRAM_API_KEY") && ok_("deepgram"),
    google: !!env("GOOGLE_TTS_API_KEY") && ok_("google"),
    azure: !!env("AZURE_SPEECH_KEY") && !!env("AZURE_SPEECH_REGION") && ok_("azure"),
    kokoro: !!env("HUGGINGFACE_API_KEY") && ok_("kokoro"),
    browser: true,
  };
  const stt: Record<SttProviderId, boolean> = {
    lovable: !!env("LOVABLE_API_KEY"),
    deepgram: !!env("DEEPGRAM_API_KEY"),
    groq: !!env("GROQ_API_KEY"),
    assemblyai: !!env("ASSEMBLYAI_API_KEY"),
    elevenlabs: !!env("ELEVENLABS_API_KEY"),
  };
  return { tts, stt };
}

export class UpstreamError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

async function ok(res: Response, name: string) {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[voice] ${name} failed`, res.status, body.slice(0, 300));
    throw new UpstreamError(res.status, name);
  }
  return res;
}

function bytesStream(buf: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(buf);
      c.close();
    },
  });
}

const byte = (arr: Uint8Array, i: number) => arr[i] ?? 0;

/** Extracts the PCM payload from a RIFF/WAVE buffer, skipping any metadata chunks before "data". */
export function stripWavHeader(wav: Uint8Array): Uint8Array {
  const u32 = (p: number) => byte(wav, p) | (byte(wav, p + 1) << 8) | (byte(wav, p + 2) << 16) | (byte(wav, p + 3) << 24);
  let pos = 12; // skip "RIFF", size, "WAVE"
  while (pos + 8 <= wav.length) {
    const id = String.fromCharCode(byte(wav, pos), byte(wav, pos + 1), byte(wav, pos + 2), byte(wav, pos + 3));
    const size = u32(pos + 4);
    if (id === "data") return wav.subarray(pos + 8, Math.min(pos + 8 + size, wav.length));
    pos += 8 + size + (size % 2);
  }
  return wav.subarray(44);
}

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

export async function synthesize(
  provider: Exclude<TtsProviderId, "lovable" | "browser">,
  text: string,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  switch (provider) {
    case "kokoro": {
      // Kokoro is served on fal.ai behind the Hugging Face router: submit → poll → fetch WAV.
      const tok = env("HUGGINGFACE_API_KEY");
      const res = await ok(
        await fetch(`https://router.huggingface.co/fal-ai/${voiceConfig.kokoro.model}?_subdomain=queue`, {
          method: "POST",
          signal,
          headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: voiceConfig.kokoro.voice, audio_format: "wav", speed: voiceConfig.kokoro.speed }),
        }),
        "kokoro",
      );
      const { request_id, response_url } = (await res.json()) as { request_id?: string; response_url?: string };
      if (!request_id || !response_url) throw new UpstreamError(502, "kokoro");
      // fal's queue URLs reject HF tokens; the router proxies them (with the query the client uses).
      const proxied = (u: string) => `${u.replace("https://queue.fal.run", "https://router.huggingface.co/fal-ai")}?_subdomain=queue`;
      const deadline = Date.now() + 45_000;
      let status = "";
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 700));
        const s = await ok(await fetch(proxied(`${response_url}/status`), { headers: { Authorization: `Bearer ${tok}` }, signal }), "kokoro");
        status = ((await s.json()) as { status?: string }).status ?? "";
        if (status === "COMPLETED") break;
        if (status !== "IN_QUEUE" && status !== "IN_PROGRESS") throw new UpstreamError(502, "kokoro");
      }
      if (status !== "COMPLETED") throw new UpstreamError(504, "kokoro");
      const done = await ok(await fetch(proxied(response_url), { headers: { Authorization: `Bearer ${tok}` }, signal }), "kokoro");
      const { audio } = (await done.json()) as { audio?: { url?: string } };
      if (!audio?.url) throw new UpstreamError(502, "kokoro");
      const wavRes = await ok(await fetch(audio.url, { signal }), "kokoro");
      return bytesStream(stripWavHeader(new Uint8Array(await wavRes.arrayBuffer())));
    }
    case "cartesia": {
      const res = await ok(
        await fetch("https://api.cartesia.ai/tts/bytes", {
          method: "POST",
          signal,
          headers: { "X-API-Key": env("CARTESIA_API_KEY"), "Cartesia-Version": "2025-04-16", "Content-Type": "application/json" },
          body: JSON.stringify({
            model_id: voiceConfig.cartesia.model,
            transcript: text,
            voice: { mode: "id", id: voiceConfig.cartesia.voiceId },
            output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: 24000 },
            language: voiceConfig.language,
          }),
        }),
        "cartesia",
      );
      return res.body!;
    }
    case "elevenlabs": {
      const res = await ok(
        await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceConfig.elevenlabs.voiceId}/stream?output_format=pcm_24000`,
          {
            method: "POST",
            signal,
            headers: { "xi-api-key": env("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
            body: JSON.stringify({ text, model_id: voiceConfig.elevenlabs.model }),
          },
        ),
        "elevenlabs",
      );
      return res.body!;
    }
    case "deepgram": {
      const res = await ok(
        await fetch(
          `https://api.deepgram.com/v1/speak?model=${voiceConfig.deepgram.ttsModel}&encoding=linear16&sample_rate=24000&container=none`,
          {
            method: "POST",
            signal,
            headers: { Authorization: `Token ${env("DEEPGRAM_API_KEY")}`, "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          },
        ),
        "deepgram",
      );
      return res.body!;
    }
    case "google": {
      const res = await ok(
        await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${env("GOOGLE_TTS_API_KEY")}`, {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode: voiceConfig.google.languageCode, name: voiceConfig.google.voice },
            audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 },
          }),
        }),
        "google",
      );
      const { audioContent } = (await res.json()) as { audioContent: string };
      const wav = Uint8Array.from(atob(audioContent), (c) => c.charCodeAt(0));
      return bytesStream(stripWavHeader(wav));
    }
    case "azure": {
      const region = env("AZURE_SPEECH_REGION");
      const ssml = `<speak version='1.0' xml:lang='en-US'><voice name='${voiceConfig.azure.voice}'>${esc(text)}</voice></speak>`;
      const res = await ok(
        await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
          method: "POST",
          signal,
          headers: {
            "Ocp-Apim-Subscription-Key": env("AZURE_SPEECH_KEY"),
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "raw-24khz-16bit-mono-pcm",
            "User-Agent": "JobGenesis",
          },
          body: ssml,
        }),
        "azure",
      );
      return res.body!;
    }
  }
}

/** Wraps a raw PCM stream into the SSE shape the browser already plays. */
export function pcmToSSE(pcm: ReadableStream<Uint8Array>) {
  const enc = new TextEncoder();
  return pcm.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, c) {
        let bin = "";
        for (let i = 0; i < chunk.length; i += 0x8000) bin += String.fromCharCode(...chunk.subarray(i, i + 0x8000));
        c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "speech.audio.delta", audio: btoa(bin) })}\n\n`));
      },
    }),
  );
}
