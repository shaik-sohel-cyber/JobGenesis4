import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { voiceConfig } from "@/services/voiceEngine/voiceConfig";

const Body = z.object({
  interviewId: z.string().uuid(),
  text: z.string().min(1).max(2000),
  provider: z.enum(["lovable", "cartesia", "elevenlabs", "deepgram", "google", "azure", "kokoro"]).default("lovable"),
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
        const { provider, text } = parsed.data;

        if (provider !== "lovable") {
          const tts = await import("@/services/voiceEngine/tts.server");
          if (!tts.enabledProviders().tts[provider]) return new Response("Provider not enabled", { status: 503 });
          try {
            const pcm = await tts.synthesize(provider, text, request.signal);
            return new Response(tts.pcmToSSE(pcm), { headers: SSE });
          } catch (e) {
            const s = e instanceof tts.UpstreamError ? e.status : 0;
            // Bad key or used-up credits: skip this service for now; the browser falls back to the next one.
            if (s === 401 || s === 402 || s === 403) {
              tts.bench(provider);
              return new Response("Provider not enabled", { status: 503 });
            }
            if (s === 429) return new Response("Voice busy", { status: 429 });
            return new Response("Voice unavailable", { status: 503 });
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
