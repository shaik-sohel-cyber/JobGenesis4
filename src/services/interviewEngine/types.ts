/** Client-safe shared constants for the interview engine. */

export const INTERVIEW_STAGES = [
  "introduction",
  "resume_overview",
  "project_investigation",
  "skill_validation",
  "experience_validation",
  "claim_verification",
  "technical_depth",
  "closing",
] as const;
export type InterviewStage = (typeof INTERVIEW_STAGES)[number];

export const STAGE_LABELS: Record<InterviewStage, string> = {
  introduction: "Introduction",
  resume_overview: "Resume overview",
  project_investigation: "Projects",
  skill_validation: "Skills",
  experience_validation: "Experience",
  claim_verification: "Resume claims",
  technical_depth: "Technical depth",
  closing: "Closing",
};

export const QUESTION_CATEGORIES = [
  "introduction",
  "resume",
  "project",
  "skill",
  "experience",
  "technical",
  "follow_up",
  "clarification",
  "closing",
] as const;

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const EVIDENCE_STRENGTHS = ["strong", "moderate", "weak", "insufficient"] as const;
export const CLAIM_STATUSES = [
  "Supported by interview evidence",
  "Partially demonstrated",
  "Not sufficiently demonstrated",
  "Requires further verification",
] as const;

export const MIN_QUESTIONS = 10;
export const MAX_QUESTIONS = 25;
