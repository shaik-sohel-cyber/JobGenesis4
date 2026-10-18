import { createFileRoute } from "@tanstack/react-router";
import { isAdminRequest } from "@/lib/admin-auth.server";

/** Admin-only voice provider configuration status. Never returns provider keys. */
export const Route = createFileRoute("/api/voice/providers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAdminRequest(request))) {
          return new Response("Forbidden", {
            status: 403,
            headers: { "Cache-Control": "no-store" },
          });
        }
        const { enabledProviders } = await import("@/services/voiceEngine/tts.server");
        return Response.json(enabledProviders(), { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
