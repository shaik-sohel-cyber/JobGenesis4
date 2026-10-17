/** Central, replaceable webcam analysis settings. Observation only — never interpretation. */
export const WEBCAM_ANALYSIS_FPS = 8;
export const FPS_STEPS = [8, 5, 3, 2] as const;

export const webcamConfig = {
  /** Frame-time (ms) above which sampling slows down. */
  slowFrameMs: 70,
  /** Minimum duration before a condition is recorded as an event. */
  minEventMs: {
    FACE_NOT_VISIBLE: 1500,
    FACE_PARTIALLY_VISIBLE: 1500,
    FACE_OCCLUDED: 1500,
    MULTIPLE_FACES_DETECTED: 1000,
    LOOKING_AWAY: 1500,
    HEAD_TURNED_AWAY: 1500,
    POOR_FRAMING: 3000,
    LOW_LIGHT: 4000,
  } as Record<string, number>,
  /** Gaze ratio deviation from centre that counts as looking away. */
  gazeAwayThreshold: 0.28,
  /** Head yaw/pitch (degrees) that counts as turned away. */
  headYawDeg: 28,
  headPitchDeg: 22,
  /** Change in yaw/pitch (degrees) between samples that counts as large movement. */
  headMovementDeg: 18,
  /** Face box area (fraction of frame) bounds for framing. */
  minFaceArea: 0.03,
  maxFaceArea: 0.45,
  /** Mean luma (0-255) below which the image is considered too dark. */
  lowLightLuma: 45,
  flushIntervalMs: 10000,
  wasmBase: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
  modelUrl:
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
};

/** Session states in which observations may be recorded. */
export const RECORDING_STATES = ["INTERVIEW_ACTIVE"] as const;

export type CameraState =
  | "CAMERA_NOT_REQUESTED"
  | "REQUESTING_CAMERA"
  | "CAMERA_GRANTED"
  | "CAMERA_READY"
  | "CAMERA_DENIED"
  | "CAMERA_UNAVAILABLE"
  | "CAMERA_ERROR";

export type VisualEventType =
  | "FACE_NOT_VISIBLE"
  | "FACE_PARTIALLY_VISIBLE"
  | "FACE_OCCLUDED"
  | "MULTIPLE_FACES_DETECTED"
  | "LOOKING_AWAY"
  | "HEAD_TURNED_AWAY"
  | "HEAD_MOVEMENT"
  | "POOR_FRAMING"
  | "LOW_LIGHT"
  | "CAMERA_INTERRUPTED"
  | "CAMERA_RECOVERED";
