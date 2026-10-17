import { createFileRoute } from "@tanstack/react-router";

/** Returns only which voice services are enabled (booleans). No keys, no user data. */
export const Route = createFileRoute("/api/voice/providers")({
  server: {
    handlers: {
      GET: async () => {
        const { enabledProviders } = await import("@/services/voiceEngine/tts.server");
        return Response.json(enabledProviders(), { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
