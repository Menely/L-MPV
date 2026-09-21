/**
 * Общие типы и константы окна поиска по субтитрам.
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

export const DEFAULT_MODAL_WIDTH = 480;
export const TECH_MODAL_DEFAULT_WIDTH = 620;
export const TECH_MODAL_MIN_WIDTH = 540;
export const MIN_MODAL_WIDTH = 360;
export const DEFAULT_OFFSET_X = 14;
export const MODAL_WIDTH_KEY = "l-mpv-subtitles-width";
export const MODAL_OFFSET_X_KEY = "l-mpv-subtitles-offset-x";
export const SUBTITLE_VIEW_MODE_KEY = "l-mpv-subtitles-view-mode";

/** Размер активного окна рендеринга виртуализатора. */
export const VIRTUAL_WINDOW_SIZE = 120;
/** Примерная высота строки для фантомного спейсера скроллбара. */
export const ESTIMATED_ROW_HEIGHT_NORMAL = 64;
export const ESTIMATED_ROW_HEIGHT_TECH = 118;

/** Получение сохранённого режима отображения (обычный / технический). */
export const getInitialViewMode = (): SubtitleViewMode => {
  try {
    const saved = localStorage.getItem(SUBTITLE_VIEW_MODE_KEY);
    if (saved === "technical" || saved === "normal") {
      return saved;
    }
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
      if (!isNaN(parsed) && parsed >= MIN_MODAL_WIDTH) {
        return parsed;
      }
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
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Ошибка чтения смещения окна субтитров:", e);
  }
  return DEFAULT_OFFSET_X;
};

export type SubtitleRawFormat = "html" | "aegisub";
export const SUBTITLE_RAW_FORMAT_KEY = "l-mpv-subtitles-raw-format";
export const SUBTITLE_OPAQUE_KEY = "l-mpv-subtitles-opaque";

/** Получение сохранённого формата отображения разметки ("html" | "aegisub"). */
export const getInitialRawFormat = (): SubtitleRawFormat => {
  try {
    const saved = localStorage.getItem(SUBTITLE_RAW_FORMAT_KEY);
    if (saved === "html" || saved === "aegisub") {
      return saved;
    }
  } catch (e) {
    console.error("Ошибка чтения формата разметки субтитров:", e);
  }
  return "html";
};

/** Получение сохранённого режима непрозрачности окна субтитров. */
export const getInitialSubtitlesOpaque = (): boolean => {
  try {
    const saved = localStorage.getItem(SUBTITLE_OPAQUE_KEY);
    if (saved !== null) {
      return saved === "true";
    }
  } catch (e) {
    console.error("Ошибка чтения режима непрозрачности субтитров:", e);
  }
  return false;
};

/**
 * Преобразование шестнадцатеричного цвета HTML (#RRGGBB или #RGB) в формат ASS (&HBBGGRR&).
 */
export function hexToAssColor(hex: string): string {
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length === 6) {
    const r = clean.slice(0, 2);
    const g = clean.slice(2, 4);
    const b = clean.slice(4, 6);
    return `&H${b}${g}${r}&`;
  }
  return `&H${clean}&`;
}

/**
 * Преобразование цвета ASS (&HBBGGRR& или &HAABBGGRR) в шестнадцатеричный HTML (#RRGGBB).
 */
export function assColorToHex(ass: string): string {
  const clean = ass
    .replace(/^(?:1c|c)?&?H?/i, "")
    .replace(/&$/, "")
    .trim();
  if (!clean) return "#FFFFFF";
  const val = parseInt(clean, 16);
  if (isNaN(val)) return "#FFFFFF";
  const b = (val >> 16) & 0xff;
  const g = (val >> 8) & 0xff;
  const r = val & 0xff;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
}

/**
 * Преобразование HTML/SRT разметки в классический формат тегов Aegisub/ASS.
 */
