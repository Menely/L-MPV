import type { HeatmapPalette } from "./heatmapTypes";
import { resolveHeatmapColor, setAlpha } from "./waveformPalette";

export function getWaveformBaseline(height: number): number {
  return height - 3;
}

export function traceSplinePath(ctx: CanvasRenderingContext2D, points: ReadonlyArray<{ x: number; y: number }>): void {
  ctx.beginPath();
  points.forEach((point, i) => {
    if (!i) ctx.moveTo(point.x, point.y);
    else {
      const previous = points[i - 1];
      const mid = (previous.x + point.x) / 2;
      ctx.bezierCurveTo(mid, previous.y, mid, point.y, point.x, point.y);
    }
  });
}

/** Filled relief: a restrained surface below the same time-aligned contour. */
export function renderArea(
  ctx: CanvasRenderingContext2D, width: number, height: number, samples: number[],
  progress: number, palette: HeatmapPalette, accentRgb: string, isVideo: boolean,
): void {
  const base = getWaveformBaseline(height);
  const points = samples.map((sample, i) => ({
    x: samples.length > 1 ? i * width / (samples.length - 1) : 0,
    y: base - Math.max(isVideo ? 0 : 1, sample / 255 * (base - 2)),
  }));
  if (points.length === 1) points.push({ x: width, y: points[0].y });
  for (const played of [true, false]) {
    ctx.save();
    ctx.beginPath();
    const split = progress * width;
    ctx.rect(played ? 0 : split, 0, played ? split : width - split, height);
    ctx.clip();
    const color = resolveHeatmapColor(0.8, palette, accentRgb, played);
    const fill = ctx.createLinearGradient(0, 0, 0, base);
    fill.addColorStop(0, setAlpha(color, played ? 0.65 : 0.35));
    fill.addColorStop(1, setAlpha(color, played ? 0.12 : 0.05));
    traceSplinePath(ctx, points);
    ctx.lineTo(width, base);
    ctx.lineTo(0, base);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    traceSplinePath(ctx, points);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }
}

/** A sharp sample-and-hold contour, without spline interpolation or fill. */
export function renderSteps(
  ctx: CanvasRenderingContext2D, width: number, height: number, samples: number[],
  progress: number, palette: HeatmapPalette, accentRgb: string, isVideo: boolean,
): void {
  const base = getWaveformBaseline(height);
  const pitch = width / samples.length;
  for (const played of [true, false]) {
    ctx.save();
    ctx.beginPath();
    const split = progress * width;
    ctx.rect(played ? 0 : split, 0, played ? split : width - split, height);
    ctx.clip();
    ctx.beginPath();
    samples.forEach((sample, i) => {
      const y = base - Math.max(isVideo ? 0 : 1, sample / 255 * (base - 2));
      if (!i) ctx.moveTo(0, y);
      else ctx.lineTo(i * pitch, y);
      ctx.lineTo((i + 1) * pitch, y);
    });
    ctx.lineWidth = 1.25;
    ctx.lineJoin = "miter";
    ctx.strokeStyle = resolveHeatmapColor(0.8, palette, accentRgb, played);
    ctx.stroke();
    ctx.restore();
  }
}

/** Discrete points show the relief without a connecting line or bars. */
export function renderDots(
  ctx: CanvasRenderingContext2D, width: number, height: number, samples: number[],
  progress: number, palette: HeatmapPalette, accentRgb: string, isVideo: boolean,
): void {
  const base = getWaveformBaseline(height);
  const pitch = width / samples.length;
  const radius = Math.min(1.4, pitch * 0.3);
  samples.forEach((sample, i) => {
    const value = Math.max(0, Math.min(1, sample / 255));
    if (isVideo && value === 0) return;
    const y = base - Math.max(isVideo ? 0 : 1, value * (base - 2));
    ctx.fillStyle = resolveHeatmapColor(value, palette, accentRgb, i / samples.length <= progress);
    ctx.beginPath();
    ctx.arc((i + 0.5) * pitch, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}
