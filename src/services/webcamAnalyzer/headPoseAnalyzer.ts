import type { DetectedFace } from "./faceDetector";
import { LM } from "./landmarkDetector";
import { webcamConfig } from "./config";

export type HeadPose = { yaw: number; pitch: number; roll: number; away: boolean; direction: string };

const deg = (r: number) => (r * 180) / Math.PI;

/** Head orientation in degrees, from the transformation matrix or a landmark fallback. */
export function analyzeHeadPose(face: DetectedFace): HeadPose | null {
  let yaw: number, pitch: number, roll: number;
  const m = face.matrix;
  if (m && m.length === 16) {
    // Column-major rotation part.
    const r00 = m[0]!, r10 = m[1]!, r20 = m[2]!, r21 = m[6]!, r22 = m[10]!;
    yaw = deg(Math.asin(-Math.max(-1, Math.min(1, r20))));
    pitch = deg(Math.atan2(r21, r22));
    roll = deg(Math.atan2(r10, r00));
  } else {
    const p = face.landmarks;
    const nose = p[LM.noseTip], l = p[LM.leftEyeOuter], r = p[LM.rightEyeOuter], top = p[LM.forehead], chin = p[LM.chin];
    if (!nose || !l || !r || !top || !chin) return null;
    const mid = (l.x + r.x) / 2;
    yaw = ((nose.x - mid) / Math.max(0.01, r.x - l.x)) * 90;
    pitch = (((nose.y - top.y) / Math.max(0.01, chin.y - top.y)) - 0.55) * 120;
    roll = deg(Math.atan2(r.y - l.y, r.x - l.x));
  }
  const c = webcamConfig;
  const away = Math.abs(yaw) > c.headYawDeg || Math.abs(pitch) > c.headPitchDeg;
  const direction =
    Math.abs(yaw) > c.headYawDeg ? (yaw > 0 ? "turned left" : "turned right") : Math.abs(pitch) > c.headPitchDeg ? (pitch > 0 ? "tilted down" : "tilted up") : "facing camera";
  return { yaw, pitch, roll, away, direction };
}
