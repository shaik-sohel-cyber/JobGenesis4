import type { DB } from "./context.server";

export type RoleContext = {
  targetRole: string | null;
  jobDescription: string | null;
  requiredSkills: string[];
};

export async function loadRoleContext(db: DB, interviewId: string): Promise<RoleContext> {
  const { data } = await db
    .from("interviews")
    .select("target_role, job_description, required_skills")
    .eq("id", interviewId)
    .maybeSingle();
  return {
    targetRole: data?.target_role ?? null,
    jobDescription: data?.job_description ?? null,
    requiredSkills: data?.required_skills ?? [],
  };
}

/** Prompt block describing the target role; empty when the candidate gave none. */
export function roleBlock(r: RoleContext, jobDescriptionLimit = 6000) {
  if (!r.targetRole && !r.jobDescription) return "";
  return `\nTarget role the candidate is preparing for: ${r.targetRole ?? "(see job description)"}
${r.jobDescription ? `Job description (pasted by the candidate):\n"""\n${r.jobDescription.slice(0, jobDescriptionLimit)}\n"""` : ""}
${r.requiredSkills.length ? `Key required skills: ${r.requiredSkills.join(", ")}` : ""}\n`;
}
