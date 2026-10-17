# Microphone picker and faster replies

## What changes for your friends

**1. Choose your microphone**
- On the "Your interview is ready" screen, after mic access is allowed, a **Microphone** dropdown lists every input device (laptop mic, headset, AirPods, USB mic…), by name.
- A live sound bar under it moves as they talk, so they can see the right mic is picked before starting.
- The choice is remembered on that browser for next time. If that mic gets unplugged, the app falls back to the default one and says so.
- During the interview, a small mic button opens the same list, so they can switch mics mid-interview without restarting.
- If the chosen mic stays silent for a while, a hint appears: "We can't hear you — try another microphone."

**2. Less waiting after they stop talking**
- The app currently waits 2.2 seconds of silence before deciding the person is finished. This drops to about 1.3 seconds, which feels closer to a real conversation without cutting people off mid-thought.
- As soon as they finish talking, the screen shows "Got it — thinking…", so the wait doesn't feel like the app froze.
- The next question starts playing as soon as the first part of the voice arrives, instead of waiting for the whole clip.

**Not included for now:** The AI reads each answer and writes the next question, and that still takes a few seconds. As you asked, I'm leaving that part for later.

## Technical details
- `Microphone.start(deviceId?)`: `getUserMedia({ audio: { deviceId: { exact }, echoCancellation, noiseSuppression, autoGainControl } })`. If the exact device fails (OverconstrainedError/NotFoundError), retry with the default mic. Add `switchDevice(id)`, which swaps the stream and analyser source, discards any half-recorded turn, and keeps the `acceptingAnswers` gate as it is.
- DeviceCheck: after permission is granted, call `enumerateDevices()` (labels only show once permission is granted) and listen for `devicechange`. Store the choice in `localStorage` (`jg.micDeviceId`), read in `useEffect` to avoid hydration issues. The preview level meter uses a temporary stream that is closed before the interview mic opens.
- `connectVoice` passes the chosen device id. The live view gets a device popover that calls `switchDevice`.
- Silence hint: if the level stays under the speech threshold for about 8 seconds while listening, show the hint.
- `voiceConfig.vad.endOfTurnSilenceMs` 2200 → 1300. The minimum-duration and size filters stay, so coughs are still ignored.
- New "processing" live state set in `onTurnEnd` before transcription. Check that `voiceProviderManager` plays audio progressively from the stream rather than after the full stream ends, and fix that if it doesn't.
- No changes to the backend, database, or AI calls.
