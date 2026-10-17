import { z } from "zod";

/**
 * Structured contract for resume analysis. Shared by the AI request schema,
 * server-side validation, and the UI. Missing information must be null or an
 * empty array — never invented.
 */

export const SKILL_CATEGORIES = [
  "programming_languages",
  "frameworks",
  "libraries",
  "databases",
  "cloud",
  "tools",
  "AI_ML",
  "concepts",
  "other",
] as const;

export const CLAIM_TYPES = [
  "skill",
  "project",
  "experience",
  "achievement",
  "technology",
  "responsibility",
  "quantitative_result",
  "other",
] as const;

export const VERIFICATION_PRIORITIES = ["high", "medium", "low"] as const;

const nullableString = z.string().nullable().catch(null);
const stringList = z.array(z.string()).catch([]);

export const candidateSchema = z.object({
  name: nullableString,
  email: nullableString,
  phone: nullableString,
  location: nullableString,
  linkedin: nullableString,
  github: nullableString,
  portfolio: nullableString,
});

export const educationSchema = z.object({
  institution: z.string(),
  degree: nullableString,
  field: nullableString,
  start_date: nullableString,
  end_date: nullableString,
  grade: nullableString,
  description: nullableString,
});

export const skillSchema = z.object({
  name: z.string(),
  category: z.enum(SKILL_CATEGORIES).catch("other"),
  proficiency_claim: nullableString,
  evidence: nullableString,
});

export const projectSchema = z.object({
  name: z.string(),
  description: nullableString,
  technologies: stringList,
  responsibilities: stringList,
  achievements: stringList,
  claims: stringList,
});

export const experienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  employment_type: nullableString,
  start_date: nullableString,
  end_date: nullableString,
  description: nullableString,
  technologies: stringList,
  responsibilities: stringList,
  achievements: stringList,
});

export const certificationSchema = z.object({
  name: z.string(),
  issuer: nullableString,
  date: nullableString,
  credential_id: nullableString,
});

export const claimSchema = z.object({
  claim: z.string(),
  claim_type: z.enum(CLAIM_TYPES).catch("other"),
  related_skill: nullableString,
  related_project: nullableString,
  evidence: nullableString,
  verification_priority: z.enum(VERIFICATION_PRIORITIES).catch("medium"),
});

export const parsedProfileSchema = z.object({
  candidate: candidateSchema,
  education: z.array(educationSchema).catch([]),
  skills: z.array(skillSchema).catch([]),
  projects: z.array(projectSchema).catch([]),
  experience: z.array(experienceSchema).catch([]),
  certifications: z.array(certificationSchema).catch([]),
  achievements: stringList,
  claims: z.array(claimSchema).catch([]),
});

export type ParsedProfile = z.infer<typeof parsedProfileSchema>;
export type ResumeClaim = z.infer<typeof claimSchema>;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  programming_languages: "Programming languages",
  frameworks: "Frameworks",
  libraries: "Libraries",
  databases: "Databases",
  cloud: "Cloud & infrastructure",
  tools: "Tools",
  AI_ML: "AI & machine learning",
  concepts: "Concepts",
  other: "Other",
};
