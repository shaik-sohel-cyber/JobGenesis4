import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ReportData, ReportSummary } from "@/services/reportGenerator/types";

export type ReportView =
  | { state: "not_found" }
  | { state: "not_ready" }
  | { state: "pending" | "failed"; message: string | null }
  | {
      state: "ready";
      summary: ReportSummary;
      data: ReportData;
      generatedAt: string;
      shared: boolean;
      shareToken: string | null;
    };

const input = z.object({ interviewId: z.string().uuid(), force: z.boolean().optional() });

async function owned(supabase: any, userId: string, id: string) {
  const { data } = await supabase.from("interviews").select("id, user_id, status").eq("id", id).maybeSingle();
  return data && data.user_id === userId ? data : null;
}

async function read(supabase: any, interviewId: string): Promise<ReportView> {
  const { data: r } = await supabase
    .from("interview_reports")
    .select("status, summary, data, error_message, updated_at, shared, share_token")
    .eq("interview_id", interviewId)
    .maybeSingle();
  if (!r) return { state: "pending", message: null };
  if (r.status === "ready")
    return {
      state: "ready",
      summary: r.summary,
      data: r.data,
      generatedAt: r.updated_at,
      shared: r.shared === true,
      shareToken: r.share_token ?? null,
    };
  return { state: r.status === "failed" ? "failed" : "pending", message: r.error_message };
}

export const getReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => input.parse(i))
  .handler(async ({ data, context }): Promise<ReportView> => {
    const iv = await owned(context.supabase, context.userId, data.interviewId);
    if (!iv) return { state: "not_found" };
    if (iv.status !== "completed") return { state: "not_ready" };
    return read(context.supabase, iv.id);
  });

/** Idempotent: returns the saved report unless force is set. */
export const generateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => input.parse(i))
  .handler(async ({ data, context }): Promise<ReportView> => {
    const { supabase, userId } = context;
    const iv = await owned(supabase, userId, data.interviewId);
    if (!iv) return { state: "not_found" };
    if (iv.status !== "completed") return { state: "not_ready" };
    const existing = await read(supabase, iv.id);
    if (existing.state === "ready" && !data.force) return existing;

    await supabase.from("interview_reports").upsert({ interview_id: iv.id, status: "pending", error_message: null }, { onConflict: "interview_id" });
    try {
      const { assembleReport } = await import("@/services/reportGenerator/assemble.server");
      const { summarizeReport } = await import("@/services/reportGenerator/summarize.server");
      const report = await assembleReport(supabase, iv.id);
      const summary = await summarizeReport(report);
      await supabase.from("interview_reports").update({ status: "ready", data: report, summary }).eq("interview_id", iv.id);
    } catch (e) {
      console.error("[report] generation failed", e);
      const message = e instanceof Error && e.constructor.name === "InterviewAIError" ? e.message : "The report couldn't be generated. Please try again.";
      await supabase.from("interview_reports").update({ status: "failed", error_message: message }).eq("interview_id", iv.id);
    }
    return read(supabase, iv.id);
  });

const shareInput = z.object({ interviewId: z.string().uuid(), shared: z.boolean() });
const ShareResult = z.object({ shared: z.boolean(), token: z.string().uuid().nullable() });
export type ShareResult = z.infer<typeof ShareResult>;

/** Owner-only toggle: turning sharing on mints a fresh unguessable token; turning it off clears it. */
export const setReportSharing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => shareInput.parse(i))
  .handler(async ({ data, context }): Promise<ShareResult> => {
    const iv = await owned(context.supabase, context.userId, data.interviewId);
    if (!iv) throw new Error("Report not found.");

    if (!data.shared) {
      const { error } = await context.supabase
        .from("interview_reports")
        .update({ shared: false, share_token: null })
        .eq("interview_id", iv.id);
      if (error) throw new Error(error.message);
      return { shared: false, token: null };
    }

    const current = await read(context.supabase, iv.id);
    if (current.state !== "ready") throw new Error("The report isn't ready to share yet.");
    const token = crypto.randomUUID();
    const { error } = await context.supabase
      .from("interview_reports")
      .update({ shared: true, share_token: token })
      .eq("interview_id", iv.id);
    if (error) throw new Error(error.message);
    return { shared: true, token };
  });

export type SharedReport = {
  durationMinutes: number | null;
  questionCount: number;
  overview: string;
  strengths: string[];
  areasToExplore: string[];
  roleFit: Array<Pick<NonNullable<ReportData["roleFit"]>[number], "skill" | "status">>;
  evidenceLevel: ReportSummary["evidenceLevel"];
};

const sharedReportSummarySchema = z.object({
  overview: z.string(),
  strengths: z.array(z.string()),
  areasToExplore: z.array(z.string()),
  evidenceLevel: z.enum(["Strong", "Moderate", "Limited"]),
});

const sharedReportDataSchema = z.object({
  durationMinutes: z.number().nullable().optional(),
  questionCount: z.number().int().nonnegative().optional(),
  roleFit: z.array(z.object({
    skill: z.string(),
    status: z.enum(["Demonstrated", "Partially shown", "Not discussed"]),
  })).optional(),
});

/**
 * Public read for the share page: anonymous by design, matched only by the
 * unguessable token, and returns a sanitized slice — no name, no resume,
 * no transcripts, no integrity or camera details.
 */
export const getSharedReport = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ token: z.unknown() }).parse(i))
  .handler(async ({ data }): Promise<SharedReport | null> => {
    const token = z.string().uuid().safeParse(data.token);
    if (!token.success) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r, error } = await supabaseAdmin
      .from("interview_reports")
      .select("summary, data")
      .eq("shared", true)
      .eq("status", "ready")
      .eq("share_token", token.data)
      .maybeSingle();
    if (error) {
      console.error("[report] shared report lookup failed", error);
      return null;
    }
    if (!r) return null;

    const summary = sharedReportSummarySchema.safeParse(r.summary);
    if (!summary.success) return null;

    const reportData = r.data == null ? null : sharedReportDataSchema.safeParse(r.data);
    if (reportData && !reportData.success) return null;
    const values = reportData?.data;

    return {
      durationMinutes: values?.durationMinutes ?? null,
      questionCount: values?.questionCount ?? 0,
      overview: summary.data.overview,
      strengths: summary.data.strengths,
      areasToExplore: summary.data.areasToExplore,
      roleFit: (values?.roleFit ?? [])
        .filter((item) => item.status !== "Not discussed")
        .map(({ skill, status }) => ({ skill, status })),
      evidenceLevel: summary.data.evidenceLevel,
    };
  });
