/** Voice provider abstraction. Providers only speak and transcribe — no interview logic. */
import type { VoiceProviderId } from "./voiceConfig";

export interface VoiceProvider {
  id: VoiceProviderId;
  isAvailable(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Speaks text; resolves when playback ends or is interrupted. */
  speak(text: string): Promise<void>;
  /** Stops playback immediately (barge-in). */
  interrupt(): Promise<void>;
  /** Transcribes one finished speech segment. onPartial receives live text. */
  transcribe(audio: Blob, onPartial: (text: string) => void): Promise<string>;
}

export class VoiceProviderError extends Error {
  constructor(public kind: "rate_limit" | "unavailable" | "network" | "auth", message: string = kind) {
    super(message);
  }
}
