<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project architecture rules

- Resume processing runs in the `processResume` TanStack server function (`src/lib/resume.functions.ts`), not an Edge Function — the app already has a server runtime and needs the caller's session for RLS.
- Server-only pipeline steps live in `src/services/resumeAnalyzer/*.server.ts` and are dynamically imported inside handlers, so browser bundles never pull in PDF/AI code.
- Future capabilities (interviewEngine, voiceEngine, webcamAnalyzer, evaluationEngine, reportGenerator) are declared as placeholder modules under `src/services/` so later phases slot in without reshaping the app.
- Uploads go straight from the browser to private storage via an XHR request with the user's token, so real upload progress can be shown; RLS still applies.
- The interview engine is driven by idempotent server functions (`advanceInterview` phases prepare/interview/analyze, `submitAnswer`) that re-derive state from the database; the next question is asked before the latest answer is AI-analyzed (a length heuristic picks follow-ups meanwhile) and the client fires a background "analyze" pass, so candidates never wait for scoring; finishing analyzes everything before closing.
- Candidates read interviews only through `getInterview`, which strips all evaluation data; AI claim references are indexes mapped server-side to real claim IDs.
- Voice interview: `src/services/voiceEngine/` only speaks and transcribes (provider interface + fallback manager: Lovable AI speech → ElevenLabs slot → browser voice); answers still flow through `submitAnswer`/`advanceInterview`, so the interview engine stays the single source of truth.
- Speech/transcription run through `/api/voice/speak` and `/api/voice/transcribe` server routes that verify the bearer token and interview/resume ownership, so SSE audio streams directly and the AI key stays server-side; raw audio is never stored.
- Voice providers (Cartesia, ElevenLabs, Deepgram, Google, Azure for voice; Deepgram, Groq, AssemblyAI, ElevenLabs for transcription) are server adapters in `voiceEngine/tts.server.ts`/`stt.server.ts`, switched on by the presence of their secret and normalized to the same SSE shape, so the browser has one generic player and fallback order lives in `voiceConfig`.
- Interview sessions follow a server-validated handshake (`interviews.session_state`, `setSessionState` compare-and-set): device check → audio check → YES → countdown → INTERVIEW_ACTIVE; questions are only generated and answers only accepted once INTERVIEW_ACTIVE, so nothing said during the handshake can become an answer.
- `submitAnswer` requires a client `turnId` stored as `interview_answers.client_turn_id` (unique per interview), so repeated transcript events or retries never create a second answer or a second analysis.
- Webcam analysis (`src/services/webcamAnalyzer/`) is optional and browser-only: video never leaves the device, it records only observable events (never emotions/traits) via `src/lib/webcam.functions.ts`, which accepts writes only while INTERVIEW_ACTIVE, and every failure is swallowed so the voice interview never depends on it.
- Final reports are built by `generateReport` (`src/lib/report.functions.ts`) from already-saved interview data plus one AI summary call, stored once in `interview_reports` and only for completed interviews, so reopening a report costs nothing.
- Admin access is a row in `public.user_roles` checked server-side in `getAdminOverview` (`src/lib/admin.functions.ts`) before any privileged user listing, so admin status can never be self-granted or faked client-side.
- Target role / job description are stored on `interviews` and injected into the existing planning and question prompts (planner also returns `required_skills`), so role matching adds no extra AI calls; report role fit is computed deterministically from saved evidence.
- Integrity observations (tab switches, window focus loss, pastes) go through `recordIntegrityEvents` (`src/lib/integrity.functions.ts`) into `interview_integrity_events`, accepted only while INTERVIEW_ACTIVE, and are reported as neutral facts — never as honesty judgements.
- Short meta-requests ("repeat that", "give me a second") are caught client-side by `voiceEngine/intentDetector.ts` before `submitAnswer`, so they are never saved or scored and cost no AI calls.
