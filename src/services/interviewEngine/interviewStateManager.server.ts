import type { DB } from "./context.server";

/** Builds the internal interview state from the database. Never sent to the client. */
export async function loadInterviewState(db: DB, interviewId: string, candidateName: string | null) {
  const [bp, qs, ans, ev, cs] = await Promise.all([
    db.from("interview_blueprints").select("*").eq("interview_id", interviewId).order("order_index"),
    db.from("interview_questions").select("*").eq("interview_id", interviewId).order("sequence_number"),
    db.from("interview_answers").select("*").eq("interview_id", interviewId),
    db.from("interview_evidence").select("*").eq("interview_id", interviewId).order("created_at"),
    db.from("interview_claim_status").select("*").eq("interview_id", interviewId),
  ]);
  const blueprint = bp.data ?? [];
  const questions = qs.data ?? [];
  const answers = ans.data ?? [];
  const evidence = ev.data ?? [];
  const claimStatus = cs.data ?? [];
  const answerByQ = new Map(answers.map((a) => [a.question_id, a]));

  const transcriptText = questions
    .map((q) => {
      const a = answerByQ.get(q.id);
      return `Interviewer: ${q.question}\nCandidate: ${a ? a.transcript.slice(0, 1500) : "(no answer yet)"}`;
    })
    .slice(-14)
    .join("\n\n");
  const earlier = questions.length > 14
    ? `Earlier questions (already asked): ${questions.slice(0, -14).map((q) => q.question).join(" | ")}\n\n`
    : "";

  const active = blueprint.find((b) => b.status === "active") ?? null;
  const topicsCovered = answers.flatMap((a) => {
    const q = a.answer_quality as { topics_covered?: string[] } | null;
    return q?.topics_covered ?? [];
  });
  const testedClaims = new Set(questions.map((q) => q.target_claim_id).filter(Boolean) as string[]);

  return {
    candidateName,
    blueprint,
    questions,
    answers,
    answerByQ,
    claimStatus,
    // Spec-shaped internal state
    current_stage: active?.stage ?? null,
    current_objective: active?.objective ?? null,
    questions_asked: questions.map((q) => q.question),
    answers_received: answers.length,
    claims_tested: [...testedClaims],
    claims_remaining: blueprint
      .filter((b) => b.target_claim_id && b.status === "pending")
      .map((b) => b.target_claim_id as string),
    skills_tested: [...new Set(questions.map((q) => q.target_skill).filter(Boolean) as string[])],
    projects_tested: [...new Set(blueprint.filter((b) => b.status !== "pending").map((b) => b.target_project).filter(Boolean) as string[])],
    evidence_collected: evidence.map((e) => ({ evidence: e.evidence, strength: e.evidence_strength })),
    follow_ups_used: questions.filter((q) => q.parent_question_id).length,
    topics_to_avoid: [...new Set(topicsCovered)].slice(-30),
    interview_progress: `${blueprint.filter((b) => b.status === "completed").length}/${blueprint.length}`,
    transcriptText: earlier + transcriptText,
  };
}
export type InterviewState = Awaited<ReturnType<typeof loadInterviewState>>;
