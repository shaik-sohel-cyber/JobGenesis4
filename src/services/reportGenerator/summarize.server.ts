import { z } from "zod";
import type { ReportData, ReportSummary } from "./types";

const validator = z.object({
  overview: z.string(),
  strengths: z.array(z.string()),
  areasToExplore: z.array(z.string()),
  evidenceLevel: z.enum(["Strong", "Moderate", "Limited"]),
});

/** One AI call that writes the neutral summary from already-saved interview data. */
export async function summarizeReport(data: ReportData): Promise<ReportSummary> {
  const { callStructured, stringArray } = await import("../interviewEngine/ai.server");
  const compact = {
    questions: data.questions.map((q) => ({ q: q.question, a: q.answer?.slice(0, 1200) ?? null, quality: q.quality })),
    evidence: data.evidence,
    claims: data.claims.map((c) => ({ claim: c.claim, status: c.status, confidence: c.confidence })),
  };
  return callStructured({
    name: "interview_report_summary",
    system: `You write the summary section of an interview report for a hiring team.
Rules:
- Base every statement only on the provided questions, answers, evidence and claim statuses.
- Neutral, factual language. Never say or imply the candidate lied, exaggerated or was dishonest; describe gaps as "not yet demonstrated" or "worth exploring further".
- Never comment on emotions, nervousness, confidence, personality or honesty.
- overview: 3-5 sentences. strengths: up to 5 short bullets. areasToExplore: up to 5 short bullets.
- evidenceLevel: overall strength of evidence gathered (Strong, Moderate or Limited).`,
    user: JSON.stringify(compact),
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["overview", "strengths", "areasToExplore", "evidenceLevel"],
      properties: {
        overview: { type: "string" },
        strengths: stringArray,
        areasToExplore: stringArray,
        evidenceLevel: { type: "string", enum: ["Strong", "Moderate", "Limited"] },
      },
    },
    validator,
  });
}
