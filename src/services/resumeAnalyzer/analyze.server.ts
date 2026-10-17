import { parsedProfileSchema, type ParsedProfile } from "./schema";
import { RESUME_JSON_SCHEMA, SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export class AnalysisError extends Error {}

/** Sends resume text to the AI key pool and returns a validated structured profile. */
export async function analyzeResumeText(resumeText: string): Promise<ParsedProfile> {
  const { callAiStructured, AiPoolError } = await import("../aiProvider.server");

  let json: unknown;
  try {
    json = await callAiStructured({
      name: "resume_profile",
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(resumeText),
      jsonSchema: RESUME_JSON_SCHEMA,
      validate: (candidate) => parsedProfileSchema.safeParse(candidate).success,
    });
  } catch (error) {
    if (error instanceof AiPoolError) throw new AnalysisError(error.message);
    console.error("[resume] unexpected", error);
    throw new AnalysisError("The analysis service could not process this resume.");
  }

  const parsed = parsedProfileSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[resume] schema validation failed", parsed.error.issues.slice(0, 5));
    throw new AnalysisError("The analysis result was incomplete. Please try again.");
  }
  return parsed.data;
}
