# More voice options for the AI interviewer

## Current state
- Interviewer voice: built-in Lovable AI voice (no key) -> ElevenLabs (unconnected) -> browser voice.
- Speech-to-text: built-in Lovable AI only.

## What we add
Voice services with free tiers, each switched on automatically when its API key is saved. With no key, a service is skipped and nothing breaks.

Interviewer voice (text-to-speech), in fallback order:
1. Lovable AI (built-in, no key) — stays primary
2. Cartesia (Sonic) — very low delay, free monthly credits
3. ElevenLabs — free monthly characters
4. Deepgram Aura — free starter credit
5. Google Cloud Text-to-Speech — free monthly characters
6. Azure Speech — free 0.5M characters/month
7. Browser voice — last resort, always works

Speech-to-text, in fallback order:
1. Lovable AI (built-in)
2. Deepgram Nova — free starter credit, fast
3. Groq Whisper — free tier
4. AssemblyAI — free hours
5. ElevenLabs Scribe

The order can be changed in one settings list. After a failure (limit reached, outage) the app retries once, then moves to the next service. The candidate only sees "Reconnecting…".

## Keys
Keys are optional and stored securely on the server, never in the browser. After you approve, a secure form asks for any keys you want: CARTESIA_API_KEY, ELEVENLABS_API_KEY, DEEPGRAM_API_KEY, GOOGLE_TTS_API_KEY, AZURE_SPEECH_KEY + AZURE_SPEECH_REGION, GROQ_API_KEY, ASSEMBLYAI_API_KEY. You can skip any of them. The ElevenLabs connector is checked first.

## Settings page
A read-only "Voice services" list shows which services are active and which are missing a key.

## Technical details
- New server-side adapters `src/services/voiceEngine/tts/*.server.ts` and `stt/*.server.ts`, all following one interface: `synthesize(text) -> PCM16 24kHz stream` and `transcribe(file) -> text`. They are loaded dynamically.
- `/api/voice/speak` and `/api/voice/transcribe` take an optional `provider` field. The server checks the caller, confirms the provider is enabled (its key is present), and converts its output to the SSE shape the client already reads (`speech.audio.delta`, `transcript.text.*`). The browser playback code stays the same.
- New `/api/voice/providers` route: returns only which providers are enabled (booleans).
- The client `VoiceProviderManager` builds its chain from that list. There is one generic `ServerSpeechProvider(id)` in place of the separate provider classes, plus the browser provider. Transcription gets the same fallback chain.
- `voiceConfig` holds the ordered lists and each provider's default voice and model IDs.
- The interview engine is unchanged. AGENTS.md is updated.
- Each adapter with a saved key gets a live test.
