import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type DB = SupabaseClient<Database>;

export type ClaimRow = {
  id: string;
  claim: string;
  claim_type: string;
  related_skill: string | null;
  related_project: string | null;
  verification_priority: string;
};

/** Loads a compact, prompt-ready view of the analyzed resume. */
export async function loadResumeContext(db: DB, resumeId: string) {
  const [skills, projects, experience, claims, resume] = await Promise.all([
    db.from("resume_skills").select("name, category, proficiency_claim").eq("resume_id", resumeId),
    db
      .from("resume_projects")
      .select("name, description, technologies, achievements")
      .eq("resume_id", resumeId),
    db
      .from("resume_experience")
      .select("company, role, start_date, end_date, technologies, achievements")
      .eq("resume_id", resumeId),
    db
      .from("resume_claims")
      .select("id, claim, claim_type, related_skill, related_project, verification_priority")
      .eq("resume_id", resumeId)
      .order("created_at"),
    db.from("resumes").select("parsed_profile").eq("id", resumeId).maybeSingle(),
  ]);
  const profile = (resume.data?.parsed_profile ?? {}) as { candidate?: { name?: string | null } };
  const claimRows = (claims.data ?? []) as ClaimRow[];
  return {
    candidateName: profile.candidate?.name ?? null,
    skills: skills.data ?? [],
    projects: projects.data ?? [],
    experience: experience.data ?? [],
    claims: claimRows,
    /** Text block for prompts. Claims are referenced by index, never by DB id. */
    summary: JSON.stringify(
      {
        skills: skills.data ?? [],
        projects: projects.data ?? [],
        experience: experience.data ?? [],
        claims: claimRows.map((c, i) => ({
          index: i,
          claim: c.claim,
          type: c.claim_type,
          related_skill: c.related_skill,
          related_project: c.related_project,
          priority: c.verification_priority,
        })),
      },
      null,
      1,
    ),
  };
}
export type ResumeContext = Awaited<ReturnType<typeof loadResumeContext>>;
