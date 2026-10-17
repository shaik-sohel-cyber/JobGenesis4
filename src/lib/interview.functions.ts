import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GENERIC = "Something went wrong with the interview. Please try again.";

type Result = { ok: true } | { ok: false; message: string };

/** Creates an interview for a completed, owned resume. Planning runs on the interview page. */
export const startInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        resumeId: z.string().uuid(),
        targetRole: z.string().trim().max(80).optional(),
        jobDescription: z.string().trim().max(8000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; interviewId: string } | { ok: false; message: string }> => {
    const { supabase, userId } = context;
    const { data: resume } = await supabase
      .from("resumes")
      .select("id, user_id, status")
      .eq("id", data.resumeId)
      .maybeSingle();
    if (!resume || resume.user_id !== userId) return { ok: false, message: "We couldn't find that resume." };
    if (resume.status !== "completed")
      return { ok: false, message: "Your resume needs to finish analysis before an interview can start." };

    const { data: row, error } = await supabase
      .from("interviews")
      .insert({
        user_id: userId,
        resume_id: resume.id,
        status: "created",
        mode: "mixed",
        target_role: data.targetRole || null,
        job_description: data.jobDescription?.replace(/\u0000/g, "") || null,
      })
      .select("id")
      .single();
    if (error || !row) {
      console.error("[interview] create failed", error);
      return { ok: false, message: GENERIC };
    }
    return { ok: true, interviewId: row.id };
  });

async function loadOwned(supabase: any, userId: string, interviewId: string) {
  const { data } = await supabase
    .from("interviews")
    .select("id, user_id, resume_id, status, session_state")
    .eq("id", interviewId)
    .maybeSingle();
  return data && data.user_id === userId
    ? (data as { id: string; resume_id: string; status: string; session_state: string })
    : null;
}

const idSchema = z.object({ interviewId: z.string().uuid() });

export const SESSION_STATES = [
  "PREPARING",
  "READY_TO_START",
  "AUDIO_CHECK",
  "AUDIO_FAILED",
  "AUDIO_CONFIRMED",
  "COUNTDOWN",
  "INTERVIEW_ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/** Allowed forward transitions. Pre-interview steps can restart at AUDIO_CHECK (e.g. after a refresh). */
const TRANSITIONS: Record<string, SessionState[]> = {
  PREPARING: ["READY_TO_START", "AUDIO_CHECK"],
  READY_TO_START: ["AUDIO_CHECK"],
  AUDIO_CHECK: ["AUDIO_CONFIRMED", "AUDIO_FAILED"],
  AUDIO_FAILED: ["AUDIO_CHECK"],
  AUDIO_CONFIRMED: ["COUNTDOWN", "AUDIO_CHECK"],
  COUNTDOWN: ["INTERVIEW_ACTIVE", "AUDIO_CHECK"],
  INTERVIEW_ACTIVE: ["COMPLETED"],
};

/** Moves the interview session through the pre-interview handshake. Repeated calls are no-ops. */
export const setSessionState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ interviewId: z.string().uuid(), state: z.enum(SESSION_STATES) }).parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; state: string }> => {
    const { supabase, userId } = context;
    const iv = await loadOwned(supabase, userId, data.interviewId);
    if (!iv) return { ok: false, state: "FAILED" };
    const from = iv.session_state;
    if (from === data.state) return { ok: true, state: from };
    const terminal = from === "COMPLETED" || from === "CANCELLED";
    const allowed =
      !terminal && (data.state === "CANCELLED" || (TRANSITIONS[from] ?? []).includes(data.state));
    if (!allowed) return { ok: false, state: from };

    const patch: { session_state: string; session_updated_at: string; status?: string; ended_at?: string } = { session_state: data.state, session_updated_at: new Date().toISOString() };
    if (data.state === "CANCELLED" || data.state === "COMPLETED") {
      const { count } = await supabase
        .from("interview_answers")
        .select("id", { count: "exact", head: true })
        .eq("interview_id", iv.id);
      patch.session_state = (count ?? 0) > 0 ? "COMPLETED" : "CANCELLED";
      if (iv.status !== "completed") {
        patch.status = (count ?? 0) > 0 ? "completed" : "cancelled";
        patch.ended_at = new Date().toISOString();
      }
    }
    // Compare-and-set so concurrent clicks cause a single transition.
    const { data: upd } = await supabase
      .from("interviews")
      .update(patch)
      .eq("id", iv.id)
      .eq("session_state", from)
      .select("session_state")
      .maybeSingle();
    return { ok: !!upd, state: (upd?.session_state as string) ?? from };
  });

/**
 * Advances the interview. phase "prepare" only builds the blueprint (safe during the device/audio check);
 * phase "interview" also asks the next question, and only once the session is INTERVIEW_ACTIVE. Idempotent.
 */
