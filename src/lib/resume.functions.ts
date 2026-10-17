import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({ resumeId: z.string().uuid() });

type ProcessResult = { status: "completed" } | { status: "failed"; message: string };

const GENERIC_FAILURE = "Something went wrong while analyzing your resume. Please try again.";

/**
 * Runs the full resume pipeline: download -> extract text -> AI analysis ->
 * validated structured profile -> normalized tables. Progress is written to the
 * resume row so the UI can reflect real backend state.
 */
export const processResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProcessResult> => {
    const { supabase, userId } = context;
    const { resumeId } = data;

    const { data: resume, error: loadError } = await supabase
      .from("resumes")
      .select("id, user_id, file_path, file_type, status")
      .eq("id", resumeId)
      .maybeSingle();

    if (loadError || !resume || resume.user_id !== userId) {
      return { status: "failed", message: "We couldn't find that resume." };
    }
    if (resume.status === "processing") {
      return { status: "failed", message: "This resume is already being analyzed." };
    }

    const fail = async (message: string): Promise<ProcessResult> => {
      await supabase
        .from("resumes")
        .update({ status: "failed", stage: null, error_message: message })
        .eq("id", resumeId);
      return { status: "failed", message };
    };

    await supabase
      .from("resumes")
      .update({ status: "processing", stage: "extracting", error_message: null })
      .eq("id", resumeId);

    try {
      const { extractResumeText, ExtractionError } = await import(
        "@/services/resumeAnalyzer/extract.server"
      );
      const { analyzeResumeText, AnalysisError } = await import(
        "@/services/resumeAnalyzer/analyze.server"
      );
      const { ANALYSIS_VERSION } = await import("@/services/resumeAnalyzer/prompt");

      const { data: file, error: downloadError } = await supabase.storage
        .from("resumes")
        .download(resume.file_path);
      if (downloadError || !file) {
        console.error("[resume] download failed", downloadError);
        return await fail("We couldn't open your uploaded file. Please upload it again.");
      }

      let text: string;
      try {
        text = await extractResumeText(new Uint8Array(await file.arrayBuffer()), resume.file_type);
      } catch (error) {
        return await fail(
          error instanceof ExtractionError ? error.message : "We couldn't read this file.",
        );
      }

      await supabase
        .from("resumes")
        .update({ stage: "analyzing", raw_text: text })
        .eq("id", resumeId);

      let profile;
      try {
        profile = await analyzeResumeText(text);
      } catch (error) {
        return await fail(error instanceof AnalysisError ? error.message : GENERIC_FAILURE);
      }

      await supabase.from("resumes").update({ stage: "saving" }).eq("id", resumeId);

      // Replace any previous analysis for this resume (retry-safe).
      for (const table of [
        "resume_skills",
        "resume_projects",
        "resume_experience",
        "resume_education",
        "resume_certifications",
        "resume_achievements",
        "resume_claims",
      ] as const) {
        await supabase.from(table).delete().eq("resume_id", resumeId);
      }

      const inserts: Array<Promise<{ error: { message: string } | null }>> = [];
      const push = <T>(table: string, rows: T[]) => {
        if (rows.length === 0) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inserts.push((supabase.from(table as any) as any).insert(rows as any));
      };

      push(
        "resume_skills",
        profile.skills.map((s) => ({
          resume_id: resumeId,
          name: s.name,
          category: s.category,
          proficiency_claim: s.proficiency_claim,
          evidence: s.evidence,
        })),
      );
      push(
        "resume_projects",
        profile.projects.map((p) => ({
          resume_id: resumeId,
          name: p.name,
          description: p.description,
          technologies: p.technologies,
          responsibilities: p.responsibilities,
          achievements: p.achievements,
          claims: p.claims,
        })),
      );
      push(
        "resume_experience",
        profile.experience.map((e) => ({
          resume_id: resumeId,
          company: e.company,
          role: e.role,
          employment_type: e.employment_type,
          start_date: e.start_date,
          end_date: e.end_date,
          description: e.description,
          technologies: e.technologies,
          responsibilities: e.responsibilities,
          achievements: e.achievements,
        })),
      );
      push(
        "resume_education",
        profile.education.map((e) => ({
          resume_id: resumeId,
          institution: e.institution,
          degree: e.degree,
          field: e.field,
          start_date: e.start_date,
          end_date: e.end_date,
          grade: e.grade,
          description: e.description,
        })),
      );
      push(
        "resume_certifications",
        profile.certifications.map((c) => ({
          resume_id: resumeId,
          name: c.name,
          issuer: c.issuer,
          date: c.date,
          credential_id: c.credential_id,
        })),
      );
      push(
        "resume_achievements",
        profile.achievements.map((text) => ({ resume_id: resumeId, text })),
      );
      push(
        "resume_claims",
        profile.claims.map((c) => ({
          resume_id: resumeId,
          claim: c.claim,
          claim_type: c.claim_type,
          related_skill: c.related_skill,
          related_project: c.related_project,
          evidence: c.evidence,
          verification_priority: c.verification_priority,
        })),
      );

      const results = await Promise.all(inserts);
      const insertError = results.find((r) => r.error)?.error;
      if (insertError) {
        console.error("[resume] insert failed", insertError);
        return await fail(GENERIC_FAILURE);
      }

      await supabase
        .from("resumes")
        .update({
          status: "completed",
          stage: null,
          error_message: null,
          parsed_profile: profile,
          analysis_version: ANALYSIS_VERSION,
        })
        .eq("id", resumeId);

      return { status: "completed" };
    } catch (error) {
      console.error("[resume] unexpected processing failure", error);
      return await fail(GENERIC_FAILURE);
    }
  });
