import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function owned(supabase: any, userId: string, interviewId: string) {
  const { data } = await supabase.from("interviews").select("id, user_id, session_state").eq("id", interviewId).maybeSingle();
  return data && data.user_id === userId ? (data as { id: string; session_state: string }) : null;
}

const CAMERA_STATES = ["CAMERA_NOT_REQUESTED", "REQUESTING_CAMERA", "CAMERA_GRANTED", "CAMERA_READY", "CAMERA_DENIED", "CAMERA_UNAVAILABLE", "CAMERA_ERROR"] as const;

export const setCameraConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ interviewId: z.string().uuid(), consent: z.enum(["granted", "declined"]).nullable(), cameraState: z.enum(CAMERA_STATES) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const iv = await owned(context.supabase, context.userId, data.interviewId);
    if (!iv) return { ok: false };
    const { error } = await context.supabase
      .from("interviews")
      .update({ camera_consent: data.consent, camera_state: data.cameraState })
      .eq("id", iv.id);
    return { ok: !error };
  });

const eventSchema = z.object({
  clientEventId: z.string().min(8).max(80),
  type: z.enum(["FACE_NOT_VISIBLE", "FACE_PARTIALLY_VISIBLE", "FACE_OCCLUDED", "MULTIPLE_FACES_DETECTED", "LOOKING_AWAY", "HEAD_TURNED_AWAY", "HEAD_MOVEMENT", "POOR_FRAMING", "LOW_LIGHT", "CAMERA_INTERRUPTED", "CAMERA_RECOVERED"]),
  startedAt: z.string().datetime(),
  durationMs: z.number().int().min(0).max(4 * 3600 * 1000),
  confidence: z.number().min(0).max(1).nullable(),
  details: z.record(z.string(), z.union([z.string().max(60), z.number(), z.boolean()])).refine((d) => Object.keys(d).length <= 8),
  questionId: z.string().uuid().nullable(),
  sessionState: z.string().max(40),
});

/** Stores observed visual events. Only accepted while the interview is active; duplicates are ignored. */
export const recordVisualEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ interviewId: z.string().uuid(), events: z.array(eventSchema).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const iv = await owned(context.supabase, context.userId, data.interviewId);
    if (!iv || iv.session_state !== "INTERVIEW_ACTIVE" || !data.events.length) return { ok: false };
    let qids = new Set<string>();
    const asked = [...new Set(data.events.map((e) => e.questionId).filter(Boolean))] as string[];
    if (asked.length) {
      const { data: qs } = await context.supabase.from("interview_questions").select("id").eq("interview_id", iv.id).in("id", asked);
      qids = new Set((qs ?? []).map((q) => q.id));
    }
    const rows = data.events.map((e) => ({
      interview_id: iv.id,
      question_id: e.questionId && qids.has(e.questionId) ? e.questionId : null,
      client_event_id: e.clientEventId,
      event_type: e.type,
      started_at: e.startedAt,
      duration_ms: e.durationMs,
      confidence: e.confidence,
      details: e.details,
      session_state: e.sessionState,
    }));
    const { error } = await context.supabase
      .from("interview_visual_events")
      .upsert(rows, { onConflict: "interview_id,client_event_id", ignoreDuplicates: true });
    if (error) console.error("[webcam] events insert", error);
    return { ok: !error };
  });

export const upsertVisualSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        interviewId: z.string().uuid(),
        questionId: z.string().uuid(),
        metrics: z.object({
          samples: z.number().int().min(0),
          faceVisiblePct: z.number().min(0).max(100),
          lookingAwayPct: z.number().min(0).max(100),
          headTurnedPct: z.number().min(0).max(100),
          lookingAwayMs: z.number().int().min(0),
          multipleFacesMs: z.number().int().min(0),
          events: z.record(z.string().max(40), z.number().int().min(0)),
        }),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const iv = await owned(context.supabase, context.userId, data.interviewId);
    if (!iv || iv.session_state !== "INTERVIEW_ACTIVE") return { ok: false };
    const { data: q } = await context.supabase.from("interview_questions").select("id").eq("id", data.questionId).eq("interview_id", iv.id).maybeSingle();
    if (!q) return { ok: false };
    const { error } = await context.supabase
      .from("interview_visual_summaries")
      .upsert({ interview_id: iv.id, question_id: q.id, metrics: data.metrics }, { onConflict: "interview_id,question_id" });
    return { ok: !error };
  });
