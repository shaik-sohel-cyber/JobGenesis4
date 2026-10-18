import { loadResumeContext, type DB } from "./context.server";
import { createInterviewBlueprint } from "./interviewPlanner.server";
import { generateInterviewQuestion } from "./questionGenerator.server";
import { analyzeInterviewAnswer, type AnswerAnalysis } from "./answerAnalyzer.server";
import { recordEvidence } from "./evidenceTracker.server";
import { loadInterviewState } from "./interviewStateManager.server";
import { decideNextStep } from "./followUpEngine";
import { InterviewAIError } from "./ai.server";
import { loadRoleContext, roleBlock } from "./roleContext.server";

const CLOSING_TEXT =
  "Thank you — that covers everything I wanted to explore today. I appreciate you walking me through your work in such detail. This interview is now complete.";

/** The interview always opens with a warm, deterministic greeting — no AI call spent on small talk. */
function greetingText(candidateName: string | null) {
  const hi = candidateName ? `Hi ${candidateName}` : "Hi there";
  return `${hi}, welcome — and thanks for taking the time today. I'll be your interviewer. This is a relaxed conversation about your background and the work on your resume, roughly 15 to 20 minutes. Nothing tricky — just answer naturally, like you would with a colleague. Before we dive in: how are you doing today?`;
}

/** Instant stand-in for the AI analysis, used only to pick follow-up vs. next topic. */
function quickAnalysis(transcript: string) {
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  const thin = words < 35;
  return {
    quality: thin ? "weak" : "adequate",
    follow_up_required: thin,
    follow_up_reason: thin ? "The answer was brief; invite more concrete detail" : "",
    recommended_direction: thin
      ? "Ask for a specific example, their exact role, and how it was implemented"
      : "",
    contradictions: [] as string[],
    unsupported_claims: [] as string[],
  };
}

export function friendly(error: unknown, fallback: string) {
  if (error instanceof InterviewAIError) return error.message;
  console.error("[interview] unexpected", error);
  return fallback;
}

type Interview = { id: string; resume_id: string; status: string };

/** Planning: builds and stores the blueprint. Idempotent. */
export async function runPlanning(db: DB, interview: Interview) {
  if (interview.status === "ready" || interview.status === "in_progress") return;
  const { count } = await db
    .from("interview_blueprints")
    .select("id", { count: "exact", head: true })
    .eq("interview_id", interview.id);
  if ((count ?? 0) > 0) return;

  await db
    .from("interviews")
    .update({ status: "planning", error_message: null })
    .eq("id", interview.id);
  const [ctx, role] = await Promise.all([
    loadResumeContext(db, interview.resume_id),
    loadRoleContext(db, interview.id),
  ]);
  const plan = await createInterviewBlueprint(ctx, roleBlock(role));
  const rows = plan.items.map((item, i) => ({
    interview_id: interview.id,
    stage: item.stage,
    objective: item.objective,
    target_skill: item.target_skill,
    target_project: item.target_project,
    target_claim_id:
      item.target_claim_index !== null ? ctx.claims[item.target_claim_index]!.id : null,
    difficulty: item.difficulty,
    order_index: i,
    status: "pending",
  }));
  const { error } = await db.from("interview_blueprints").insert(rows);
  if (error) throw new Error(`blueprint insert: ${error.message}`);
  await db
    .from("interviews")
    .update({
      status: "ready",
      mode: plan.mode,
      current_stage: rows[0]?.stage ?? null,
      required_skills: [
        ...new Set(plan.required_skills.map((s) => s.trim()).filter(Boolean)),
      ].slice(0, 15),
    })
    .eq("id", interview.id);
}

