/** Central, replaceable voice configuration. Client-safe (no secrets). */
export type TtsProviderId = "lovable" | "cartesia" | "elevenlabs" | "deepgram" | "google" | "azure" | "kokoro" | "browser";
export type SttProviderId = "lovable" | "deepgram" | "groq" | "assemblyai" | "elevenlabs";
export type VoiceProviderId = TtsProviderId;

export const providerNames: Record<TtsProviderId | SttProviderId, string> = {
  lovable: "Lovable AI (built-in)",
  cartesia: "Cartesia Sonic",
  elevenlabs: "ElevenLabs",
  deepgram: "Deepgram",
  google: "Google Cloud Text-to-Speech",
  azure: "Azure Speech",
  kokoro: "Kokoro (Hugging Face)",
  browser: "Browser voice",
  groq: "Groq Whisper",
  assemblyai: "AssemblyAI",
};

export const voiceConfig = {
  /** Interviewer voice priority: free-tier services first; Lovable AI (workspace credits) only as a last resort. */
  ttsOrder: ["cartesia", "deepgram", "elevenlabs", "google", "azure", "kokoro", "browser", "lovable"] as TtsProviderId[],
  /** Speech-to-text priority: free tiers first, Lovable AI last. */
  sttOrder: ["groq", "deepgram", "assemblyai", "elevenlabs", "lovable"] as SttProviderId[],
  voiceId: "Kore",
  model: "google/gemini-3.1-flash-tts-preview",
  transcriptionModel: "google/gemini-3.5-transcribe",
  language: "en",
  speed: 1.0,
  style: "calm, professional, friendly interviewer",
  cartesia: { model: "sonic-2", voiceId: "f786b574-daa5-4673-aa0c-cbe3e8534c02" },
  elevenlabs: { voiceId: "JBFqnCBsd6RMkjVDRZzb", model: "eleven_turbo_v2_5", sttModel: "scribe_v1" },
  deepgram: { ttsModel: "aura-2-thalia-en", sttModel: "nova-3" },
  google: { voice: "en-US-Neural2-F", languageCode: "en-US" },
  azure: { voice: "en-US-JennyNeural" },
  kokoro: { model: "fal-ai/kokoro/american-english", voice: "af_heart", speed: 1.0 },
  groq: { model: "whisper-large-v3-turbo" },
  /** Turn detection (client-side VAD). */
  vad: {
    speechThreshold: 0.035,
    bargeInThreshold: 0.07,
    minSpeechMs: 250,
    bargeInMs: 350,
    /** Silence after speech before we treat the answer as finished. Generous so natural pauses aren't cut. */
    endOfTurnSilenceMs: 1300,
  },
};
