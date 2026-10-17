# Phase 4 (Webcam): Observable Camera Signals During the Interview

Adds an optional, privacy-first camera layer next to the existing voice interview. It records only things the camera can see (for example, face visible, looking away for 4.2 s, two faces). It never guesses emotions, honesty or personality. The voice interview never waits on the camera.

## What the candidate sees
1. **Camera consent card**: shown after the device check and before "I'm Ready". It explains what is and is not analyzed and offers **Enable Camera Analysis** or **Continue Without Camera**. The choice is saved for the interview.
2. **Permission flow**: Not requested → Requesting → Granted → Ready. If access is denied, unavailable or fails, a calm message appears with **Try Camera Again** (asks only when the candidate clicks) and **Continue Without Camera**.
3. **During the interview**: a small preview in a corner that never covers the controls or transcript, plus a dot labelled "Camera analysis active" or "Camera analysis unavailable". If anything breaks, a non-blocking notice says: "Camera analysis is temporarily unavailable. Your interview will continue."
4. The preview can run during preflight to check that the camera works. **Observations are recorded only while the interview is active**, never during the audio check or countdown.

## What gets recorded
Timestamped events linked to the interview, the current question when there is one, and the stage:
- Face visible / not visible / partially visible / covered
- More than one face (with the count)
- Looking away from the camera (approximate direction and duration)
- Head turned or tilted away; large head movement
- Poor framing (too close, too far, off-centre)
- Low light or poor visibility (only when it can be detected reliably)
- Camera interruptions (lost, recovered, permission revoked)

Each event has a start time, duration and confidence. A per-question summary is also stored (for example, percent of time the face was visible, time spent looking away, number of events). Raw video never leaves the browser. Candidates cannot see these observations; they are saved for the Phase 5 report.

## Technical details
- **Library**: MediaPipe Tasks Vision FaceLandmarker (WASM, runs in the browser, loaded only after hydration). It is wrapped behind interfaces so it can be replaced later.
- **Modules** in `src/services/webcamAnalyzer/` (client-only):
  `config.ts` (WEBCAM_ANALYSIS_FPS = 8, thresholds, minimum event durations), `faceDetector.ts` (interface + MediaPipe adapter), `landmarkDetector.ts`, `gazeAnalyzer.ts` (iris and eye-corner ratios), `headPoseAnalyzer.ts` (yaw/pitch/roll from the transformation matrix), `cameraQualityAnalyzer.ts` (brightness sampled from a downscaled canvas, framing from the face box), `behaviorEventAggregator.ts` (turns per-frame samples into debounced events and per-question rollups), `webcamAnalyzer.ts` (orchestrator: camera lifecycle, sampling loop, error isolation), `index.ts` (status set to "available").
- **Adaptive sampling**: a requestAnimationFrame/timer loop measures how long inference takes. When the loop is slow it lowers the frame rate (8 → 5 → 3 → 2) and pauses while the tab is hidden. All errors are caught locally and switch the status to unavailable.
- **Gating**: the analyzer receives the current session state and question ID from `interview.$id.tsx`. It records only in INTERVIEW_ACTIVE and its sub-states.
- **Database** (one migration with GRANTs and RLS, ownership through `interviews.user_id = auth.uid()`):
  - `interviews.camera_consent` (`granted` | `declined` | null) and `camera_state` text
  - `interview_visual_events` (interview_id, question_id null, event_type, started_at, duration_ms, confidence, details jsonb, session_state)
  - `interview_visual_summaries` (interview_id, question_id, metrics jsonb, unique per question)
- **Server functions** in `src/lib/webcam.functions.ts` (requireSupabaseAuth, ownership checks, Zod validation, capped sizes): `setCameraConsent`, `recordVisualEvents` (batched every ~10 s and when the question changes; deduplicated by a client event ID with a unique index), `upsertVisualSummary`. Writes are rejected unless the session is INTERVIEW_ACTIVE. If a write fails, it is dropped quietly and the interview continues.
- **No impact on voice**: the camera stream is separate from the microphone stream. The analyzer starts with a dynamic import, so voice code never depends on it.
- `getInterview` stays free of evaluation data and does not return visual events.
- AGENTS.md gets a rule: the webcam analyzer runs only in the browser, is optional and records observations only.
- Not in this phase: the report, any interpretation of signals, and server-side video processing.