/** Analyzes any answered question whose analysis is missing (also used for retries). */
export async function runPendingAnalysis(
  db: DB,
  interview: Interview,
  opts: { skipLatest?: boolean } = {},
) {
  const ctx = await loadResumeContext(db, interview.resume_id);
  const state = await loadInterviewState(db, interview.id, ctx.candidateName);
  const latestId = state.questions.at(-1)?.id;
  for (const q of state.questions) {
    if (opts.skipLatest && q.id === latestId) continue;
    const a = state.answerByQ.get(q.id);
    // The greeting (no blueprint item) is small talk: stored and shown, never analyzed.
    if (!a || a.answer_quality || !q.blueprint_id) continue;
    const claim = q.target_claim_id
      ? (ctx.claims.find((c) => c.id === q.target_claim_id)?.claim ?? null)
      : null;
    const history = state.transcriptText.split(`Interviewer: ${q.question}`)[0] ?? "";
    const analysis = await analyzeInterviewAnswer({
      question: q.question,
      answer: a.transcript,
      objective: q.objective,
      claim,
      resumeSummary: ctx.summary,
      transcriptText: history,
    });
    await recordEvidence(db, {
      interviewId: interview.id,
      questionId: q.id,
      claimId: q.target_claim_id,
      analysis,
    });
    const { error } = await db
      .from("interview_answers")
      .update({
        answer_quality: analysis,
        evidence: analysis.evidence,
        follow_up_required: analysis.follow_up_required,
      })
      .eq("id", a.id);
    if (error) throw new Error(`answer update: ${error.message}`);
  }
}

export type NextInterviewQuestion = { id: string; text: string; closing: boolean };

