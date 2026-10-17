# Controlled voice interview: ready check, audio check, countdown

Rework the interview page so nothing starts on its own. The candidate always moves through clear, explicit steps before the first question, and answers are stored exactly once. The text interview, resume analysis and all existing voice services stay as they are.

## What the candidate will see

```text
Open interview
 -> "Your interview is ready" + device check (mic, speaker, connection)
 -> [I'm Ready to Start]            (only enabled when all checks pass)
 -> AI: "Before we begin, I want to make sure you can hear me clearly. Can you hear me?"
 -> [Yes, I can hear you] / [No, I can't hear you]
      No  -> troubleshooting tips + [Test audio again] [Reconnect] [Cancel interview]
      Yes -> AI: "Perfect. Let's begin." -> 3 -> 2 -> 1 -> "Interview starting"
 -> first question (generated from the resume, never hard-coded)
 -> talk naturally; live transcript; AI stops talking if you interrupt
```

- "Allow Microphone" button when permission hasn't been asked yet; a clear blocked message if denied.
- Anything said during the audio check or countdown is ignored — no answer is created.
- Interrupting the AI only works once the real interview has started.
- "End Interview" asks for confirmation (Continue / End). Stored answers are kept; the interview is marked ended or cancelled.
- If the connection drops: "Connection interrupted. Reconnecting..." then, if that fails, [Retry connection] [Continue with text] [End interview].
- Refreshing mid-interview shows "Your previous interview session was interrupted" with [Resume Interview] / [End Interview]. Resuming re-reads the current question aloud without creating a new one.
- Silence or empty transcripts never create an answer; long pauses (natural thinking) don't cut an answer off.

## Gemini Live

The spec asks for Gemini Live as the main voice. It needs your own Google Gemini API key. The plan adds it as the first choice in the voice list, switched on automatically once you save a key (I'll show the secure form). Until then, the current chain (Lovable AI, Cartesia, Deepgram, browser voice) keeps working exactly as today. The interview decisions stay in the existing engine either way — Gemini Live only speaks and listens.

## Technical details

- **Session state (database)**: add `session_state` (enum of the spec's states) and `client_session_id` to `interviews`. New server function `setSessionState` validates allowed transitions server-side (e.g. COUNTDOWN only after AUDIO_CONFIRMED, INTERVIEW_ACTIVE only after COUNTDOWN); duplicate calls are no-ops, so double-clicking Yes causes one transition. `getInterview` returns it; the UI derives its screen only from this state plus a local sub-state machine (`useReducer`), never from text.
- **Engine gating**: `advanceInterview` gets a `phase` flag. Before INTERVIEW_ACTIVE it only runs planning (blueprint is prepared in the background during the device/audio check). The first question is generated only after the countdown moves the state to INTERVIEW_ACTIVE; `status = in_progress` is set then.
- **Duplicate prevention**: `submitAnswer` takes a client-generated `turnId`; add `client_turn_id` unique column on `interview_answers` (existing UNIQUE(question_id) kept). Repeated submits return the existing result instead of re-analysing. The orchestrator's existing sequence guard prevents two next questions.
- **Microphone**: add a `acceptingAnswers` gate in `Microphone`; barge-in and turn-end callbacks are dropped unless state is CANDIDATE_LISTENING/AI_SPEAKING during INTERVIEW_ACTIVE. End-of-turn silence raised slightly and a minimum speech length required before transcription.
- **Voice abstraction**: extend `VoiceProvider` with the spec's event-style methods (`startListening`, `stopListening`, `sendAudio`, `sendText`, `stopPlayback`, `onTranscript`, `onAudio`, `onError`, `onTurnComplete`, `onInterrupted`); existing providers implement them via adapters. Add `GeminiLiveProvider`: server route `/api/voice/live-token` (verifies bearer + ownership) mints a short-lived Gemini ephemeral token; the browser opens the Live WebSocket with it, streams 16 kHz PCM chunks, plays 24 kHz audio, uses Gemini's turn detection, interruption and input transcription. It is told to read the given text verbatim, not to converse. Fallback order in `voiceConfig`: gemini-live -> existing chain.
- **Refresh recovery**: on load, if `session_state` is INTERVIEW_ACTIVE (or a sub-state), show the resume prompt; resuming skips the audio check handshake only after a fresh explicit click (browsers require a click for audio anyway).
- **Security/privacy**: all IDs re-verified server-side as today; no raw audio stored; Gemini key server-only.
- Update AGENTS.md with the session-state and turn-id rules.
- Verify: Playwright run with a fake microphone through the full sequence (ready -> audio check -> No -> retry -> Yes -> countdown -> first question -> spoken answer stored once), plus double-Yes and refresh checks.
