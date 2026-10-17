import { CLAIM_TYPES, SKILL_CATEGORIES, VERIFICATION_PRIORITIES } from "./schema";

export const ANALYSIS_VERSION = "resume-analyzer-v1";

export const SYSTEM_PROMPT = `You are a precise resume extraction engine for an interview-preparation platform.

Absolute rules:
- Extract ONLY what the resume actually states. Never invent, infer beyond reasonable reading, or embellish.
- If a field is not present in the resume, return null (for single values) or an empty array (for lists).
- Never guess emails, phone numbers, dates, grades, employers, or metrics.
- Preserve the candidate's own wording in evidence fields; quote short fragments from the resume.
- Do not editorialise or judge the candidate.

Skill categories must be one of: ${SKILL_CATEGORIES.join(", ")}.
Claim types must be one of: ${CLAIM_TYPES.join(", ")}.
Verification priority must be one of: ${VERIFICATION_PRIORITIES.join(", ")}.

Claims: identify concrete statements a technical interviewer could later probe, such as things the candidate says they built, designed, implemented, optimised, led, architected, or measurably improved. For each claim include the supporting resume fragment as evidence, the related project or skill when the resume links them, and a verification priority: high for specific technical or quantitative claims central to the resume, medium for general contributions, low for peripheral mentions.

Return only data that maps to the required JSON schema.`;

export function buildUserPrompt(resumeText: string): string {
  return `Extract the structured candidate profile from the resume text below.

--- RESUME TEXT START ---
${resumeText}
--- RESUME TEXT END ---`;
}

const nullableString = { type: ["string", "null"] } as const;
const stringArray = { type: "array", items: { type: "string" } } as const;

/** JSON schema sent to the model for structured output. */
export const RESUME_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "candidate",
    "education",
    "skills",
    "projects",
    "experience",
    "certifications",
    "achievements",
    "claims",
  ],
  properties: {
    candidate: {
      type: "object",
      additionalProperties: false,
      required: ["name", "email", "phone", "location", "linkedin", "github", "portfolio"],
      properties: {
        name: nullableString,
        email: nullableString,
        phone: nullableString,
        location: nullableString,
        linkedin: nullableString,
        github: nullableString,
        portfolio: nullableString,
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "institution",
          "degree",
          "field",
          "start_date",
          "end_date",
          "grade",
          "description",
        ],
        properties: {
          institution: { type: "string" },
          degree: nullableString,
          field: nullableString,
          start_date: nullableString,
          end_date: nullableString,
          grade: nullableString,
          description: nullableString,
        },
      },
    },
    skills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "proficiency_claim", "evidence"],
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: [...SKILL_CATEGORIES] },
          proficiency_claim: nullableString,
          evidence: nullableString,
        },
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "description",
          "technologies",
          "responsibilities",
          "achievements",
          "claims",
        ],
        properties: {
          name: { type: "string" },
          description: nullableString,
          technologies: stringArray,
          responsibilities: stringArray,
          achievements: stringArray,
          claims: stringArray,
        },
      },
    },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "company",
          "role",
          "employment_type",
          "start_date",
          "end_date",
          "description",
          "technologies",
          "responsibilities",
          "achievements",
        ],
        properties: {
          company: { type: "string" },
          role: { type: "string" },
          employment_type: nullableString,
          start_date: nullableString,
          end_date: nullableString,
          description: nullableString,
          technologies: stringArray,
          responsibilities: stringArray,
          achievements: stringArray,
        },
      },
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "issuer", "date", "credential_id"],
        properties: {
          name: { type: "string" },
          issuer: nullableString,
          date: nullableString,
          credential_id: nullableString,
        },
      },
    },
    achievements: stringArray,
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "claim",
          "claim_type",
          "related_skill",
          "related_project",
          "evidence",
          "verification_priority",
        ],
        properties: {
          claim: { type: "string" },
          claim_type: { type: "string", enum: [...CLAIM_TYPES] },
          related_skill: nullableString,
          related_project: nullableString,
          evidence: nullableString,
          verification_priority: { type: "string", enum: [...VERIFICATION_PRIORITIES] },
        },
      },
    },
  },
} as const;
