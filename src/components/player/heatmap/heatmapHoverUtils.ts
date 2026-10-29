/**
 * Модуль вычисления контекстной аналитики точки наведения на тепловую карту (Activity Heatmap Hover Info).
 *
 * Архитектурные принципы:
 * - Single Responsibility: изолированный расчет физических величин без побочных эффектов.
 * - Чистые функции без мутаций входных массивов.
 * - Учет нелинейной гамма-характеристики бэкенда для точной аппроксимации локального битрейта.
 * - Логарифмический расчет акустического уровня в dBFS для амплитудного рельефа звука.
 */

import { HeatmapDataSource, HeatmapDataResponse } from "./heatmapTypes";
import { MediaInfo } from "../../../contexts/PlayerStateContext";

export interface HeatmapHoverMetrics {
  /** Форматированное значение времени (например, "14:02") */
  timeFormatted: string;
  /** Числовое значение времени в секундах */
  timeSeconds: number;
  /** Основной текстовый лейбл метрики */
  metricValue: string;
  /** Тип метрики для выбора иконки */
  metricType: HeatmapDataSource;
  /** Процентное соотношение от максимума (0..100) */
  intensityPercent: number;
}

export interface ResolveHoverInfoParams {
  hoverRatio: number;
  duration: number;
  response?: HeatmapDataResponse | null;
  samples?: number[] | null;
  dataSource: HeatmapDataSource;
  mediaInfo: MediaInfo | null;
  isRussianLocale?: boolean;
}

/**
 * Расчет физических параметров в точке наведения курсора на тепловую карту.
 */
export function resolveHeatmapHoverMetrics({
  hoverRatio,
  duration,
  response,
  samples,
  dataSource,
  mediaInfo,
  isRussianLocale = true,
}: ResolveHoverInfoParams): HeatmapHoverMetrics | null {
  if (
    hoverRatio === null ||
    hoverRatio === undefined ||
    Number.isNaN(hoverRatio) ||
    hoverRatio < 0 ||
    hoverRatio > 1
  ) {
    return null;
  }

  const safeDuration =
    Number.isFinite(duration) && duration > 0
      ? duration
      : Number.isFinite(mediaInfo?.duration) && (mediaInfo?.duration || 0) > 0
      ? mediaInfo!.duration
      : response?.duration_sec && response.duration_sec > 0
      ? response.duration_sec
      : 0;

  // Используем единую шкалу времени [0 .. safeDuration], идентичную Timeline.tsx и seekTo
  const timeSeconds = hoverRatio * safeDuration;
  const timeFormatted = safeDuration > 0 ? formatHoverTime(timeSeconds) : `${Math.round(hoverRatio * 100)}%`;

  const effectiveSamples = response?.visual_bins || samples;
  if (!effectiveSamples || effectiveSamples.length === 0) {
    return {
      timeFormatted,
      timeSeconds,
      metricValue: "",
      metricType: dataSource,
      intensityPercent: 0,
    };
  }

  const sampleIndex = Math.min(
    effectiveSamples.length - 1,
    Math.max(0, Math.floor(hoverRatio * effectiveSamples.length))
  );
  const rawValue = effectiveSamples[sampleIndex] ?? 0;
  const intensityPercent = Math.round((rawValue / 255) * 100);

  if (response?.metrics) {
    if (response.metrics.type === "video_bitrate") {
      const kbps = response.metrics.payload.bitrate_kbps[sampleIndex] ?? 0;
      const formattedSpeed =
        kbps >= 1000.0
          ? `~${(kbps / 1000.0).toFixed(1)} ${isRussianLocale ? "Мбит/с" : "Mbps"}`
          : `~${Math.round(kbps)} ${isRussianLocale ? "кбит/с" : "kbps"}`;

      return {
        timeFormatted,
        timeSeconds,
        metricValue: formattedSpeed,
        metricType: "video_bitrate",
        intensityPercent,
      };
    }

    if (response.metrics.type === "audio") {
      const r = response.metrics.payload.rms_db[sampleIndex] ?? -60.0;
      const p = response.metrics.payload.peak_db[sampleIndex] ?? -60.0;
      const metricValue =
        r <= -55.0 && p <= -55.0
          ? isRussianLocale
            ? "Тишина"
            : "Silence"
          : `${r.toFixed(1)} dBFS (${isRussianLocale ? "Пик" : "Peak"}: ${p.toFixed(1)} dBFS)`;

      return {
        timeFormatted,
        timeSeconds,
        metricValue,
        metricType: "audio",
        intensityPercent,
      };
    }
  }

  return {
    timeFormatted,
    timeSeconds,
    metricValue: `${intensityPercent}%`,
    metricType: dataSource,
    intensityPercent,
  };
}

/**
 * Форматирование секунд в формат ММ:СС или ЧЧ:ММ:СС.
 */
function formatHoverTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}

