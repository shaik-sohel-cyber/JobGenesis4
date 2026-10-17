# Job description matching + integrity signals

## 1. Job description / target role
- On the screen where a candidate starts an interview, add an optional "Target role" section:
  - **Role dropdown with search**: common roles grouped by area (e.g. Frontend Developer, Backend Developer, Full Stack, Data Analyst, Data Scientist, ML Engineer, DevOps, Android/iOS, QA, UI/UX, Product Manager, Business Analyst, Cybersecurity…). Roles that fit the resume are listed first under "Suggested for you". If their role isn't listed, they can type their own.
  - **Job description paste box**: candidates copy-paste the company's posting. Optional.
- If both are empty, the interview works exactly as it does today. If either is filled, the interview focuses on it:
  - Role only: questions cover what that role typically needs, connected to their resume.
  - Job description added: the AI pulls out the key required skills and duties, and questions focus on where the resume and the posting overlap. It politely asks about required skills the resume doesn't show ("This role uses Docker — have you worked with it?").
- Report gets a "Role fit" section: each required skill marked Demonstrated / Partially shown / Not discussed, based only on what was said. No extra AI calls — this fits into the existing planning and report steps.

## 2. Integrity signals (observations, never accusations)
Recorded only while the interview is live, shown in the report as neutral facts:
- **Tab / window switches**: count and total time away from the interview page.
- **Copy-paste**: pasting into the typed-answer box, if used.
- **Second voice**: when the mic picks up speech while the candidate's camera shows no talking face (only when camera is on) — logged as "possible other speaker".
- **Long silences before answering** after a question (timing only).
- Candidate is told upfront on the ready screen: "We note tab switches and other speakers during the interview."
- Report wording stays neutral ("Left the interview tab 3 times, 41s total") — no honesty judgements, matching the existing rule.

## 3. Harder-to-ChatGPT questions
- Question prompt nudge: prefer questions about personal decisions on their own projects ("why did you choose X over Y", "what broke and how did you find it") over textbook definitions. Zero extra cost.

## Technical details
- Migration: `interviews` gains `target_role text`, `job_description text`, `required_skills text[]`; new `interview_integrity_events` (interview_id, kind, detail jsonb, created_at) with RLS: owner insert only while session is INTERVIEW_ACTIVE (enforced in a server function like `webcam.functions.ts`), owner read; reports read via existing ownership.
- `startInterview` accepts the optional role fields (length-capped). `loadResumeContext`/planner and `questionGenerator` prompts receive them.
- Browser: `visibilitychange`/`blur` listeners + paste listener in `interview.$id.tsx`, batched to a `recordIntegrityEvents` server function; failures swallowed.
- Second-voice: combine existing mic VAD with webcam face/mouth signal when available; otherwise skipped.
- `assemble.server.ts` aggregates events + skill coverage into the report; `getInterview` still strips evaluation data.
- AGENTS.md: add rules for role context and integrity events.
