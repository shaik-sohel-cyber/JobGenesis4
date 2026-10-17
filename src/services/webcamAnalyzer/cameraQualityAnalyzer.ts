import { webcamConfig } from "./config";

/** Samples mean brightness from a tiny downscaled frame. Cheap enough to run every few samples. */
export class CameraQualityAnalyzer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  luma(video: HTMLVideoElement): number | null {
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = 32;
      this.canvas.height = 24;
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!this.ctx || !video.videoWidth) return null;
    this.ctx.drawImage(video, 0, 0, 32, 24);
    const d = this.ctx.getImageData(0, 0, 32, 24).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    return sum / (d.length / 4);
  }

  isLowLight(luma: number | null) {
    return luma !== null && luma < webcamConfig.lowLightLuma;
  }

  framing(box: { minX: number; minY: number; maxX: number; maxY: number; area: number }): string | null {
    const c = webcamConfig;
    if (box.area < c.minFaceArea) return "too far";
    if (box.area > c.maxFaceArea) return "too close";
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    if (cx < 0.2 || cx > 0.8 || cy < 0.15 || cy > 0.85) return "off-centre";
    return null;
  }
}
