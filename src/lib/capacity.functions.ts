import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminUser } from "@/lib/admin-auth.server";
import type { CapacityView } from "@/services/aiProvider.server";

/**
 * Reads today's AI key pool state: how many keys are connected, which model
 * allowances are still open, and roughly how many interviews are left.
 */
export const getCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CapacityView> => {
    if (!(await isAdminUser(context.supabase, context.userId))) {
      throw new Error("Forbidden: administrator access required.");
    }
    const { capacitySummary } = await import("@/services/aiProvider.server");
    return capacitySummary();
  });

export type InterviewCapacityView = { full: boolean };

/** Candidate-safe availability signal for the interview start screen. */
export const getInterviewCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<InterviewCapacityView> => {
    try {
      const { isInterviewCapacityFull } = await import("@/services/aiProvider.server");
      return { full: await isInterviewCapacityFull() };
    } catch (error) {
      console.error("[interviewCapacity] availability check failed", error);
      throw new Error("Interview availability could not be checked. Please try again.");
    }
  });
