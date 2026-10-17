/**
 * Voice engine (Phase 3). Independent of the interview engine: it only speaks text
 * and turns speech into transcripts. Interview decisions stay in interviewEngine.
 */
export const voiceEngine = {
  status: "available" as const,
};
export * from "./voiceConfig";
export type { VoiceProvider } from "./provider";
