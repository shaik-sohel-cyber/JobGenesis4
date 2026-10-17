import type { Point } from "./faceDetector";

/** Landmark indices (MediaPipe 478-point mesh). Isolated so another mesh can be mapped here. */
export const LM = {
  leftEyeOuter: 33,
  leftEyeInner: 133,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  leftEyeTop: 159,
  leftEyeBottom: 145,
  rightEyeTop: 386,
  rightEyeBottom: 374,
  leftIris: 468,
  rightIris: 473,
  noseTip: 1,
  chin: 152,
  forehead: 10,
};

export function boundingBox(points: Point[]) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, area: Math.max(0, maxX - minX) * Math.max(0, maxY - minY) };
}

/** Fraction of landmarks inside the frame — low values mean the face is partly out of view. */
export function inFrameRatio(points: Point[]) {
  if (!points.length) return 0;
  return points.filter((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1).length / points.length;
}
