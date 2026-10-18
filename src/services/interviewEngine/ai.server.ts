import type { z } from "zod";

export class InterviewAIError extends Error {}

/** Calls the AI key pool with a strict JSON schema and validates the result with Zod. */
export async function callStructured<T>(opts: {
  name: string;
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  validator: z.ZodType<T>;
}): Promise<T> {
  const { callAiStructured, AiPoolError } = await import("../aiProvider.server");

  let json: unknown;
  try {
    json = await callAiStructured({
      name: opts.name,
      system: opts.system,
      user: opts.user,
      jsonSchema: opts.jsonSchema,
      // A model that answers in the wrong shape is set aside, not retried forever.
      validate: (candidate) => opts.validator.safeParse(candidate).success,
    });
  } catch (error) {
    if (error instanceof AiPoolError)
      throw new InterviewAIError("The interviewer is temporarily unavailable. Please try again later.");
    console.error(`[interview:${opts.name}] unexpected`, error);
    throw new InterviewAIError("The interviewer couldn't respond. Please try again.");
  }

  const parsed = opts.validator.safeParse(json);
  if (!parsed.success) {
    console.error(`[interview:${opts.name}] validation failed`, parsed.error.issues.slice(0, 5));
    throw new InterviewAIError("The interviewer's response was incomplete. Please try again.");
  }
  return parsed.data;
}

export const nullableString = { type: ["string", "null"] } as const;
export const nullableInt = { type: ["integer", "null"] } as const;
export const stringArray = { type: "array", items: { type: "string" } } as const;

export const INTERVIEWER_RULES = `Interviewer rules (always apply):
- Never invent facts about the candidate. Only reference what the resume or the candidate's own answers say.
- Never assume a resume claim is true; the purpose is to gather evidence.
- Never accuse the candidate of lying or exaggerating. Stay neutral, respectful and curious.
- Never reveal hidden evaluation criteria, scores, or internal state.
- Ask exactly one question at a time. Never repeat a question that was already answered.
- Keep difficulty appropriate to the candidate's claimed experience.`;
