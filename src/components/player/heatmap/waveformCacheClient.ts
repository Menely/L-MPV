/**
 * Клиентский модуль кэширования, дедупликации запросов и предзагрузки профилей тепловой карты (Activity Heatmap).
 *
 * Отвечает исключительно за инфраструктурный слой данных:
 * - Сессионный LRU-кэш ответов в оперативной памяти (WaveformMemoryCache);
 * - Дедупликацию параллельных in-flight запросов к Tauri-команде `get_media_heatmap_data`;
 * - Защиту эпохи кэша (`cacheEpoch`) от гонок записи при очистке дискового кэша.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  HeatmapDataSource,
  HeatmapDataResponse,
  getHeatmapConfig,
  saveHeatmapConfig,
} from "./heatmapTypes";
import { WaveformMemoryCache } from "./waveformPalette";

export const WAVEFORM_STORAGE_KEY = "l-mpv-waveform-enabled";

/**
 * Глобальный LRU-кэш сессии для хранения полных структур ответов тепловых карт.
 */
const waveformMemoryCache = new WaveformMemoryCache<HeatmapDataResponse>(128);

/**
 * Реестр активных in-flight промисов для объединения одинаковых запросов к бэкенду.
 */
const inFlightRequests = new Map<string, Promise<HeatmapDataResponse | null>>();

/**
 * Счётчик эпохи оперативного кэша для предотвращения записи результатов устаревших запросов после очистки.
 */
let cacheEpoch = 0;

/**
 * Проверка включения тепловой карты в локальном хранилище настроек.
 */
export function isWaveformEnabled(): boolean {
  return getHeatmapConfig().enabled;
}

/**
 * Сохранение состояния активности тепловой карты.
 */
export function setWaveformEnabled(enabled: boolean): void {
  saveHeatmapConfig({ enabled });
}

/**
 * Фоновая предзагрузка профиля (Preload) с дедупликацией и проверкой активности функции.
 */
export async function preloadWaveform(
  path: string,
  dataSource?: HeatmapDataSource,
  trackIdx?: number,
  durationHint?: number,
  externalTrackPath?: string
): Promise<HeatmapDataResponse | null> {
  if (!path) return null;
  if (typeof durationHint === "number" && durationHint <= 0) {
    return null;
  }

  // Если тепловая карта отключена в настройках, не запускаем фоновый процесс FFmpeg
  if (!isWaveformEnabled()) {
    return null;
  }

  const effectiveSource = dataSource || getHeatmapConfig().dataSource;
  const isAudio = effectiveSource === "audio";
  const effectiveTrackIdx = isAudio ? (trackIdx ?? 0) : undefined;
  const effectiveExtPath = isAudio ? externalTrackPath : undefined;

  const trackSuffix = effectiveTrackIdx !== undefined ? `::track_${effectiveTrackIdx}` : "";
  const extSuffix = effectiveExtPath ? `::ext_${effectiveExtPath}` : "";
  const durSuffix =
    durationHint && durationHint > 0 ? `::dur_${Math.round(durationHint * 10)}` : "";
  const cacheKey = `${path}::${effectiveSource}${trackSuffix}${extSuffix}${durSuffix}`;

  const cached = waveformMemoryCache.get(cacheKey);
  if (cached) return cached;

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const requestEpoch = cacheEpoch;
  const taskPromise = (async () => {
    try {
      const data = await invoke<HeatmapDataResponse>("get_media_heatmap_data", {
        path,
        mode: effectiveSource,
        trackIdx: effectiveTrackIdx ?? null,
        externalTrackPath: effectiveExtPath ?? null,
        durationHint: durationHint ?? null,
      });
      if (data && Array.isArray(data.visual_bins) && data.visual_bins.length > 0) {
        if (requestEpoch === cacheEpoch) {
          waveformMemoryCache.set(cacheKey, data);
        }
        return data;
      }
    } catch (e: any) {
      if (e === "NoVideoStream" || e?.message === "NoVideoStream") {
        throw new Error("NoVideoStream");
      }
      if (e === "TaskCancelled" || e?.message === "TaskCancelled") {
        throw new Error("TaskCancelled");
      }
      console.warn(`[L-MPV] Ошибка извлечения метрики '${effectiveSource}' для '${path}':`, e);
    } finally {
      inFlightRequests.delete(cacheKey);
    }
    return null;
  })();

  inFlightRequests.set(cacheKey, taskPromise);
  return taskPromise;
}

/**
 * Полная очистка оперативного и дискового кэша профилей активности.
 */
export async function clearAllWaveformCaches(): Promise<number> {
  cacheEpoch += 1;
  waveformMemoryCache.clear();
  inFlightRequests.clear();
  try {
    const deletedCount = await invoke<number>("clear_waveform_cache");
    window.dispatchEvent(new CustomEvent("l-mpv-waveform-cache-cleared"));
    return deletedCount;
  } catch (e) {
    console.error("[L-MPV] Ошибка при очистке дискового кэша звуковых карт:", e);
    return 0;
  }
}

