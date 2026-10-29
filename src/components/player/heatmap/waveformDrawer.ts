/**
 * Модуль высокопроизводительного рендеринга кинематографичной тепловой карты (Waveform Activity Strip).
 *
 * Архитектурно изолирует отрисовку Canvas от React-жизненного цикла,
 * исключает Layout Thrashing и предоставляет 3 визуальных стиля:
 * 1. Столбики (Bars) — классический детальный эквалайзер с неоновым гребнем.
 * 2. Плавный сплайн-рельеф (Fluid Spline Wave) — непрерывная кривая Безье.
 * 3. Ступенчатые блоки (Digital / Matrix Blocks) — ретро Hi-Fi сегментированный рендеринг.
 */

import type { HeatmapConfig, HeatmapPalette } from "./heatmapTypes";
import { DEFAULT_HEATMAP_CONFIG } from "./heatmapTypes";
import {
  WaveformThemeColors,
  WaveformMetrics,
  WaveformMemoryCache,
  getWaveformThemeColors,
  updateCanvasMetrics,
  setAlpha,
  resolveHeatmapColor,
} from "./waveformPalette";

export {
  WaveformMemoryCache,
  getWaveformThemeColors,
  updateCanvasMetrics,
  setAlpha,
  resolveHeatmapColor,
};
export type { WaveformThemeColors, WaveformMetrics };

/**
 * Отрисовка стиля: Столбики (Bars).
 */
function renderBars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  samples: number[],
  currentProgressRatio: number,
  palette: HeatmapPalette,
  accentRgb: string,
  showCrestLine: boolean,
  accentColor: string
): void {
  const totalBars = samples.length;
  const barWidth = width / totalBars;
  const baseY = Math.round(height * 0.76);
  const maxTopH = Math.max(10, baseY - 3);
  const maxBotH = Math.max(3, height - baseY - 2);

  // Линия горизонта
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(0, baseY, width, 1);

  const crestPoints: Array<{ x: number; y: number; isPlayed: boolean }> = [];

  for (let i = 0; i < totalBars; i++) {
    const norm = Math.max(0.08, samples[i] / 255);
    const topH = Math.max(3.5, norm * maxTopH);
    const botH = Math.max(1, topH * 0.35 * (maxBotH / maxTopH));

    const x = i * barWidth;
    const isPlayed = i / totalBars <= currentProgressRatio;
    const barColor = resolveHeatmapColor(norm, palette, accentRgb, isPlayed);

    crestPoints.push({ x: x + barWidth / 2, y: baseY - topH, isPlayed });

    const drawW = Math.max(1, barWidth > 2.5 ? barWidth - 0.7 : barWidth - 0.35);
    const drawX = x + (barWidth - drawW) / 2;
    const corner = Math.min(1.0, drawW / 2);

    // Верхний столбец (гарантированная минимальная видимая высота)
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(drawX, baseY - topH, drawW, topH, [corner, corner, 0, 0]);
    ctx.fill();

    // Нижнее затухающее водное отражение
    ctx.save();
    ctx.globalAlpha = isPlayed ? 0.3 : 0.12;
    ctx.beginPath();
    ctx.roundRect(drawX, baseY + 1, drawW, botH, [0, 0, corner, corner]);
    ctx.fill();
    ctx.restore();
  }

  // Непрерывный светящийся контур гребня
  if (showCrestLine && crestPoints.length > 1) {
    drawCrestLine(ctx, crestPoints, accentColor);
  }
}

/**
 * Построение сглаженного контура кривой Безье по массиву опорных точек.
 */
function traceSplinePath(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<{ x: number; y: number }>
): void {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      ctx.moveTo(points[i].x, points[i].y);
    } else {
      const midX = (points[i - 1].x + points[i].x) / 2;
      ctx.bezierCurveTo(midX, points[i - 1].y, midX, points[i].y, points[i].x, points[i].y);
    }
  }
}

/**
 * Отрисовка стиля: Плавный сплайн-рельеф (Fluid Spline Wave).
 * Оставляет только светящуюся линию с гладким затуханием мягкого света вниз к горизонту.
 */
function renderSpline(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  samples: number[],
  currentProgressRatio: number,
  palette: HeatmapPalette,
  accentRgb: string,
  showCrestLine: boolean,
  accentColor: string
): void {
  const total = samples.length;
  if (total === 0) return;
  const stepX = total > 1 ? width / (total - 1) : width;
  const baseY = Math.round(height * 0.78);
  const maxTopH = Math.max(10, baseY - 3);
  const playheadX = currentProgressRatio * width;

  // Опорные точки гребня с гарантированной четкой высотой рельефа
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < total; i++) {
    const norm = Math.max(0.06, samples[i] / 255);
    const topH = Math.max(3.5, norm * maxTopH);
    points.push({ x: i * stepX, y: baseY - topH });
  }

  // 1. Тонкая линия горизонта
  ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
  ctx.fillRect(0, baseY, width, 1);

  // 2. Светящаяся кривая Безье — чистый контур волны без градиента и заливок
  ctx.save();
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Сыгранная часть линии (яркая, с неоновым свечением)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, playheadX, height);
  ctx.clip();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = showCrestLine ? 8 : 4;
  ctx.strokeStyle = "#ffffff";
  traceSplinePath(ctx, points);
  ctx.stroke();
  ctx.restore();

  // Несыгранная часть линии (сохраняет спектральный цвет с деликатным свечением)
  ctx.save();
  ctx.beginPath();
  ctx.rect(playheadX, 0, width - playheadX, height);
  ctx.clip();
  const futureColor = resolveHeatmapColor(0.85, palette, accentRgb, false);
  ctx.strokeStyle = setAlpha(futureColor, 0.65);
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = showCrestLine ? 4 : 1;
  traceSplinePath(ctx, points);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/**
 * Отрисовка стиля: Ступенчатые блоки (Digital Blocks / Matrix).
 */
