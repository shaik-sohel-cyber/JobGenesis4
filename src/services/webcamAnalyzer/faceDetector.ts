import { webcamConfig } from "./config";

export type Point = { x: number; y: number; z: number };
export type DetectedFace = {
  landmarks: Point[];
  /** Column-major 4x4 facial transformation matrix, if the backend provides one. */
  matrix: number[] | null;
};

/** Library-agnostic face detector. Swap the implementation without touching the analyzer. */
export interface FaceDetector {
  detect(video: HTMLVideoElement, timestampMs: number): DetectedFace[];
  close(): void;
}

/** MediaPipe FaceLandmarker adapter (browser WASM). Loaded lazily. */
export async function createMediaPipeDetector(): Promise<FaceDetector> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(webcamConfig.wasmBase);
  const make = (delegate: "GPU" | "CPU") =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: webcamConfig.modelUrl, delegate },
      runningMode: "VIDEO",
      numFaces: 3,
      outputFacialTransformationMatrixes: true,
    });
  let lm;
  try {
    lm = await make("GPU");
  } catch {
    lm = await make("CPU");
  }
  return {
    detect(video, ts) {
      const r = lm.detectForVideo(video, ts);
      return (r.faceLandmarks ?? []).map((landmarks, i) => ({
        landmarks: landmarks as Point[],
        matrix: r.facialTransformationMatrixes?.[i]?.data ? Array.from(r.facialTransformationMatrixes[i].data) : null,
      }));
    },
    close() {
      lm.close();
    },
  };
}
