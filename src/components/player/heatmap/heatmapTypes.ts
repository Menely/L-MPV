/**
 * Модуль типов и конфигурации продвинутой тепловой карты таймлайна (Waveform / Activity Strip).
 *
 * Предоставляет управление шестью визуальными стилями,
 * источниками данных (громкость звука, битрейт видеопотока),
 * цветовыми палитрами и геометрическим позиционированием в интерфейсе L-MPV.
 */

export type HeatmapStyle = "bars" | "spline" | "blocks" | "area" | "steps" | "dots";

export type HeatmapDataSource = "audio" | "video_bitrate";

export type HeatmapPalette =
  | "theme"
  | "thermal"
  | "cyberpunk"
  | "monochrome"
  | "sunset"
  | "aurora"
  | "ocean"
  | "plasma";

export type HeatmapPlacement = "above_controls" | "above_timeline";

/**
 * Детализированные физические метрики интервалов тепловой карты.
 */
export type HeatmapMetricsData =
  | {
      type: "audio";
      payload: {
        /** Массив среднеквадратичных значений громкости (RMS dBFS) по интервалам */
        rms_db: number[];
        /** Массив пиковых значений громкости (Peak dBFS) по интервалам */
        peak_db: number[];
      };
    }
  | {
      type: "video_bitrate";
      payload: {
        /** Массив физического битрейта кадров в кбит/с по интервалам */
        bitrate_kbps: number[];
        /** Количество пакетов/кадров в каждом интервале */
        packet_counts: number[];
      };
    };

/**
 * Полный дуальный контракт данных тепловой карты от бэкенда.
 */
export interface HeatmapDataResponse {
  media_path: string;
  stream_mode: string;
  track_idx: number | null;
  external_track_path: string | null;
  duration_sec: number;
  step_duration_sec: number;
  start_time_offset: number;
  /** Нормализованные байты 0..255 для быстрой отрисовки Canvas */
  visual_bins: number[];
  /** Физические измерения для аналитических подсказок */
  metrics: HeatmapMetricsData;
  /** Идентификатор поколения сессионного запроса для защиты от гонок */
  generation_id: number;
}

export interface HeatmapConfig {
  /** Включение / отключение отображения тепловой карты */
  enabled: boolean;
  /** Внешний вид рендеринга данных */
  style: HeatmapStyle;
  /** Источник отображаемых метрик */
  dataSource: HeatmapDataSource;
  /** Цветовая схема градиента */
  palette: HeatmapPalette;
  /** Расположение в плеере: парящая над панелью или над таймлайном внутри панели */
  placement: HeatmapPlacement;
  /** Высота полосы в пикселях (16..36) */
  height: number;
  /** Непрозрачность полосы (0.2..1.0) */
  opacity: number;
}

export const HEATMAP_STORAGE_KEY = "l-mpv-heatmap-config";
export const HEATMAP_CONFIG_CHANGED_EVENT = "l-mpv-heatmap-config-changed";

export const DEFAULT_HEATMAP_CONFIG: HeatmapConfig = {
  enabled: false,
  style: "bars",
  dataSource: "audio",
  palette: "theme",
  placement: "above_controls",
  height: 34,
  opacity: 0.9,
};

/**
 * Получение текущей конфигурации тепловой карты из localStorage с валидацией и миграцией.
 */
export const MIN_HEATMAP_HEIGHT = 16;
export const MAX_HEATMAP_HEIGHT = 36;

function pick<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}

/** Canonical settings strip retired fields from old presets and disk snapshots. */
export function normalizeHeatmapConfig(value: unknown): HeatmapConfig {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const oldHeight = typeof data.height === "number" && Number.isFinite(data.height) ? data.height : DEFAULT_HEATMAP_CONFIG.height;
  const height = data._schemaVersion !== 2 && data._schemaVersion !== 3 && oldHeight === 24
    ? DEFAULT_HEATMAP_CONFIG.height : oldHeight;
  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : DEFAULT_HEATMAP_CONFIG.enabled,
    style: data.style === "mirrored" ? "steps"
      : pick(data.style, ["bars", "spline", "blocks", "area", "steps", "dots"], DEFAULT_HEATMAP_CONFIG.style),
    dataSource: pick(data.dataSource, ["audio", "video_bitrate"], DEFAULT_HEATMAP_CONFIG.dataSource),
    palette: pick(data.palette, ["theme", "thermal", "cyberpunk", "monochrome", "sunset", "aurora", "ocean", "plasma"], DEFAULT_HEATMAP_CONFIG.palette),
    placement: data.placement === "inside_timeline" ? "above_timeline"
      : pick(data.placement, ["above_controls", "above_timeline"], DEFAULT_HEATMAP_CONFIG.placement),
    height: Math.min(MAX_HEATMAP_HEIGHT, Math.max(MIN_HEATMAP_HEIGHT, height)),
    opacity: typeof data.opacity === "number" && Number.isFinite(data.opacity)
      ? Math.min(1, Math.max(0.2, data.opacity)) : DEFAULT_HEATMAP_CONFIG.opacity,
  };
}

export function getHeatmapConfig(): HeatmapConfig {
  try {
    const raw = localStorage.getItem(HEATMAP_STORAGE_KEY);
    if (raw) return normalizeHeatmapConfig(JSON.parse(raw));
    const legacy = localStorage.getItem("l-mpv-waveform-enabled");
    return { ...DEFAULT_HEATMAP_CONFIG, enabled: legacy === null ? false : legacy === "true" };
  } catch {
    return { ...DEFAULT_HEATMAP_CONFIG };
  }
}

/**
 * Сохранение обновленной конфигурации тепловой карты с рассылкой событий.
 */
export function saveHeatmapConfig(patch: Partial<HeatmapConfig>): HeatmapConfig {
  try {
    const current = getHeatmapConfig();
    const updated = normalizeHeatmapConfig({ ...current, ...patch, _schemaVersion: 3 });
    localStorage.setItem(
      HEATMAP_STORAGE_KEY,
      JSON.stringify({ ...updated, _schemaVersion: 3 })
    );
    // Обратная совместимость со старым флагом
    localStorage.setItem("l-mpv-waveform-enabled", String(updated.enabled));

    // Уведомление компонентов плеера (единое специализированное событие без дубляжа)
    window.dispatchEvent(new CustomEvent(HEATMAP_CONFIG_CHANGED_EVENT, { detail: updated }));

    return updated;
  } catch (e) {
    console.error("Ошибка сохранения конфигурации тепловой карты:", e);
    return getHeatmapConfig();
  }
}

