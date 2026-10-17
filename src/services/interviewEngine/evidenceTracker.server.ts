import type { DB } from "./context.server";
import type { AnswerAnalysis } from "./answerAnalyzer.server";

/** Persists evidence from one analyzed answer and updates the tested claim's status. */
export async function recordEvidence(
  db: DB,
  input: { interviewId: string; questionId: string; claimId: string | null; analysis: AnswerAnalysis },
) {
  const { interviewId, questionId, claimId, analysis } = input;
  const rows = analysis.evidence
    .filter((e) => e.evidence.trim().length > 0)
    .slice(0, 8)
    .map((e) => ({
      interview_id: interviewId,
      claim_id: claimId,
      skill: e.skill,
      project: e.project,
      evidence: e.evidence.slice(0, 1000),
      evidence_strength: e.strength,
      source_question_id: questionId,
    }));
  if (rows.length) {
    const { error } = await db.from("interview_evidence").insert(rows);
    if (error) throw new Error(`evidence insert: ${error.message}`);
  }

  if (claimId && analysis.claim_status) {
    const { data: existing } = await db
      .from("interview_claim_status")
      .select("id, unanswered, contradictions")
      .eq("interview_id", interviewId)
      .eq("claim_id", claimId)
      .maybeSingle();
    const merge = (prev: unknown, next: string[]) =>
      Array.from(new Set([...((prev as string[]) ?? []), ...next])).slice(-10);
    const payload = {
      interview_id: interviewId,
      claim_id: claimId,
      status: analysis.claim_status,
      confidence: analysis.confidence,
      unanswered: merge(existing?.unanswered, analysis.missing_information),
      contradictions: merge(existing?.contradictions, analysis.contradictions),
      updated_at: new Date().toISOString(),
    };
    const { error } = await db
      .from("interview_claim_status")
      .upsert(payload, { onConflict: "interview_id,claim_id" });
    if (error) throw new Error(`claim status upsert: ${error.message}`);
  }
}
