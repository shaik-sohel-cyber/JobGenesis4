# Phase 2 — Interview Intelligence Engine (text-based)

Phase 1 stays untouched. No voice, webcam, avatar, speech, or final report.

## What the user gets
- A **Start AI Interview** button on a completed resume analysis page.
- A new page `/interview/:id`: a chat-style text interview. The interviewer asks one question at a time, reads each answer, asks follow-ups when an answer is vague or opens a deeper thread, recalls earlier answers ("You mentioned Redis earlier..."), and wraps up once enough evidence is gathered (min 10, max 25 questions).
- Visible states: Preparing interview, Interviewer asking, Waiting for your answer, Analyzing response, Preparing next question, Interview completed.
- Header: "JobGenesis AI Interviewer", progress bar by stage, question count. No "Question 1:" labels, no scores or internal evaluation shown.
- Dashboard: interview card lists past/ongoing interviews (replaces "coming next phase" placeholder) with resume link and status.
- Completed interview shows a neutral closing message only (full report is a later phase).

## Flow
```text
Start -> verify resume owned + completed -> create interview (planning)
 -> AI blueprint (prioritized stages) -> ready -> first question
Loop: answer -> analyze answer -> record evidence -> update claim status
 -> decide: follow-up | next blueprint item | finish -> next single question
```

## Database (new tables, RLS on all, ownership via interviews.user_id = auth.uid())
- interviews: user_id, resume_id, status (created/planning/ready/in_progress/completed/failed/cancelled), mode, current_stage, started_at, ended_at, error_message
- interview_blueprints: stage, objective, target_skill, target_claim_id, target_project, difficulty, order_index, status (pending/active/completed/skipped)
- interview_questions: blueprint_id, parent_question_id, question, category, difficulty, objective, target_skill, target_claim_id, sequence_number, depth_level
- interview_answers: question_id, transcript, response_duration, answer_quality (jsonb), evidence (jsonb), follow_up_required
- interview_evidence: claim_id, skill, project, evidence, evidence_strength (strong/moderate/weak/insufficient), source_question_id
- interview_claim_status: claim_id, status (Supported by interview evidence / Partially demonstrated / Not sufficiently demonstrated / Requires further verification), confidence, unanswered, contradictions — neutral wording only.

## Technical details
- Server functions in `src/lib/interview.functions.ts` (requireSupabaseAuth, RLS client): `startInterview`, `getInterview`, `submitAnswer`, `retryInterviewStep`. All IDs re-verified server-side against the caller; AI-returned IDs are mapped only to claim IDs that exist on the resume.
- Services under `src/services/` as `*.server.ts`, dynamically imported:
  interviewPlanner (createInterviewBlueprint), questionGenerator (generateInterviewQuestion — exactly one question, progressive depth levels 1-6), answerAnalyzer (analyzeInterviewAnswer, JSON per spec, Zod-validated), followUpEngine (generateFollowUp decision), evidenceTracker, interviewStateManager (builds the spec's state object from DB; stopping logic combining count limits with claim/project/skill coverage).
- AI via Lovable AI Gateway (Gemini, server-side key, JSON schema output). Prompts enforce: never invent facts, never assume claims true, never accuse, never reveal criteria, no repeats, use prior answers.
- Answer analysis + next question generated in one `submitAnswer` call; UI shows staged states while it runs. Failures set a friendly error with retry, without losing the answer.
- Replace interviewEngine placeholder; register new services in `src/services/index.ts`; update AGENTS.md.
- Verify end-to-end with Playwright: seeded test resume (Java/React/Node, JobGenesis project, Gemini claim), start interview, answer several turns, confirm follow-ups reference prior answers and state persists on reload.
