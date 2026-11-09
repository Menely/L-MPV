/** Canvas rendering shared by all six heatmap styles. */
import { getWaveformBaseline, traceSplinePath, renderArea, renderSteps, renderDots } from "./waveformShapes";
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
  isVideo = false
): void {
  const totalBars = samples.length;
  const barWidth = width / totalBars;
  const baseY = getWaveformBaseline(height);
  const maxTopH = Math.max(10, baseY - 3);

  // Линия горизонта
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(0, baseY, width, 1);

  for (let i = 0; i < totalBars; i++) {
    const norm = Math.max(isVideo ? 0 : 0.08, samples[i] / 255);
    const topH = Math.max(isVideo ? 0 : 3.5, norm * maxTopH);

    const x = i * barWidth;
    const isPlayed = i / totalBars <= currentProgressRatio;
    const barColor = resolveHeatmapColor(norm, palette, accentRgb, isPlayed);

    const drawW = Math.max(1, barWidth > 2.5 ? barWidth - 0.7 : barWidth - 0.35);
    const drawX = x + (barWidth - drawW) / 2;
    const corner = Math.min(1.0, drawW / 2);

    // Верхний столбец (гарантированная минимальная видимая высота)
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(drawX, baseY - topH, drawW, topH, [corner, corner, 0, 0]);
    ctx.fill();
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
  accentColor: string,
  isVideo = false
): void {
  const total = samples.length;
  if (total === 0) return;
  const stepX = total > 1 ? width / (total - 1) : width;
  const baseY = getWaveformBaseline(height);
  const maxTopH = Math.max(10, baseY - 3);
  const playheadX = currentProgressRatio * width;

  // Опорные точки гребня с гарантированной четкой высотой рельефа
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < total; i++) {
    const norm = Math.max(isVideo ? 0 : 0.06, samples[i] / 255);
    const topH = Math.max(isVideo ? 0 : 3.5, norm * maxTopH);
    points.push({ x: i * stepX, y: baseY - topH });
  }
  if (points.length === 1) points.push({ x: width, y: points[0].y });

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
  ctx.shadowBlur = 2;
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
  ctx.shadowBlur = 0;
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
  accentRgb: string,
  isVideo = false
): void {
  const total = samples.length;
  const colWidth = width / total;
  const blockH = 3;
  const blockGap = 1.2;
  const stepH = blockH + blockGap;
  const maxBlocks = Math.max(3, Math.floor((height - 4) / stepH));

  for (let i = 0; i < total; i++) {
    const norm = Math.max(isVideo ? 0 : 0.04, samples[i] / 255);
    const activeBlocks = Math.max(isVideo ? 0 : 1, Math.round(norm * maxBlocks));
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
    case "area":
      renderArea(ctx, width, height, samples, currentProgressRatio, config.palette, colors.accentRgb, config.dataSource === "video_bitrate");
      break;
    case "steps":
      renderSteps(ctx, width, height, samples, currentProgressRatio, config.palette, colors.accentRgb, config.dataSource === "video_bitrate");
      break;
    case "dots":
      renderDots(ctx, width, height, samples, currentProgressRatio, config.palette, colors.accentRgb, config.dataSource === "video_bitrate");
      break;
    case "spline":
      renderSpline(
        ctx,
        width,
        height,
        samples,
        currentProgressRatio,
        config.palette,
        colors.accentRgb,
        colors.accentColor,
        config.dataSource === "video_bitrate"
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
        colors.accentRgb,
        config.dataSource === "video_bitrate"
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
        config.dataSource === "video_bitrate"
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
  const baseY = getWaveformBaseline(height);
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

