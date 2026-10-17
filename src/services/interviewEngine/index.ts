/**
 * Interview Intelligence Engine (Phase 2, text-based).
 * Server-only modules (*.server.ts) are dynamically imported by
 * src/lib/interview.functions.ts: interviewPlanner, questionGenerator,
 * answerAnalyzer, followUpEngine, evidenceTracker, interviewStateManager.
 */
export const interviewEngine = {
  status: "available" as const,
};
export * from "./types";
