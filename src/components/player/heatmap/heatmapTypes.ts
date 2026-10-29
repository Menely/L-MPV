/**
 * Модуль типов и конфигурации продвинутой тепловой карты таймлайна (Waveform / Activity Strip).
 *
 * Предоставляет гибкое управление визуальным стилем отображения (столбики, сплайн, блоки),
 * источниками данных (громкость звука, битрейт видеопотока),
 * цветовыми палитрами и геометрическим позиционированием в интерфейсе L-MPV.
 */

export type HeatmapStyle = "bars" | "spline" | "blocks";

export type HeatmapDataSource = "audio" | "video_bitrate";

export type HeatmapPalette = "theme" | "thermal" | "cyberpunk" | "monochrome";

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
  /** Непрозрачность полосы (0.4..1.0) */
  opacity: number;
  /** Отображение светящейся линии гребня волны */
  showCrestLine: boolean;
}

export const HEATMAP_STORAGE_KEY = "l-mpv-heatmap-config";
export const HEATMAP_CONFIG_CHANGED_EVENT = "l-mpv-heatmap-config-changed";

export const DEFAULT_HEATMAP_CONFIG: HeatmapConfig = {
  enabled: true,
  style: "bars",
  dataSource: "audio",
  palette: "theme",
  placement: "above_controls",
  height: 34,
  opacity: 0.9,
  showCrestLine: true,
};

/**
 * Получение текущей конфигурации тепловой карты из localStorage с валидацией и миграцией.
 */
export function getHeatmapConfig(): HeatmapConfig {
  try {
    const raw = localStorage.getItem(HEATMAP_STORAGE_KEY);
    if (!raw) {
      // Поддержка миграции со старого простого ключа l-mpv-waveform-enabled
      const legacyEnabled = localStorage.getItem("l-mpv-waveform-enabled");
      if (legacyEnabled !== null) {
        return {
          ...DEFAULT_HEATMAP_CONFIG,
          enabled: legacyEnabled === "true",
        };
      }
      return { ...DEFAULT_HEATMAP_CONFIG };
    }
    const parsed = JSON.parse(raw);

    // Миграция устаревшего режима inside_timeline в above_timeline
    let placement: HeatmapPlacement = DEFAULT_HEATMAP_CONFIG.placement;
    if (parsed.placement === "inside_timeline" || parsed.placement === "above_timeline") {
      placement = "above_timeline";
    } else if (parsed.placement === "above_controls") {
      placement = "above_controls";
    }

    // Валидация стиля (зеркальный переводится в столбики)
    let style: HeatmapStyle = DEFAULT_HEATMAP_CONFIG.style;
    if (["bars", "spline", "blocks"].includes(parsed.style)) {
      style = parsed.style as HeatmapStyle;
    }

    // Валидация источника данных (оставлены только audio и video_bitrate)
    let dataSource: HeatmapDataSource = DEFAULT_HEATMAP_CONFIG.dataSource;
    if (["audio", "video_bitrate"].includes(parsed.dataSource)) {
      dataSource = parsed.dataSource as HeatmapDataSource;
    }

    // Однократная миграция старой высоты по умолчанию (24px -> 34px)
    const rawHeight =
      typeof parsed.height === "number" && parsed.height >= 16 && parsed.height <= 48
        ? parsed.height
        : DEFAULT_HEATMAP_CONFIG.height;
    const height =
      parsed._schemaVersion !== 2 && rawHeight === 24
        ? DEFAULT_HEATMAP_CONFIG.height
        : rawHeight;

    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_HEATMAP_CONFIG.enabled,
      style,
      dataSource,
      palette: ["theme", "thermal", "cyberpunk", "monochrome"].includes(parsed.palette)
        ? (parsed.palette as HeatmapPalette)
        : DEFAULT_HEATMAP_CONFIG.palette,
      placement,
      height,
      opacity:
        typeof parsed.opacity === "number" && parsed.opacity >= 0.2 && parsed.opacity <= 1
          ? parsed.opacity
          : DEFAULT_HEATMAP_CONFIG.opacity,
      showCrestLine:
        typeof parsed.showCrestLine === "boolean"
          ? parsed.showCrestLine
          : DEFAULT_HEATMAP_CONFIG.showCrestLine,
    };
  } catch (e) {
    console.error("Ошибка считывания конфигурации тепловой карты:", e);
    return { ...DEFAULT_HEATMAP_CONFIG };
  }
}

/**
 * Сохранение обновленной конфигурации тепловой карты с рассылкой событий.
 */
export function saveHeatmapConfig(patch: Partial<HeatmapConfig>): HeatmapConfig {
  try {
    const current = getHeatmapConfig();
    const updated: HeatmapConfig = { ...current, ...patch };
    localStorage.setItem(
      HEATMAP_STORAGE_KEY,
      JSON.stringify({ ...updated, _schemaVersion: 2 })
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

