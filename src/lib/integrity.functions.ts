import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const INTEGRITY_KINDS = ["tab_hidden", "window_blur", "paste", "slow_start"] as const;

const eventSchema = z.object({
  clientEventId: z.string().min(8).max(80),
  kind: z.enum(INTEGRITY_KINDS),
  durationMs: z.number().int().min(0).max(4 * 3600 * 1000),
  questionId: z.string().uuid().nullable(),
  detail: z.record(z.string(), z.union([z.string().max(60), z.number(), z.boolean()])).refine((d) => Object.keys(d).length <= 6),
});

/** Stores neutral integrity observations. Accepted only while the interview is live; duplicates ignored. */
export const recordIntegrityEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ interviewId: z.string().uuid(), events: z.array(eventSchema).max(100) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: iv } = await supabase.from("interviews").select("id, user_id, session_state").eq("id", data.interviewId).maybeSingle();
    if (!iv || iv.user_id !== userId || iv.session_state !== "INTERVIEW_ACTIVE" || !data.events.length) return { ok: false };
    const asked = [...new Set(data.events.map((e) => e.questionId).filter(Boolean))] as string[];
    let qids = new Set<string>();
    if (asked.length) {
      const { data: qs } = await supabase.from("interview_questions").select("id").eq("interview_id", iv.id).in("id", asked);
      qids = new Set((qs ?? []).map((q) => q.id));
    }
    const { error } = await supabase.from("interview_integrity_events").upsert(
      data.events.map((e) => ({
        interview_id: iv.id,
        client_event_id: e.clientEventId,
        kind: e.kind,
        duration_ms: e.durationMs,
        question_id: e.questionId && qids.has(e.questionId) ? e.questionId : null,
        detail: e.detail,
      })),
      { onConflict: "interview_id,client_event_id", ignoreDuplicates: true },
    );
    if (error) console.error("[integrity] insert", error);
    return { ok: !error };
  });
