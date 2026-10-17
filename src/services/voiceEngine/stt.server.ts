/** Third-party speech-to-text adapters. Audio is forwarded only — never stored. */
import { voiceConfig, type SttProviderId } from "./voiceConfig";
import { UpstreamError } from "./tts.server";

const env = (k: string) => process.env[k] || "";

async function ok(res: Response, name: string) {
  if (!res.ok) {
    console.error(`[voice] ${name} stt failed`, res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new UpstreamError(res.status, name);
  }
  return res;
}

export async function transcribe(
  provider: Exclude<SttProviderId, "lovable">,
  file: File,
  signal: AbortSignal,
): Promise<string> {
  switch (provider) {
    case "deepgram": {
      const res = await ok(
        await fetch(`https://api.deepgram.com/v1/listen?model=${voiceConfig.deepgram.sttModel}&smart_format=true&language=${voiceConfig.language}`, {
          method: "POST",
          signal,
          headers: { Authorization: `Token ${env("DEEPGRAM_API_KEY")}`, "Content-Type": file.type || "audio/webm" },
          body: file,
        }),
        "deepgram",
      );
      const j: any = await res.json();
      return j?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    }
    case "groq": {
      const f = new FormData();
      f.append("model", voiceConfig.groq.model);
      f.append("file", file);
      f.append("language", voiceConfig.language);
      f.append("response_format", "json");
      const res = await ok(
        await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          signal,
          headers: { Authorization: `Bearer ${env("GROQ_API_KEY")}` },
          body: f,
        }),
        "groq",
      );
      return ((await res.json()) as any).text ?? "";
    }
    case "elevenlabs": {
      const f = new FormData();
      f.append("model_id", voiceConfig.elevenlabs.sttModel);
      f.append("file", file);
      const res = await ok(
        await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          signal,
          headers: { "xi-api-key": env("ELEVENLABS_API_KEY") },
          body: f,
        }),
        "elevenlabs",
      );
      return ((await res.json()) as any).text ?? "";
    }
    case "assemblyai": {
      const key = env("ASSEMBLYAI_API_KEY");
      const up: any = await (
        await ok(
          await fetch("https://api.assemblyai.com/v2/upload", { method: "POST", signal, headers: { authorization: key }, body: file }),
          "assemblyai",
        )
      ).json();
      const job: any = await (
        await ok(
          await fetch("https://api.assemblyai.com/v2/transcript", {
            method: "POST",
            signal,
            headers: { authorization: key, "Content-Type": "application/json" },
            body: JSON.stringify({ audio_url: up.upload_url, language_code: voiceConfig.language }),
          }),
          "assemblyai",
        )
      ).json();
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const s: any = await (
          await ok(await fetch(`https://api.assemblyai.com/v2/transcript/${job.id}`, { signal, headers: { authorization: key } }), "assemblyai")
        ).json();
        if (s.status === "completed") return s.text ?? "";
        if (s.status === "error") throw new UpstreamError(502, "assemblyai");
      }
      throw new UpstreamError(504, "assemblyai");
    }
  }
}
