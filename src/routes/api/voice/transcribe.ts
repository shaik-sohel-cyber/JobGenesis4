import { createFileRoute } from "@tanstack/react-router";
import { voiceConfig, type SttProviderId } from "@/services/voiceEngine/voiceConfig";

const MAX = 12 * 1024 * 1024;
const SSE = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" };
const STT: Array<SttProviderId | "auto"> = ["auto", "lovable", "deepgram", "groq", "assemblyai", "elevenlabs"];

/** Transcribes one spoken segment. Audio is forwarded only — never stored. */
export const Route = createFileRoute("/api/voice/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        const interviewId = form?.get("interviewId");
        const provider = (form?.get("provider") ?? "auto") as SttProviderId | "auto";
        if (!(file instanceof File) || typeof interviewId !== "string" || !STT.includes(provider))
          return new Response("Bad request", { status: 400 });
        if (!file.size || file.size > MAX) return new Response("Bad audio", { status: 400 });
        const { verifyVoiceCaller, GATEWAY } = await import("@/services/voiceEngine/voiceAuth.server");
        const caller = await verifyVoiceCaller(request, interviewId);
        if (!caller) return new Response("Unauthorized", { status: 401 });

        const type = file.type.replace(/^video\//, "audio/") || "audio/webm";
        const audio = new File([file], "answer.webm", { type: type.startsWith("audio/") ? type : "audio/webm" });

        if (provider === "auto") {
          const { enabledProviders, UpstreamError } = await import("@/services/voiceEngine/tts.server");
          const { transcribe } = await import("@/services/voiceEngine/stt.server");
          const enabled = enabledProviders();
          const providers = voiceConfig.sttOrder.filter(
            (id): id is Exclude<SttProviderId, "lovable"> => id !== "lovable" && enabled.stt[id],
          );
          for (const candidate of providers) {
            try {
              const text = await transcribe(candidate, audio, request.signal);
              return new Response(
                `data: ${JSON.stringify({ type: "transcript.text.done", text })}\n\n`,
                { headers: SSE },
              );
            } catch (error) {
              if (request.signal.aborted) return new Response("Transcription cancelled", { status: 499 });
              if (!(error instanceof UpstreamError)) {
                console.error(`[voice] ${candidate} STT failed`, error);
              }
            }
          }
          if (!enabled.stt.lovable) return new Response("Transcription unavailable", { status: 503 });
        } else if (provider !== "lovable") {
          const { enabledProviders, UpstreamError } = await import("@/services/voiceEngine/tts.server");
          if (!enabledProviders().stt[provider]) return new Response("Provider not enabled", { status: 503 });
          const { transcribe } = await import("@/services/voiceEngine/stt.server");
          try {
            const text = await transcribe(provider, audio, request.signal);
            return new Response(`data: ${JSON.stringify({ type: "transcript.text.done", text })}\n\n`, { headers: SSE });
          } catch (e) {
            const s = e instanceof UpstreamError ? e.status : 502;
            return new Response("Transcription unavailable", { status: s === 429 ? 429 : 503 });
          }
        }

        const out = new FormData();
        out.append("model", voiceConfig.transcriptionModel);
        out.append("file", audio);
        out.append("response_format", "json");
        out.append("stream", "true");
        out.append("language", voiceConfig.language);
        const upstream = await fetch(`${GATEWAY}/v1/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env['LOVABLE_API_KEY']}` },
          body: out,
          signal: request.signal,
        });
        if (!upstream.ok || !upstream.body) {
          console.error("[voice] stt failed", upstream.status, await upstream.text().catch(() => ""));
          return new Response("Transcription unavailable", { status: upstream.status === 429 ? 429 : 503 });
        }
        return new Response(upstream.body, { headers: SSE });
      },
    },
  },
});
