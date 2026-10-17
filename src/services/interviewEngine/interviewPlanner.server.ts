import { z } from "zod";
import { callStructured, INTERVIEWER_RULES, nullableInt, nullableString } from "./ai.server";
import { DIFFICULTIES, INTERVIEW_STAGES } from "./types";
import type { ResumeContext } from "./context.server";

const PLANNABLE = INTERVIEW_STAGES.filter((s) => s !== "closing");

const itemSchema = z.object({
  stage: z.enum(PLANNABLE as [string, ...string[]]),
  objective: z.string().min(3),
  target_skill: z.string().nullable(),
  target_claim_index: z.number().int().nullable(),
  target_project: z.string().nullable(),
  difficulty: z.enum(DIFFICULTIES),
});
const planSchema = z.object({
  mode: z.enum(["resume_verification", "technical", "mixed"]),
  required_skills: z.array(z.string().min(1).max(60)).max(15),
  items: z.array(itemSchema).min(3).max(16),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mode", "required_skills", "items"],
  properties: {
    mode: { type: "string", enum: ["resume_verification", "technical", "mixed"] },
    required_skills: { type: "array", items: { type: "string" } },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stage", "objective", "target_skill", "target_claim_index", "target_project", "difficulty"],
        properties: {
          stage: { type: "string", enum: PLANNABLE },
          objective: { type: "string" },
          target_skill: nullableString,
          target_claim_index: nullableInt,
          target_project: nullableString,
          difficulty: { type: "string", enum: DIFFICULTIES },
        },
      },
    },
  },
};

const SYSTEM = `You plan a personalised technical/resume interview. You decide WHAT should be investigated, in which order.
${INTERVIEWER_RULES}

Planning rules:
- Output 8 to 14 blueprint items, ordered as a natural interview: introduction, resume_overview, project_investigation, skill_validation, experience_validation, claim_verification, technical_depth. Omit stages with nothing worth probing.
- Start with exactly one introduction item and one resume_overview item.
- Do NOT include every resume item. Prioritise: technically significant claims, important projects, claimed core technologies, quantitative achievements, architecture/optimisation claims, leadership/ownership claims, and claims marked high priority.
- target_claim_index must be the "index" of a claim from the provided list, or null. target_skill/target_project must be names taken from the resume, or null.
- Each objective states what evidence the item should collect, in one sentence.
- Prefer objectives about the candidate's own decisions, debugging stories and trade-offs on their real projects over textbook definitions.

Target role rules (only when a target role or job description is given):
- required_skills: list the 5-12 most important skills/technologies the role needs (from the job description if given, otherwise typical for that role). Short names like "React", "SQL", "System design". Empty array when no role is given.
- Focus most items on where the resume overlaps the role's required skills. Add 1-3 skill_validation items for important required skills the resume does not show; their objective is to politely learn whether the candidate has any exposure (target_skill = that skill name, even if not on the resume).`;

export type BlueprintPlan = z.infer<typeof planSchema>;

/** createInterviewBlueprint — AI decides what to investigate from the analyzed resume (and target role, if any). */
export async function createInterviewBlueprint(ctx: ResumeContext, role = ""): Promise<BlueprintPlan> {
  const plan = await callStructured({
    name: "interview_blueprint",
    system: SYSTEM,
    user: `Analyzed resume:\n${ctx.summary}\n${role || "\nNo target role given."}\nCreate the interview blueprint.`,
    jsonSchema,
    validator: planSchema,
  });
  if (!role) plan.required_skills = [];
  // Never trust AI references: drop claim indexes that don't exist.
  plan.items = plan.items.map((i) => ({
    ...i,
    target_claim_index:
      i.target_claim_index !== null && i.target_claim_index >= 0 && i.target_claim_index < ctx.claims.length
        ? i.target_claim_index
        : null,
  }));
  return plan;
}
