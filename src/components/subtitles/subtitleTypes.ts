/**
 * Общие типы, интерфейсы и константы окна поиска по субтитрам.
 *
 * Утилиты форматирования (конвертеры цветов, преобразователи разметки)
 * вынесены в subtitleFormatters.ts.
 */

/** Строка субтитров с временными метками и техническими метаданными. */
export interface SubtitleLine {
  index: number;
  start: number;
  end: number;
  text: string;
  raw?: string;
  style?: string;
  actor?: string;
  layer?: number;
  font_name?: string;
  font_size?: number;
  color?: string;
  position?: string;
  effect?: string;
}

export interface SubtitlesSearchModalProps {
  /** Обработчик закрытия окна поиска. */
  onClose: () => void;
}

export type SubtitleViewMode = "normal" | "technical";
export type SubtitleRawFormat = "html" | "aegisub";

// ─── Константы геометрии ────────────────────────────────────────────────────

export const DEFAULT_MODAL_WIDTH = 480;
export const TECH_MODAL_DEFAULT_WIDTH = 620;
export const TECH_MODAL_MIN_WIDTH = 540;
export const MIN_MODAL_WIDTH = 360;
export const DEFAULT_OFFSET_X = 14;

// ─── Ключи localStorage ──────────────────────────────────────────────────────

export const MODAL_WIDTH_KEY = "l-mpv-subtitles-width";
export const MODAL_OFFSET_X_KEY = "l-mpv-subtitles-offset-x";
export const SUBTITLE_VIEW_MODE_KEY = "l-mpv-subtitles-view-mode";
export const SUBTITLE_RAW_FORMAT_KEY = "l-mpv-subtitles-raw-format";
export const SUBTITLE_OPAQUE_KEY = "l-mpv-subtitles-opaque";

// ─── Константы виртуализации ─────────────────────────────────────────────────

/** Размер активного окна рендеринга виртуализатора. */
export const VIRTUAL_WINDOW_SIZE = 120;
/** Примерная высота строки для фантомного спейсера скроллбара. */
export const ESTIMATED_ROW_HEIGHT_NORMAL = 64;
export const ESTIMATED_ROW_HEIGHT_TECH = 118;

// ─── Читатели localStorage ───────────────────────────────────────────────────

/** Получение сохранённого режима отображения (обычный / технический). */
export const getInitialViewMode = (): SubtitleViewMode => {
  try {
    const saved = localStorage.getItem(SUBTITLE_VIEW_MODE_KEY);
    if (saved === "technical" || saved === "normal") return saved;
  } catch (e) {
    console.error("Ошибка чтения режима отображения субтитров:", e);
  }
  return "normal";
};

/** Получение сохранённой ширины окна из localStorage. */
export const getInitialWidth = (): number => {
  try {
    const saved = localStorage.getItem(MODAL_WIDTH_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= MIN_MODAL_WIDTH) return parsed;
    }
  } catch (e) {
    console.error("Ошибка чтения ширины окна субтитров:", e);
  }
  return DEFAULT_MODAL_WIDTH;
};

/** Получение сохранённого горизонтального смещения окна из localStorage. */
export const getInitialOffsetX = (): number => {
  try {
    const saved = localStorage.getItem(MODAL_OFFSET_X_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
  } catch (e) {
    console.error("Ошибка чтения смещения окна субтитров:", e);
  }
  return DEFAULT_OFFSET_X;
};

/** Получение сохранённого формата отображения разметки ("html" | "aegisub"). */
export const getInitialRawFormat = (): SubtitleRawFormat => {
  try {
    const saved = localStorage.getItem(SUBTITLE_RAW_FORMAT_KEY);
    if (saved === "html" || saved === "aegisub") return saved;
  } catch (e) {
    console.error("Ошибка чтения формата разметки субтитров:", e);
  }
  return "html";
};

/** Получение сохранённого режима непрозрачности окна субтитров. */
export const getInitialSubtitlesOpaque = (): boolean => {
  try {
    const saved = localStorage.getItem(SUBTITLE_OPAQUE_KEY);
    if (saved !== null) return saved === "true";
  } catch (e) {
    console.error("Ошибка чтения режима непрозрачности субтитров:", e);
  }
  return false;
};

// ─── Реэкспорт форматтеров для обратной совместимости ────────────────────────
// Код, ссылающийся на старые импорты из subtitleTypes, продолжит работать.
export {
  hexToAssColor,
  assColorToHex,
  toAegisubMarkup,
  toHtmlMarkup,
} from "./subtitleFormatters";