function renderBlocks(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  samples: number[],
  currentProgressRatio: number,
  palette: HeatmapPalette,
  accentRgb: string
): void {
  const total = samples.length;
  const colWidth = width / total;
  const blockH = 3;
  const blockGap = 1.2;
  const stepH = blockH + blockGap;
  const maxBlocks = Math.max(3, Math.floor((height - 4) / stepH));

  for (let i = 0; i < total; i++) {
    const norm = Math.max(0.04, samples[i] / 255);
    const activeBlocks = Math.max(1, Math.round(norm * maxBlocks));
    const isPlayed = i / total <= currentProgressRatio;
    const x = i * colWidth;
    const drawW = Math.max(1, colWidth > 2.5 ? colWidth - 0.7 : colWidth - 0.35);
    const drawX = x + (colWidth - drawW) / 2;

    for (let b = 0; b < activeBlocks; b++) {
      const blockNorm = (b + 1) / maxBlocks;
      const y = height - 2 - (b + 1) * stepH;
      const color = resolveHeatmapColor(blockNorm, palette, accentRgb, isPlayed);

      ctx.fillStyle = color;
      ctx.fillRect(drawX, y, drawW, blockH);
    }
  }
}

/**
 * Вспомогательная отрисовка сегмента линии гребня (сыгранного или несыгранного).
 */
function strokeCrestSegment(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<{ x: number; y: number; isPlayed: boolean }>,
  matchPlayed: boolean
): void {
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (pt.isPlayed === matchPlayed) {
      if (!started) {
        ctx.moveTo(pt.x, pt.y);
        started = true;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
  }
  if (started) {
    ctx.stroke();
  }
}

/**
 * Вспомогательная отрисовка светящейся линии гребня волны.
 */
function drawCrestLine(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number; isPlayed: boolean }>,
  accentColor: string
): void {
  // Сыгранная неоновая линия
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = "#ffffff";
  strokeCrestSegment(ctx, points, true);
  ctx.restore();

  // Несыгранная дымчатая линия
  ctx.save();
  ctx.lineWidth = 1.0;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  strokeCrestSegment(ctx, points, false);
  ctx.restore();
}

/**
 * Универсальный высокопроизводительный рендеринг тепловой карты на Canvas.
 */
export function renderWaveformToCanvas(
  ctx: CanvasRenderingContext2D,
  metrics: WaveformMetrics,
  samples: number[],
  position: number,
  duration: number,
  hoverRatio: number | null,
  colors: WaveformThemeColors,
  config: HeatmapConfig = DEFAULT_HEATMAP_CONFIG
): void {
  const { width, height, dpr } = metrics;
  if (width <= 0 || height <= 0 || samples.length === 0) return;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1;
  const currentProgressRatio = Math.min(1, Math.max(0, position / safeDuration));

  // Отрисовка в соответствии с выбранным стилем
  switch (config.style) {
    case "spline":
      renderSpline(
        ctx,
        width,
        height,
        samples,
        currentProgressRatio,
        config.palette,
        colors.accentRgb,
        config.showCrestLine,
        colors.accentColor
      );
      break;

    case "blocks":
      renderBlocks(
        ctx,
        width,
        height,
        samples,
        currentProgressRatio,
        config.palette,
        colors.accentRgb
      );
      break;

    case "bars":
    default:
      renderBars(
        ctx,
        width,
        height,
        samples,
        currentProgressRatio,
        config.palette,
        colors.accentRgb,
        config.showCrestLine,
        colors.accentColor
      );
      break;
  }

  // Световая игла воспроизведения (Playhead Ray)
  const playheadX = currentProgressRatio * width;
  ctx.save();
  ctx.globalAlpha = 1.0;
  ctx.shadowColor = colors.accentColor;
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(Math.max(0, playheadX - 0.75), 1, 1.5, height - 2);

  // Жемчужная светящаяся точка на горизонте
  const baseY = Math.round(height * 0.78);
  ctx.beginPath();
  ctx.arc(playheadX, baseY, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // Отрисовка светового курсора наведения (Hover Spotlight)
  if (hoverRatio !== null && hoverRatio >= 0 && hoverRatio <= 1) {
    const hoverX = hoverRatio * width;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fillRect(hoverX - 0.5, 1, 1, height - 2);
    ctx.restore();
  }

  ctx.restore();
}

