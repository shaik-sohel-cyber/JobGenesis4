import type { Point } from "./faceDetector";
import { LM } from "./landmarkDetector";
import { webcamConfig } from "./config";

export type Gaze = { h: number; v: number; direction: "center" | "left" | "right" | "up" | "down"; away: boolean } | null;

/** Approximate gaze from iris position within each eye (0 = centre). Approximate only. */
export function analyzeGaze(p: Point[]): Gaze {
  if (p.length < 478) return null;
  const ratio = (iris: Point, a: Point, b: Point) => {
    const w = b.x - a.x;
    return w === 0 ? 0 : (iris.x - a.x) / w - 0.5;
  };
  const vratio = (iris: Point, top: Point, bottom: Point) => {
    const h = bottom.y - top.y;
    return h === 0 ? 0 : (iris.y - top.y) / h - 0.5;
  };
  const h =
    (ratio(p[LM.leftIris]!, p[LM.leftEyeOuter]!, p[LM.leftEyeInner]!) +
      ratio(p[LM.rightIris]!, p[LM.rightEyeInner]!, p[LM.rightEyeOuter]!)) /
    2;
  const v =
    (vratio(p[LM.leftIris]!, p[LM.leftEyeTop]!, p[LM.leftEyeBottom]!) +
      vratio(p[LM.rightIris]!, p[LM.rightEyeTop]!, p[LM.rightEyeBottom]!)) /
    2;
  const t = webcamConfig.gazeAwayThreshold;
  let direction: NonNullable<Gaze>["direction"] = "center";
  if (Math.abs(h) > t && Math.abs(h) >= Math.abs(v)) direction = h > 0 ? "left" : "right";
  else if (Math.abs(v) > t * 1.4) direction = v > 0 ? "down" : "up";
  return { h, v, direction, away: direction !== "center" };
}
