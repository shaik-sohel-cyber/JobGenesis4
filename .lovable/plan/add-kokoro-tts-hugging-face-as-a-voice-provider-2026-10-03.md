# Add Kokoro TTS (Hugging Face) as a voice provider

## What we build
A new interviewer-voice service: **Kokoro-82M** via the Hugging Face Inference API (serverless, no card, uses your HF token's free monthly credits). It follows the exact adapter pattern the other voice services use, so it switches on automatically when its key is saved and is skipped silently otherwise.

Priority order becomes:
`Cartesia → Deepgram → ElevenLabs → Google → Azure → Kokoro → Browser → Lovable AI`

Speech-to-text is unchanged.

## Files changed
1. **`src/services/voiceEngine/voiceConfig.ts`**
   - Add `"kokoro"` to `TtsProviderId`.
   - Add to `providerNames`: "Kokoro (Hugging Face)".
   - Insert `"kokoro"` into `ttsOrder` after `"azure"`.
   - Add config: `{ model: "hexgrad/Kokoro-82M", voice: "af_heart", speed: 1.0 }` (replaceable voice id list kept in one place).

2. **`src/services/voiceEngine/tts.server.ts`**
   - `enabledProviders()`: `kokoro: !!env("HUGGINGFACE_API_KEY")`.
   - New `synthesize` case `kokoro`: `POST https://router.huggingface.co/hf-inference/models/hexgrad/Kokoro-82M` with `Authorization: Bearer <key>`, body `{ inputs: text, parameters: { voice } }`. Response is WAV audio — strip the 44-byte WAV header and return raw PCM16 as a stream, same as the Google adapter already does. Errors mapped through the existing `UpstreamError` (429 stays 429, everything else 502).

3. **`src/routes/api/voice/speak.ts`**
   - Add `"kokoro"` to the Zod `provider` enum.

4. No client changes needed: `ServerSpeechProvider` and the voice fallback manager already iterate over `ttsOrder`, and the Settings page reads `ttsOrder` + `/api/voice/providers`, so "Kokoro (Hugging Face)" appears in the Voice services list automatically (Active once the key is saved, "Needs key" before).

## Key
- After you approve, a secure form asks for **`HUGGINGFACE_API_KEY`** (a Hugging Face access token with Inference permission — created free at huggingface.co/settings/tokens, no card). Stored server-side only, never in the browser.

## Verification
- Live test the Kokoro adapter once the key is saved (synthesize a short sentence, confirm SSE audio bytes and correct 24 kHz PCM).
- Confirm Settings shows Kokoro as "Active", and run one spoken interview turn to hear it fall in line behind the other free services.
- Type check + build must pass before finishing.
