import { FPS_STEPS, RECORDING_STATES, webcamConfig, type CameraState, type VisualEventType } from "./config";
import type { FaceDetector } from "./faceDetector";
import { boundingBox, inFrameRatio } from "./landmarkDetector";
import { analyzeGaze } from "./gazeAnalyzer";
import { analyzeHeadPose } from "./headPoseAnalyzer";
import { CameraQualityAnalyzer } from "./cameraQualityAnalyzer";
import { BehaviorEventAggregator, type QuestionMetrics, type Sample, type VisualEvent } from "./behaviorEventAggregator";

type Listener = (s: { camera: CameraState; analysis: "active" | "idle" | "unavailable" }) => void;

/**
 * Browser-only webcam analyzer. Never throws to the caller; any failure flips status to "unavailable"
 * so the voice interview is unaffected. Raw video never leaves the browser.
 */
export class WebcamAnalyzer {
  camera: CameraState = "CAMERA_NOT_REQUESTED";
  analysis: "active" | "idle" | "unavailable" = "idle";
  stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private detector: FaceDetector | null = null;
  private quality = new CameraQualityAnalyzer();
  private agg: BehaviorEventAggregator;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fpsIdx = 0;
  private slowCount = 0;
  private lastPose: { yaw: number; pitch: number } | null = null;
  private sampleN = 0;
  private lastLuma: number | null = null;
  private listeners = new Set<Listener>();
  private stopped = false;
  sessionState = "PREPARING";
  questionId: string | null = null;

  constructor() {
    this.agg = new BehaviorEventAggregator(() => ({ questionId: this.questionId, sessionState: this.sessionState }));
  }

  get recording() {
    return (RECORDING_STATES as readonly string[]).includes(this.sessionState);
  }

  onChange(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit() {
    for (const l of this.listeners) l({ camera: this.camera, analysis: this.analysis });
  }

  private setCamera(c: CameraState) {
    this.camera = c;
    this.emit();
  }

  /** Requests the camera once per call. Only call from a user action. */
  async start(): Promise<CameraState> {
    this.stopped = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setCamera("CAMERA_UNAVAILABLE");
      return this.camera;
    }
    this.setCamera("REQUESTING_CAMERA");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false });
    } catch (e) {
      const name = (e as DOMException)?.name;
      this.setCamera(name === "NotAllowedError" || name === "SecurityError" ? "CAMERA_DENIED" : name === "NotFoundError" || name === "OverconstrainedError" ? "CAMERA_UNAVAILABLE" : "CAMERA_ERROR");
      return this.camera;
    }
    this.setCamera("CAMERA_GRANTED");
    for (const track of this.stream.getVideoTracks()) {
      track.addEventListener("ended", () => {
        if (this.stopped) return;
        if (this.recording) this.agg.technical("CAMERA_INTERRUPTED", { reason: "camera stopped" });
        this.fail("CAMERA_ERROR");
      });
    }
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = this.stream;
    try {
      await this.video.play();
    } catch {
      /* preview element may still play later */
    }
    this.setCamera("CAMERA_READY");
    void this.loadDetector();
    return this.camera;
  }

  private async loadDetector() {
    try {
      const { createMediaPipeDetector } = await import("./faceDetector");
      this.detector = await createMediaPipeDetector();
      if (this.stopped) return this.detector.close();
      this.analysis = "active";
      this.emit();
      this.schedule();
    } catch (e) {
      console.warn("[webcam] detector unavailable", e);
      this.analysis = "unavailable";
      this.emit();
    }
  }

  private schedule() {
    if (this.stopped) return;
    const fps = FPS_STEPS[this.fpsIdx] ?? 2;
    this.timer = setTimeout(() => this.tick(), 1000 / fps);
  }

  private tick() {
    if (this.stopped || !this.detector || !this.video) return;
    if (document.hidden || !this.recording || this.video.readyState < 2) return this.schedule();
    const t0 = performance.now();
    try {
      this.agg.add(this.sample(Date.now()));
    } catch (e) {
      console.warn("[webcam] sample failed", e);
      this.analysis = "unavailable";
      this.emit();
      return;
    }
    const took = performance.now() - t0;
    if (took > webcamConfig.slowFrameMs) {
      if (++this.slowCount >= 5 && this.fpsIdx < FPS_STEPS.length - 1) {
        this.fpsIdx++;
        this.slowCount = 0;
      }
    } else this.slowCount = Math.max(0, this.slowCount - 1);
    this.schedule();
  }

  private sample(t: number): Sample {
    const faces = this.detector!.detect(this.video!, performance.now());
    const conditions: Sample["conditions"] = {};
    const set = (k: VisualEventType, confidence: number, details?: Record<string, unknown>) => (conditions[k] = { confidence, details: details ?? {} });

    if (this.sampleN++ % 8 === 0) this.lastLuma = this.quality.luma(this.video!);
    if (this.quality.isLowLight(this.lastLuma)) set("LOW_LIGHT", 0.7, { meanBrightness: Math.round(this.lastLuma!) });

    if (faces.length === 0) {
      set("FACE_NOT_VISIBLE", 0.8);
      this.lastPose = null;
      return { t, faces: 0, conditions };
    }
    if (faces.length > 1) set("MULTIPLE_FACES_DETECTED", 0.75, { faceCount: faces.length });

    const primary = faces.reduce((a, b) => (boundingBox(b.landmarks).area > boundingBox(a.landmarks).area ? b : a));
    const box = boundingBox(primary.landmarks);
    const inFrame = inFrameRatio(primary.landmarks);
    if (inFrame < 0.85) set("FACE_PARTIALLY_VISIBLE", 0.7, { inFramePct: Math.round(inFrame * 100) });
    const framing = this.quality.framing(box);
    if (framing) set("POOR_FRAMING", 0.7, { framing });

    const pose = analyzeHeadPose(primary);
    if (pose) {
      if (pose.away) set("HEAD_TURNED_AWAY", 0.7, { direction: pose.direction });
      if (this.lastPose) {
        const d = Math.max(Math.abs(pose.yaw - this.lastPose.yaw), Math.abs(pose.pitch - this.lastPose.pitch));
        if (d > webcamConfig.headMovementDeg) set("HEAD_MOVEMENT", 0.6, { degrees: Math.round(d) });
      }
      this.lastPose = { yaw: pose.yaw, pitch: pose.pitch };
    }
    const gaze = analyzeGaze(primary.landmarks);
    if ((gaze?.away || pose?.away) && !conditions.FACE_PARTIALLY_VISIBLE)
      set("LOOKING_AWAY", 0.6, { direction: gaze?.away ? gaze.direction : pose?.direction ?? "away" });
    return { t, faces: faces.length, conditions };
  }

  drain(): VisualEvent[] {
    return this.agg.drain();
  }

  flushOpen() {
    this.agg.closeAll();
  }

  metrics(questionId: string): QuestionMetrics | null {
    return this.agg.metrics(questionId);
  }

  private fail(c: CameraState) {
    this.analysis = "unavailable";
    this.setCamera(c);
    this.halt();
  }

  private halt() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try {
      this.detector?.close();
    } catch {
      /* ignore */
    }
    this.detector = null;
  }

  stop() {
    this.stopped = true;
    this.agg.closeAll();
    this.halt();
  }
}
