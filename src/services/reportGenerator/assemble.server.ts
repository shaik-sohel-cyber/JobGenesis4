import type { ReportData } from "./types";

/** Gathers everything already saved about an interview into one report object. */
export async function assembleReport(supabase: any, interviewId: string): Promise<ReportData> {
  const { data: iv } = await supabase
    .from("interviews")
    .select("id, user_id, resume_id, started_at, ended_at, camera_consent, target_role, job_description, required_skills")
    .eq("id", interviewId)
    .single();
  const [profile, resume, qs, ans, ev, cs, vis, integ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", iv.user_id).maybeSingle(),
    supabase.from("resumes").select("file_name").eq("id", iv.resume_id).maybeSingle(),
    supabase.from("interview_questions").select("id, question, category, sequence_number, parent_question_id, target_skill").eq("interview_id", interviewId).order("sequence_number"),
    supabase.from("interview_answers").select("question_id, transcript, response_duration, answer_quality").eq("interview_id", interviewId),
    supabase.from("interview_evidence").select("skill, project, evidence, evidence_strength").eq("interview_id", interviewId),
    supabase.from("interview_claim_status").select("status, confidence, unanswered, resume_claims(claim)").eq("interview_id", interviewId),
    supabase.from("interview_visual_events").select("question_id, event_type, duration_ms").eq("interview_id", interviewId),
    supabase.from("interview_integrity_events").select("kind, duration_ms, detail").eq("interview_id", interviewId),
  ]);

  // Role fit: deterministic, from saved evidence and answers only.
  const evRows = (ev.data ?? []) as Array<{ skill: string | null; evidence: string; evidence_strength: string }>;
  const answerText = ((ans.data ?? []) as any[]).map((a) => String(a.transcript ?? "")).join("\n").toLowerCase();
  const roleFit = ((iv.required_skills ?? []) as string[]).map((skill) => {
    const s = skill.toLowerCase();
    const hits = evRows.filter(
      (e) => e.evidence_strength !== "insufficient" && ((e.skill ?? "").toLowerCase().includes(s) || e.evidence.toLowerCase().includes(s)),
    );
    const status: "Demonstrated" | "Partially shown" | "Not discussed" = hits.some((h) => h.evidence_strength === "strong")
      ? "Demonstrated"
      : hits.length || answerText.includes(s)
        ? "Partially shown"
        : "Not discussed";
    return { skill, status };
  });

  const integRows = (integ.data ?? []) as Array<{ kind: string; duration_ms: number; detail: any }>;
  const sum = (k: string) => integRows.filter((r) => r.kind === k);
  const secs = (rows: typeof integRows) => Math.round(rows.reduce((t, r) => t + r.duration_ms, 0) / 1000);
  const integrity = {
    tabSwitches: sum("tab_hidden").length,
    tabAwaySeconds: secs(sum("tab_hidden")),
    windowBlurs: sum("window_blur").length,
    windowAwaySeconds: secs(sum("window_blur")),
    pastes: sum("paste").length,
    pastedChars: sum("paste").reduce((t, r) => t + (Number(r.detail?.chars) || 0), 0),
  };

  const answers = new Map<string, any>((ans.data ?? []).map((a: any) => [a.question_id, a]));
  const events = (vis.data ?? []) as Array<{ question_id: string | null; event_type: string; duration_ms: number }>;
  const totals = new Map<string, { count: number; seconds: number }>();
  for (const e of events) {
    const t = totals.get(e.event_type) ?? { count: 0, seconds: 0 };
    t.count++; t.seconds += e.duration_ms / 1000;
    totals.set(e.event_type, t);
  }

  const questions = ((qs.data ?? []) as any[])
    .filter((q) => q.category !== "closing")
    .map((q) => {
      const a = answers.get(q.id);
      const aq = a?.answer_quality ?? null;
      return {
        id: q.id,
        sequence: q.sequence_number,
        question: q.question,
        category: q.category,
        isFollowUp: !!q.parent_question_id,
        answer: a?.transcript ?? null,
        responseSeconds: a?.response_duration ?? null,
        quality: aq?.quality ?? null,
        notes: aq?.topics_covered?.length ? `Covered: ${aq.topics_covered.join("; ")}` : null,
        camera: events.filter((e) => e.question_id === q.id).map((e) => ({ type: e.event_type, seconds: Math.round(e.duration_ms / 100) / 10 })),
      };
    });

  const start = new Date(iv.started_at).getTime();
  const end = iv.ended_at ? new Date(iv.ended_at).getTime() : null;
  return {
    candidateName: profile.data?.full_name ?? null,
    resumeName: resume.data?.file_name ?? "Resume",
    startedAt: iv.started_at,
    endedAt: iv.ended_at,
    durationMinutes: end ? Math.max(1, Math.round((end - start) / 60000)) : null,
    questionCount: questions.length,
    cameraUsed: iv.camera_consent === "granted",
    evidence: ((ev.data ?? []) as any[]).map((e) => ({ skill: e.skill, project: e.project, evidence: e.evidence, strength: e.evidence_strength })),
    claims: ((cs.data ?? []) as any[]).map((c) => ({
      claim: c.resume_claims?.claim ?? "Resume claim",
      status: c.status,
      confidence: c.confidence,
      unanswered: Array.isArray(c.unanswered) ? c.unanswered.map(String) : [],
    })),
    questions,
    targetRole: iv.target_role ?? null,
    hasJobDescription: !!iv.job_description,
    roleFit,
    integrity,
    cameraTotals: [...totals].map(([type, t]) => ({ type, count: t.count, seconds: Math.round(t.seconds * 10) / 10 })),
  };
}
