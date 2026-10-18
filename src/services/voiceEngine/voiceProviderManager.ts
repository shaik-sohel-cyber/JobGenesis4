import { VoiceProviderError, type VoiceProvider } from "./provider";
import { BrowserSpeechProvider, ServerSpeechProvider, transcribeSegment } from "./providers";
import { voiceConfig, type SttProviderId, type VoiceProviderId } from "./voiceConfig";

export type ProviderStatus = { provider: VoiceProviderId | "auto"; reconnecting: boolean };

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
  async speak(text: string): Promise<boolean> {
    await this.init();
    let retried = false;
    while (this.current) {
      try {
        await this.current.speak(text);
        this.emit(false);
        return true;
      } catch (e) {
        const kind = e instanceof VoiceProviderError ? e.kind : "unavailable";
        if (kind === "auth") throw e;
        if (!retried && kind === "network") {
          retried = true;
          this.emit(true);
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        await this.current.disconnect().catch(() => {});
        if (this.idx >= this.chain.length - 1) return false;
        this.idx++;
        retried = false;
        this.emit(true);
        await this.current.connect().catch(() => {});
      }
    }
    return false;
  }
  interrupt() {
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
    for (const p of this.chain) await p.disconnect().catch(() => {});
  }
}
