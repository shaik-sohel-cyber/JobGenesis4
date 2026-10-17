import { MAX_QUESTIONS, MIN_QUESTIONS } from "./types";

const MAX_FOLLOW_UPS_PER_ITEM = 3;
const MAX_DEPTH = 6;

export type NextStep =
  | { kind: "follow_up"; reason: string; direction: string; depth: number }
  | { kind: "next_item" }
  | { kind: "finish"; reason: string };

/**
 * generateFollowUp decision — pure logic combining the answer analysis with
 * interview-level limits and coverage to decide what happens next.
 */
export function decideNextStep(input: {
  questionsAsked: number;
  followUpsOnItem: number;
  lastDepth: number;
  analysis: {
    quality: string;
    follow_up_required: boolean;
    follow_up_reason: string;
    recommended_direction: string;
    contradictions: string[];
    unsupported_claims: string[];
  } | null;
  remainingItems: number;
  unverifiedImportantClaims: number;
}): NextStep {
  const { questionsAsked, analysis } = input;
  if (questionsAsked >= MAX_QUESTIONS) return { kind: "finish", reason: "max_questions" };

  const wantsFollowUp =
    !!analysis &&
    (analysis.follow_up_required || analysis.contradictions.length > 0) &&
    analysis.quality !== "strong";
  // A strong answer that introduced a new unexplained claim may still warrant one probe.
  const probeNewClaim =
    !!analysis && analysis.quality === "strong" && analysis.unsupported_claims.length > 0 && input.followUpsOnItem === 0;

  if (
    (wantsFollowUp || probeNewClaim) &&
    input.followUpsOnItem < MAX_FOLLOW_UPS_PER_ITEM &&
    input.lastDepth < MAX_DEPTH &&
    questionsAsked < MAX_QUESTIONS - 1
  ) {
    return {
      kind: "follow_up",
      reason: analysis!.follow_up_reason || "Clarify the details of the previous answer",
      direction: analysis!.recommended_direction || "Ask for concrete implementation details",
      depth: Math.min(MAX_DEPTH, input.lastDepth + 1),
    };
  }

  if (input.remainingItems === 0) {
    return questionsAsked >= MIN_QUESTIONS ? { kind: "finish", reason: "blueprint_complete" } : { kind: "next_item" };
  }
  // Early finish: enough questions, important claims covered, little left to learn.
  if (questionsAsked >= MIN_QUESTIONS && input.unverifiedImportantClaims === 0 && input.remainingItems <= 1) {
    return { kind: "finish", reason: "sufficient_evidence" };
  }
  return { kind: "next_item" };
}