export const advanceInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ interviewId: z.string().uuid(), phase: z.enum(["prepare", "interview", "analyze"]).default("interview") }).parse(i),
  )
  .handler(async ({ data, context }): Promise<Result> => {
    const { supabase, userId } = context;
    const interview = await loadOwned(supabase, userId, data.interviewId);
    if (!interview) return { ok: false, message: "We couldn't find that interview." };
    if (interview.status === "completed" || interview.status === "cancelled") return { ok: true };
    if (data.phase !== "prepare" && interview.session_state !== "INTERVIEW_ACTIVE")
      return { ok: false, message: "The interview hasn't started yet." };

    const eng = await import("@/services/interviewEngine/orchestrator.server");
    try {
      await eng.runPlanning(supabase, interview);
      if (data.phase === "analyze") {
        // Background pass fired by the client after the next question is shown.
        await eng.runPendingAnalysis(supabase, interview, { skipLatest: true });
        return { ok: true };
      }
      if (data.phase === "interview") {
        // Older answers are normally analyzed already; the latest is analyzed after asking.
        await eng.runPendingAnalysis(supabase, interview, { skipLatest: true });
        await eng.runNextQuestion(supabase, interview);
      }
      return { ok: true };
    } catch (error) {
      const message = eng.friendly(error, GENERIC);
      const { count } = await supabase
        .from("interview_blueprints")
        .select("id", { count: "exact", head: true })
        .eq("interview_id", interview.id);
      await supabase
        .from("interviews")
        .update({ error_message: message, ...((count ?? 0) === 0 ? { status: "failed" } : {}) })
        .eq("id", interview.id);
      return { ok: false, message };
    }
  });

/** Stores the candidate's answer to the current question and analyzes it. Same turnId = same answer. */
export const submitAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        interviewId: z.string().uuid(),
        questionId: z.string().uuid(),
        answer: z.string().trim().min(1).max(6000),
        durationSeconds: z.number().int().min(0).max(36000).nullable(),
        turnId: z.string().min(8).max(80),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<Result> => {
    const { supabase, userId } = context;
    const interview = await loadOwned(supabase, userId, data.interviewId);
    if (!interview || interview.status !== "in_progress" || interview.session_state !== "INTERVIEW_ACTIVE")
      return { ok: false, message: "This interview isn't accepting answers right now." };

    const { data: dup } = await supabase
      .from("interview_answers")
      .select("id")
      .eq("interview_id", interview.id)
      .eq("client_turn_id", data.turnId)
      .maybeSingle();

    if (!dup) {
      // The question must belong to this interview and be the latest, unanswered one.
      const { data: latest } = await supabase
        .from("interview_questions")
        .select("id, category")
        .eq("interview_id", interview.id)
        .order("sequence_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest || latest.id !== data.questionId || latest.category === "closing")
        return { ok: false, message: "That question is no longer active. Please refresh." };

      const { error } = await supabase.from("interview_answers").insert({
        interview_id: interview.id,
        question_id: latest.id,
        transcript: data.answer.replace(/\u0000/g, ""),
        response_duration: data.durationSeconds,
        client_turn_id: data.turnId,
      });
      if (error && error.code !== "23505") {
        console.error("[interview] answer insert", error);
        return { ok: false, message: GENERIC };
      }
    }

    // Analysis is deferred: the next question is asked first, scoring runs in the background.
    return { ok: true };
  });

/** Candidate-facing view of an interview. Never includes evaluation data. */
export const getInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: iv } = await supabase
      .from("interviews")
      .select("id, user_id, resume_id, status, session_state, current_stage, error_message, started_at, ended_at")
      .eq("id", data.interviewId)
      .maybeSingle();
    if (!iv || iv.user_id !== userId) return null;
    const [resume, bp, qs, ans] = await Promise.all([
      supabase.from("resumes").select("file_name").eq("id", iv.resume_id).maybeSingle(),
      supabase.from("interview_blueprints").select("stage, status").eq("interview_id", iv.id).order("order_index"),
      supabase
        .from("interview_questions")
        .select("id, question, category, sequence_number, created_at")
        .eq("interview_id", iv.id)
        .order("sequence_number"),
      supabase.from("interview_answers").select("question_id, transcript, created_at").eq("interview_id", iv.id),
    ]);
    const answers = new Map((ans.data ?? []).map((a) => [a.question_id, a]));
    const messages: Array<{ id: string; role: "ai" | "candidate"; text: string }> = [];
    for (const q of qs.data ?? []) {
      messages.push({ id: q.id, role: "ai", text: q.question });
      const a = answers.get(q.id);
      if (a) messages.push({ id: `${q.id}-a`, role: "candidate", text: a.transcript });
    }
    const questions = (qs.data ?? []).filter((q) => q.category !== "closing");
    const last = (qs.data ?? []).at(-1);
    const blueprint = bp.data ?? [];
    return {
      id: iv.id,
      resumeId: iv.resume_id,
      resumeName: resume.data?.file_name ?? "Resume",
      status: iv.status,
      sessionState: iv.session_state as string,
      currentStage: iv.current_stage,
      errorMessage: iv.error_message,
      startedAt: iv.started_at,
      questionCount: questions.length,
      progress: blueprint.length
        ? blueprint.filter((b) => b.status === "completed" || b.status === "skipped").length / blueprint.length
        : 0,
      stages: [...new Set(blueprint.map((b) => b.stage))],
      pendingQuestionId: last && !answers.has(last.id) && last.category !== "closing" ? last.id : null,
      awaitingAnalysis: !!last && answers.has(last.id),
      messages,
    };
  });

/** Lists the user's interviews for the dashboard. */
export const listInterviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("interviews")
      .select("id, status, started_at, resume_id, resumes(file_name)")
      .order("created_at", { ascending: false })
      .limit(10);
    return (data ?? []).map((i: any) => ({
      id: i.id as string,
      status: i.status as string,
      startedAt: i.started_at as string,
      resumeName: (i.resumes?.file_name as string | undefined) ?? "Resume",
    }));
  });
