import { voiceConfig } from "./voiceConfig";

type Handlers = {
  /** Candidate started speaking (used for barge-in and UI). */
  onSpeechStart: () => void;
  /** Candidate finished a turn; audio is the recorded utterance. */
  onTurnEnd: (audio: Blob, durationMs: number) => void;
  onLevel?: (level: number) => void;
};

/**
 * Captures the microphone and detects turns with a simple energy-based VAD.
 * Each utterance is recorded separately (never the whole interview) and discarded after transcription.
 */
export class Microphone {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private raf = 0;
  private speaking = false;
  private aboveSince = 0;
  private lastVoice = 0;
  private turnStart = 0;
  muted = false;
  /** When true (AI speaking) a higher threshold is used so echo doesn't trigger barge-in. */
  aiSpeaking = false;
  listening = false;
  /**
   * Master gate: only true once the interview is INTERVIEW_ACTIVE. During the audio check and countdown
   * nothing the candidate says can start a turn, barge in, or become an answer.
   */
  acceptingAnswers = false;

  private source: MediaStreamAudioSourceNode | null = null;
  /** True when the requested device couldn't be opened and the default mic is used instead. */
  usedFallback = false;

  constructor(private h: Handlers) {}

  async start(deviceId?: string | null) {
    this.stream = await openMicStream(deviceId, (fb) => (this.usedFallback = fb));
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.attach();
    this.loop();
  }

  private attach() {
    this.source?.disconnect();
    this.source = this.ctx!.createMediaStreamSource(this.stream!);
    this.source.connect(this.analyser!);
  }

  /** Swaps to another input device mid-interview; any half-recorded turn is dropped. */
  async switchDevice(deviceId: string) {
    const next = await openMicStream(deviceId, (fb) => (this.usedFallback = fb));
    this.discardTurn();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = next;
    this.attach();
  }

  get deviceId(): string | null {
    return this.stream?.getAudioTracks()[0]?.getSettings().deviceId ?? null;
  }

  private loop = () => {
    const a = this.analyser!;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    this.h.onLevel?.(this.muted ? 0 : rms);
    const now = performance.now();
    const v = voiceConfig.vad;
    const threshold = this.aiSpeaking ? v.bargeInThreshold : v.speechThreshold;
    const active = !this.muted && this.acceptingAnswers && (this.listening || this.aiSpeaking);
    if (this.speaking && !this.acceptingAnswers) this.discardTurn();

    if (active && rms > threshold) {
      if (!this.aboveSince) this.aboveSince = now;
      this.lastVoice = now;
      const needed = this.aiSpeaking ? v.bargeInMs : v.minSpeechMs;
      if (!this.speaking && now - this.aboveSince >= needed) this.beginTurn(now);
    } else {
      this.aboveSince = 0;
    }
    if (this.speaking && (this.muted || now - this.lastVoice > v.endOfTurnSilenceMs)) this.endTurn(now);
    this.raf = requestAnimationFrame(this.loop);
  };

  private beginTurn(now: number) {
    this.speaking = true;
    this.turnStart = now;
    this.chunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    this.recorder = new MediaRecorder(this.stream!, mime ? { mimeType: mime } : undefined);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(250);
    this.h.onSpeechStart();
  }

  private discardTurn() {
    this.speaking = false;
    if (this.recorder?.state === "recording") {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.recorder = null;
    this.chunks = [];
  }

  private endTurn(now: number) {
    this.speaking = false;
    const rec = this.recorder;
    const dur = now - this.turnStart - voiceConfig.vad.endOfTurnSilenceMs;
    if (!rec) return;
    rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: "audio/webm" });
      this.chunks = [];
      // Ignore coughs/clicks and anything captured after the gate closed.
      if (blob.size > 2000 && dur > 500 && this.acceptingAnswers) this.h.onTurnEnd(blob, dur);
    };
    rec.stop();
    this.recorder = null;
  }

  async stop() {
    cancelAnimationFrame(this.raf);
    if (this.recorder?.state === "recording") {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => {});
  }
}

const AUDIO_OPTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/** Opens the chosen mic; falls back to the default one if it's unplugged or unavailable. */
export async function openMicStream(
  deviceId: string | null | undefined,
  onFallback?: (fb: boolean) => void,
): Promise<MediaStream> {
  if (deviceId) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO_OPTS, deviceId: { exact: deviceId } } });
      onFallback?.(false);
      return s;
    } catch (e) {
      if ((e as DOMException)?.name === "NotAllowedError") throw e;
    }
  }
  const s = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_OPTS });
  onFallback?.(!!deviceId);
  return s;
}

export const MIC_STORAGE_KEY = "jg.micDeviceId";

export async function listMics(): Promise<MediaDeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput" && d.deviceId !== "communications");
}
