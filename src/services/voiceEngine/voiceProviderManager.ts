import { VoiceProviderError, type VoiceProvider } from "./provider";
import { BrowserSpeechProvider, ServerSpeechProvider, transcribeSegment } from "./providers";
import { voiceConfig, type SttProviderId, type VoiceProviderId } from "./voiceConfig";

export type ProviderStatus = { provider: VoiceProviderId | "auto"; reconnecting: boolean };
export type SpeechResult = "completed" | "interrupted" | "unavailable";

/**
 * Tries the configured voice and transcription providers in order. Unavailable
 * providers fail over without exposing configured provider status to candidates.
 */
export class VoiceProviderManager {
  private chain: VoiceProvider[] = [];
  private stt: Array<SttProviderId | "auto"> = ["auto"];
  private idx = 0;
  private sttIdx = 0;
  private ready: Promise<void> | null = null;
  private speechGeneration = 0;
  constructor(private interviewId: string, private onStatus: (s: ProviderStatus) => void) {}
  get current() {
    return this.chain[this.idx];
  }
  private emit(reconnecting: boolean) {
    if (this.current) this.onStatus({ provider: this.current.id, reconnecting });
  }
  private init() {
    this.ready ??= (async () => {
      this.chain = [
        new ServerSpeechProvider(this.interviewId, "auto"),
        new BrowserSpeechProvider(this.interviewId),
      ].filter((p) => p.isAvailable());
      this.stt = ["auto"];
      this.emit(false);
    })();
    return this.ready;
  }
  async connect() {
    await this.init();
    await this.current?.connect().catch(() => {});
  }
  /** Returns false when no voice service could speak (the text stays on screen). */
  async speak(text: string): Promise<SpeechResult> {
    await this.init();
    const generation = ++this.speechGeneration;
    await this.current?.interrupt();
    if (generation !== this.speechGeneration) return "interrupted";
    let retried = false;
    while (this.current) {
      try {
        await this.current.speak(text);
        if (generation !== this.speechGeneration) return "interrupted";
        this.emit(false);
        return "completed";
      } catch (e) {
        if (generation !== this.speechGeneration) return "interrupted";
        const kind = e instanceof VoiceProviderError ? e.kind : "unavailable";
        if (kind === "auth") throw e;
        if (!retried && kind === "network") {
          retried = true;
          this.emit(true);
          await new Promise((r) => setTimeout(r, 1200));
          if (generation !== this.speechGeneration) return "interrupted";
          continue;
        }
        void this.current.interrupt();
        if (generation !== this.speechGeneration) return "interrupted";
        if (this.idx >= this.chain.length - 1) return "unavailable";
        this.idx++;
        retried = false;
        this.emit(true);
        await this.current.connect().catch(() => {});
        if (generation !== this.speechGeneration) return "interrupted";
      }
    }
    return "unavailable";
  }
  async interrupt() {
    this.speechGeneration += 1;
    return this.current?.interrupt();
  }
  async transcribe(audio: Blob, onPartial: (t: string) => void): Promise<string> {
    await this.init();
    let retried = false;
    while (true) {
      try {
        return await transcribeSegment(this.interviewId, this.stt[this.sttIdx] ?? "lovable", audio, onPartial);
      } catch (e) {
        const kind = e instanceof VoiceProviderError ? e.kind : "unavailable";
        if (kind === "auth") throw e;
        this.emit(true);
        if (!retried && kind !== "unavailable") {
          retried = true;
          await new Promise((r) => setTimeout(r, kind === "rate_limit" ? 2500 : 1200));
          continue;
        }
        if (this.sttIdx >= this.stt.length - 1) throw e;
        this.sttIdx++;
        retried = false;
      }
    }
  }
  async disconnect() {
    this.speechGeneration += 1;
    for (const p of this.chain) await p.disconnect().catch(() => {});
  }
}
