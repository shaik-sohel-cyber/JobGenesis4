/** Client-safe report shapes. */
export type ReportSummary = {
  overview: string;
  strengths: string[];
  areasToExplore: string[];
  evidenceLevel: "Strong" | "Moderate" | "Limited";
};

export type ReportData = {
  candidateName: string | null;
  resumeName: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  questionCount: number;
  cameraUsed: boolean;
  evidence: Array<{ skill: string | null; project: string | null; evidence: string; strength: string }>;
  claims: Array<{ claim: string; status: string; confidence: number; unanswered: string[] }>;
  questions: Array<{
    id: string;
    sequence: number;
    question: string;
    category: string;
    isFollowUp: boolean;
    answer: string | null;
    responseSeconds: number | null;
    quality: string | null;
    notes: string | null;
    camera: Array<{ type: string; seconds: number }>;
  }>;
  cameraTotals: Array<{ type: string; count: number; seconds: number }>;
  /** Missing on reports generated before role matching existed. */
  targetRole?: string | null;
  hasJobDescription?: boolean;
  roleFit?: Array<{ skill: string; status: "Demonstrated" | "Partially shown" | "Not discussed" }>;
  integrity?: { tabSwitches: number; tabAwaySeconds: number; windowBlurs: number; windowAwaySeconds: number; pastes: number; pastedChars: number };
};

export const CAMERA_EVENT_LABELS: Record<string, string> = {
  face_not_visible: "Face not visible",
  multiple_faces: "More than one face visible",
  looking_away: "Looked away from the camera",
  head_turned: "Head turned away",
  head_movement: "Large head movement",
  face_obstructed: "Face partly covered",
  poor_framing: "Face poorly framed",
  low_light: "Low light",
  camera_unavailable: "Camera unavailable",
  camera_interrupted: "Camera interrupted",
};

export function cameraLabel(type: string) {
  return CAMERA_EVENT_LABELS[type] ?? type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