/** Decides and writes the next single question, or completes the interview. */
export async function runNextQuestion(db: DB, interview: Interview) {
  const [ctx, state, role] = await Promise.all([
    loadResumeContext(db, interview.resume_id),
    loadInterviewState(db, interview.id, null),
    loadRoleContext(db, interview.id),
  ]);
  state.candidateName = ctx.candidateName;
  const last = state.questions.at(-1);
  if (last && (!state.answerByQ.has(last.id) || last.category === "closing")) {
    return { id: last.id, text: last.question, closing: last.category === "closing" }; // already waiting
  }

  // First turn: open with the greeting before touching the blueprint.
  if (!last) {
    const { data: existing, error: lookupError } = await db
      .from("interview_questions")
      .select("id, question, category")
      .eq("interview_id", interview.id)
      .eq("sequence_number", 1)
      .maybeSingle();
    if (lookupError) throw new Error(`greeting lookup: ${lookupError.message}`);
    if (existing) {
      return { id: existing.id, text: existing.question, closing: existing.category === "closing" };
    }
    const { data: greeting, error } = await db
      .from("interview_questions")
      .insert({
        interview_id: interview.id,
        question: greetingText(ctx.candidateName),
        category: "introduction",
        difficulty: "easy",
        sequence_number: 1,
        depth_level: 1,
      })
      .select("id, question, category")
      .single();
    if (error) throw new Error(`greeting insert: ${error.message}`);
    await db
      .from("interviews")
      .update({ status: "in_progress", current_stage: "introduction", error_message: null })
      .eq("id", interview.id);
    return { id: greeting.id, text: greeting.question, closing: greeting.category === "closing" };
  }

  // Speed: the deep analysis of the latest answer runs after the next question is asked.
  // Until it lands, a cheap length heuristic decides whether to probe deeper.
  const lastAnswer = state.answerByQ.get(last.id);
  const lastAnalysis =
    (lastAnswer?.answer_quality as AnswerAnalysis | null) ??
    (last.blueprint_id ? quickAnalysis(lastAnswer?.transcript ?? "") : null);
  let active = state.blueprint.find((b) => b.status === "active") ?? null;
  const pending = state.blueprint.filter((b) => b.status === "pending");
  const followUpsOnItem = active
    ? state.questions.filter((q) => q.blueprint_id === active!.id && q.parent_question_id).length
    : 0;

  const importantClaimIds = new Set(
    ctx.claims.filter((c) => c.verification_priority === "high").map((c) => c.id),
  );
  const settled = new Set(
    state.claimStatus
      .filter(
        (c) =>
          c.status === "Supported by interview evidence" || c.status === "Partially demonstrated",
      )
      .map((c) => c.claim_id),
  );
  const unverifiedImportant = state.blueprint.filter(
    (b) =>
      b.target_claim_id &&
      importantClaimIds.has(b.target_claim_id) &&
      !settled.has(b.target_claim_id),
  ).length;

  const step = last
    ? decideNextStep({
        questionsAsked: state.questions.length,
        followUpsOnItem,
        lastDepth: last.depth_level,
        analysis: lastAnalysis,
        remainingItems: pending.length,
        unverifiedImportantClaims: unverifiedImportant,
      })
    : ({ kind: "next_item" } as const);

  if (step.kind === "finish") {
    await runPendingAnalysis(db, interview); // the report needs every answer analyzed
    if (active)
      await db.from("interview_blueprints").update({ status: "completed" }).eq("id", active.id);
    await db
      .from("interview_blueprints")
      .update({ status: "skipped" })
      .eq("interview_id", interview.id)
      .eq("status", "pending");
    const { data: closing, error } = await db
      .from("interview_questions")
      .insert({
        interview_id: interview.id,
        question: CLOSING_TEXT,
        category: "closing",
        difficulty: "easy",
        sequence_number: state.questions.length + 1,
        depth_level: 1,
      })
      .select("id, question, category")
      .single();
    if (error) throw new Error(`closing insert: ${error.message}`);
    await db
      .from("interviews")
      .update({
        status: "completed",
        current_stage: "closing",
        ended_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", interview.id);
    return { id: closing.id, text: closing.question, closing: true };
  }

  let depth = 1;
  let followUp: { reason: string; direction: string } | null = null;
  if (step.kind === "follow_up" && active) {
    depth = step.depth;
    followUp = { reason: step.reason, direction: step.direction };
  } else {
    if (active)
      await db.from("interview_blueprints").update({ status: "completed" }).eq("id", active.id);
    // If blueprint is exhausted but minimum not reached, reopen a technical-depth pass on the last item.
    active =
      pending[0] ??
      state.blueprint.filter((b) => b.stage !== "introduction").at(-1) ??
      state.blueprint.at(-1) ??
      null;
    if (!active) throw new Error("empty blueprint");
    await db.from("interview_blueprints").update({ status: "active" }).eq("id", active.id);
    const asked = state.questions.filter((q) => q.blueprint_id === active!.id);
    depth = asked.length
      ? Math.min(6, Math.max(...asked.map((q) => q.depth_level)) + 1)
      : active.stage === "technical_depth"
        ? 3
        : 1;
  }

  const claim = active.target_claim_id
    ? (ctx.claims.find((c) => c.id === active!.target_claim_id)?.claim ?? null)
    : null;
  const q = await generateInterviewQuestion({
    state,
    resumeContext: ctx,
    role: roleBlock(role, 2000),
    item: {
      stage: active.stage,
      objective: active.objective,
      target_skill: active.target_skill,
      target_project: active.target_project,
      claim,
    },
    depthLevel: depth,
    followUp,
  });

  // Guard against a concurrent duplicate.
  const { data: existing, error: lookupError } = await db
    .from("interview_questions")
    .select("id, question, category")
    .eq("interview_id", interview.id)
    .eq("sequence_number", state.questions.length + 1)
    .maybeSingle();
  if (lookupError) throw new Error(`question lookup: ${lookupError.message}`);
  if (existing) {
    return { id: existing.id, text: existing.question, closing: existing.category === "closing" };
  }

  const { data: question, error } = await db
    .from("interview_questions")
    .insert({
      interview_id: interview.id,
      blueprint_id: active.id,
      parent_question_id: followUp ? last!.id : null,
      question: q.question,
      category: followUp && q.category !== "clarification" ? "follow_up" : q.category,
      difficulty: q.difficulty,
      objective: active.objective,
      target_skill: active.target_skill,
      target_claim_id: active.target_claim_id,
      depth_level: depth,
      sequence_number: state.questions.length + 1,
    })
    .select("id, question, category")
    .single();
  if (error) throw new Error(`question insert: ${error.message}`);
  await db
    .from("interviews")
    .update({ status: "in_progress", current_stage: active.stage, error_message: null })
    .eq("id", interview.id);
  return { id: question.id, text: question.question, closing: question.category === "closing" };
}
