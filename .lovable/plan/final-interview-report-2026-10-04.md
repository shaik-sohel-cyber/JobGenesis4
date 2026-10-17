# Final Interview Report

Build the report that appears after an interview ends, combining resume, interview answers, evidence, claim checks and camera observations into one page.

## What the user gets
- A "View report" button on finished interviews (interview end screen + dashboard list).
- A new report page per interview with:
  1. **Header** — candidate name, resume file, date, duration, questions asked, camera on/off.
  2. **Overall summary** — short neutral written summary, strengths, areas to explore further, overall evidence level (Strong / Moderate / Limited).
  3. **Skill and project evidence** — each skill/project with its evidence strength and supporting quotes from answers.
  4. **Resume claim checks** — each claim with neutral status (Supported / Partially demonstrated / Not sufficiently demonstrated / Requires further verification), confidence, open questions. Never accusatory wording.
  5. **Question-by-question review** — question, candidate's answer, answer quality notes, response time, follow-ups.
  6. **Camera observations** (only if camera was on) — factual timeline per question, e.g. "Looked away for ~4.2s", plus totals. No emotions or personality claims; a note explains observations are not judgments.
  7. **Download as PDF** via browser print with a clean print layout.
- Report is generated once when the interview completes, saved, and reopens instantly. A "Regenerate" button is available if generation failed.

## Credits
- One AI call per report (the written summary). Everything else is assembled from data already saved, so no extra cost. It uses the Gemini key if you add one later, otherwise workspace credits.

## Technical details
- Migration: `interview_reports` (interview_id unique, status pending/ready/failed, summary jsonb, data jsonb, error_message, timestamps) with GRANTs + RLS via interview ownership.
- `src/services/reportGenerator/`: `assemble.server.ts` (gathers answers, evidence, claim_status, visual summaries/events into a typed report), `summarize.server.ts` (one `aiTarget()` call, Zod-validated, neutral-language prompt), `types.ts`.
- `src/lib/report.functions.ts`: `generateReport` (idempotent; reuses ready report unless `force`), `getReport` — both `requireSupabaseAuth` + ownership. Only allowed when interview status is completed.
- Route `src/routes/_authenticated/report.$id.tsx` with head() metadata; links from `interview.$id.tsx` completed screen and dashboard InterviewsCard.
- Print styles in `src/styles.css`; services index marks reportGenerator "available"; AGENTS.md rule added.
- Verify with the existing test interview end to end.
