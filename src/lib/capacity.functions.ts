import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CapacityView } from "@/services/aiProvider.server";

/**
 * Reads today's AI key pool state: how many keys are connected, which model
 * allowances are still open, and roughly how many interviews are left.
 */
export const getCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<CapacityView> => {
    const { capacitySummary } = await import("@/services/aiProvider.server");
    return capacitySummary();
  });

export type InterviewCapacityView = {
  interviewsLeft: number;
  /** True when every key/model allowance is benched until its reset time. */
  full: boolean;
  keysConnected: number;
  /** Earliest ISO time a benched allowance returns (null when nothing is benched). */
  resetAt: string | null;
};

/** Lightweight view for the interview start screen: slots left today, or "full". */
export const getInterviewCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<InterviewCapacityView> => {
    const { capacitySummary } = await import("@/services/aiProvider.server");
    const s = await capacitySummary();
    return {
      interviewsLeft: s.estimatedInterviewsLeft,
      full: s.keysConnected > 0 && s.pairsOpen === 0,
      keysConnected: s.keysConnected,
      resetAt: s.nextResetAt,
    };
  });
