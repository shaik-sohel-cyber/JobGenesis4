import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  feature: z.enum(["resume_analysis", "ai_interview", "interview_report", "other"]),
  category: z.enum(["general", "bug", "feature_request", "performance_voice"]),
  message: z.string().trim().min(10).max(3000),
  contactEmail: z.union([z.literal(""), z.string().trim().email().max(254)]).optional(),
});

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => feedbackSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const { error } = await context.supabase.from("feedback_submissions").insert({
      user_id: context.userId,
      rating: data.rating,
      feature: data.feature,
      category: data.category,
      message: data.message,
      contact_email: data.contactEmail?.trim() || null,
    });

    if (error) {
      console.error("[feedback] submission failed", error.message);
      return { ok: false, message: "We couldn't submit your feedback. Please try again." };
    }
    return { ok: true };
  });
