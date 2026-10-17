/**
 * Service boundaries for the JobGenesis platform.
 *
 * Phase 1 implements `resumeAnalyzer` only. The remaining modules are declared
 * here so later phases can be added without reshaping the application.
 */

export type ServiceStatus = "available" | "planned";

export interface ServiceDescriptor {
  key: string;
  name: string;
  summary: string;
  status: ServiceStatus;
}

export const services: ServiceDescriptor[] = [
  {
    key: "resumeAnalyzer",
    name: "Resume Analyzer",
    summary: "Extracts skills, projects, experience and verifiable claims from a resume.",
    status: "available",
  },
  {
    key: "interviewEngine",
    name: "Interview Engine",
    summary: "Generates and adapts interview questions from the candidate profile.",
    status: "available",
  },
  {
    key: "voiceEngine",
    name: "Voice Engine",
    summary: "Real-time speech for the live AI interviewer.",
    status: "available",
  },
  {
    key: "webcamAnalyzer",
    name: "Webcam Analyzer",
    summary: "Presence and delivery signals captured during an interview.",
    status: "available",
  },
  {
    key: "evaluationEngine",
    name: "Evaluation Engine",
    summary: "Scores answers against the claims made in the resume.",
    status: "planned",
  },
  {
    key: "reportGenerator",
    name: "Report Generator",
    summary: "Produces the detailed post-interview report.",
    status: "planned",
  },
];