export function toAegisubMarkup(raw: string, line?: SubtitleLine): string {
  const src = raw || line?.text || "";
  if (!src) return "";

  // Если уже содержит теги ASS или переносы \N
  if (/\{[\\\/][^}]*\}/.test(src) || src.includes("\\N")) {
    return src.replace(/\r?\n/g, "\\N");
  }

  let result = src;

  // Конвертация <font ...> в {\fn...\fs...\c...}
  result = result.replace(/<font\s+([^>]+)>/gi, (_, attrs) => {
    let fn = "";
    let fs = "";
    let col = "";

    const faceMatch = attrs.match(/face=["']([^"']+)["']/i);
    if (faceMatch) fn = `\\fn${faceMatch[1]}`;

    const sizeMatch = attrs.match(/size=["']([^"']+)["']/i);
    if (sizeMatch) fs = `\\fs${sizeMatch[1]}`;

    const colMatch = attrs.match(/color=["']([^"']+)["']/i);
    if (colMatch) col = `\\c${hexToAssColor(colMatch[1])}`;

    const tags = `${fn}${fs}${col}`;
    return tags ? `{${tags}}` : "";
  });

  result = result.replace(/<\/font>/gi, "");
  result = result.replace(/<b>/gi, "{\\b1}").replace(/<\/b>/gi, "{\\b0}");
  result = result.replace(/<i>/gi, "{\\i1}").replace(/<\/i>/gi, "{\\i0}");
  result = result.replace(/<u>/gi, "{\\u1}").replace(/<\/u>/gi, "{\\u0}");
  result = result.replace(/<br\s*\/?>/gi, "\\N");
  result = result.replace(/\r?\n/g, "\\N");

  // Добавление метаданных шрифта/цвета в теги реплики, если они отсутствуют в теле строки
  if (line) {
    let preTags = "";
    if (line.font_name && !result.includes("\\fn")) {
      preTags += `\\fn${line.font_name}`;
    }
    if (line.font_size && !result.includes("\\fs")) {
      preTags += `\\fs${Math.round(line.font_size)}`;
    }
    if (line.color && !result.includes("\\c&H") && !result.includes("\\1c&H")) {
      preTags += `\\c${hexToAssColor(line.color)}`;
    }
    if (preTags) {
      result = `{${preTags}}${result}`;
    }
  }

  return result;
}

/**
 * Преобразование ASS-разметки в HTML/SRT представление.
 */
export function toHtmlMarkup(raw: string, line?: SubtitleLine): string {
  const src = raw || line?.text || "";
  if (!src) return "";

  // Если уже содержит HTML-разметку
  if (/<font|<i\b|<b\b/i.test(src)) {
    return src;
  }

  let result = src;

  result = result.replace(/\\N/g, "\n").replace(/\\h/g, " ");
  result = result.replace(/\{\\i1\}/gi, "<i>").replace(/\{\\i0\}/gi, "</i>");
  result = result.replace(/\{\\b1\}/gi, "<b>").replace(/\{\\b0\}/gi, "</b>");
  result = result.replace(/\{\\u1\}/gi, "<u>").replace(/\{\\u0\}/gi, "</u>");

  // Конвертация блоков {\fn... \fs... \c...}
  result = result.replace(/\{([^{}]+)\}/g, (_, content) => {
    let fn = "";
    let fs = "";
    let col = "";

    const tags = content.split("\\");
    for (const tag of tags) {
      const trimmed = tag.trim();
      if (trimmed.startsWith("fn")) {
        fn = trimmed.slice(2).trim();
      } else if (trimmed.startsWith("fs")) {
        fs = trimmed.slice(2).trim();
      } else if (trimmed.startsWith("c&H") || trimmed.startsWith("1c&H")) {
        col = assColorToHex(trimmed);
      }
    }

    if (fn || fs || col) {
      let attrs = "";
      if (fn) attrs += ` face="${fn}"`;
      if (fs) attrs += ` size="${fs}"`;
      if (col) attrs += ` color="${col}"`;
      return `<font${attrs}>`;
    }
    return "";
  });

  const openCount = (result.match(/<font\b/gi) || []).length;
  const closeCount = (result.match(/<\/font>/gi) || []).length;
  if (openCount > closeCount) {
    result += "</font>".repeat(openCount - closeCount);
  }

  if (!result.includes("<font") && line && (line.font_name || line.font_size)) {
    let attrs = "";
    if (line.font_name) attrs += ` face="${line.font_name}"`;
    if (line.font_size) attrs += ` size="${Math.round(line.font_size)}"`;
    if (line.color) attrs += ` color="${line.color}"`;
    result = `<font${attrs}>${result}</font>`;
  }

  return result;
}
