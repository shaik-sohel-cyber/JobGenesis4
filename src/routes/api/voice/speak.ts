import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { voiceConfig, type TtsProviderId } from "@/services/voiceEngine/voiceConfig";

const Body = z.object({
  interviewId: z.string().uuid(),
  text: z.string().min(1).max(2000),
  provider: z.enum(["auto", "lovable", "cartesia", "elevenlabs", "deepgram", "google", "azure", "kokoro"]).default("auto"),
});

const SSE = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" };

export const Route = createFileRoute("/api/voice/speak")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const { verifyVoiceCaller, GATEWAY } = await import("@/services/voiceEngine/voiceAuth.server");
        const caller = await verifyVoiceCaller(request, parsed.data.interviewId);
        if (!caller) return new Response("Unauthorized", { status: 401 });
        let { provider } = parsed.data;
        const { text } = parsed.data;

        if (provider !== "lovable") {
          const tts = await import("@/services/voiceEngine/tts.server");
          const enabled = tts.enabledProviders();
          if (provider === "auto") {
            const providers = voiceConfig.ttsOrder.filter(
              (id): id is Exclude<TtsProviderId, "browser" | "lovable"> =>
                id !== "browser" && id !== "lovable",
            );
            for (const candidate of providers) {
              if (!enabled.tts[candidate]) continue;
              try {
                const pcm = await tts.synthesize(candidate, text, request.signal);
                return new Response(tts.pcmToSSE(pcm), { headers: SSE });
              } catch (error) {
                if (request.signal.aborted) return new Response("Voice request cancelled", { status: 499 });
                if (error instanceof tts.UpstreamError) {
                  if ([401, 402, 403, 429].includes(error.status)) tts.bench(candidate);
                } else {
                  console.error(`[voice] ${candidate} TTS failed`, error);
                }
              }
            }
            if (!enabled.tts.lovable) return new Response("Voice unavailable", { status: 503 });
            provider = "lovable";
          } else {
            if (!enabled.tts[provider]) return new Response("Provider not enabled", { status: 503 });
            try {
              const pcm = await tts.synthesize(provider, text, request.signal);
              return new Response(tts.pcmToSSE(pcm), { headers: SSE });
            } catch (error) {
              const status = error instanceof tts.UpstreamError ? error.status : 0;
              if ([401, 402, 403].includes(status)) {
                tts.bench(provider);
                return new Response("Provider not enabled", { status: 503 });
              }
              if (status === 429) return new Response("Voice busy", { status: 429 });
              return new Response("Voice unavailable", { status: 503 });
            }
          }
        }

        const upstream = await fetch(`${GATEWAY}/v1/audio/speech`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env['LOVABLE_API_KEY']}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: voiceConfig.model,
            contents: [{ role: "user", parts: [{ text: `Say in a ${voiceConfig.style} tone: ${text}` }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceConfig.voiceId } } },
            },
            stream_format: "sse",
          }),
          signal: request.signal,
        });
        if (!upstream.ok || !upstream.body) {
          console.error("[voice] tts failed", upstream.status, await upstream.text().catch(() => ""));
          return new Response("Voice unavailable", { status: upstream.status === 429 ? 429 : 503 });
        }
        return new Response(upstream.body, { headers: SSE });
      },
    },
  },
});
