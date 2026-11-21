/**
 * Сетевые источники (YouTube и др.): распознавание ссылок на фронтенде.
 * Окончательную проверку и нормализацию выполняет бэкенд (`commands/streaming.rs`).
 */

const SCHEME_RE = /^([a-z][a-z\d+.-]+):\/\//i;
const STREAM_SCHEMES = new Set([
  "http", "https", "ytdl", "rtsp", "rtsps", "rtmp", "rtmps", "mms", "mmsh", "udp", "rtp", "srt",
]);
const BARE_HOST_RE = /^(?:www\.|(?:m\.|music\.)?youtube\.com\/|youtu\.be\/)/i;

/** Путь mpv указывает на сеть (`https://…`, `ytdl://…`), а не на локальный файл. */
export function isRemoteMediaPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const match = SCHEME_RE.exec(path.trim());
  if (match) return match[1].toLowerCase() !== "file";
  return /^ytdl:/i.test(path.trim());
}

/** Текст похож на ссылку, которую можно открыть как поток (вставка из буфера, CLI). */
export function looksLikeStreamUrl(text: string | null | undefined): boolean {
  const value = (text ?? "").trim().replace(/^["'<]+|["'>]+$/g, "");
  if (!value || value.length > 4096 || /\s/.test(value)) return false;
  const match = SCHEME_RE.exec(value);
  if (match) return STREAM_SCHEMES.has(match[1].toLowerCase()) && value.length > match[0].length;
  return BARE_HOST_RE.test(value);
}

/** Ограничения качества потока (высота кадра); 0 — без ограничения. */
export const STREAM_QUALITY_OPTIONS = [0, 2160, 1440, 1080, 720, 480] as const;
export type StreamQuality = (typeof STREAM_QUALITY_OPTIONS)[number];

const QUALITY_STORAGE_KEY = "l-mpv-stream-quality";
const DEFAULT_QUALITY: StreamQuality = 1080;

export function getSavedStreamQuality(): StreamQuality {
  try {
    const stored = localStorage.getItem(QUALITY_STORAGE_KEY);
    const value = stored === null ? NaN : Number(stored);
    if ((STREAM_QUALITY_OPTIONS as readonly number[]).includes(value)) {
      return value as StreamQuality;
    }
  } catch {
    /* localStorage недоступен — используем значение по умолчанию */
  }
  return DEFAULT_QUALITY;
}

export function saveStreamQuality(quality: StreamQuality): void {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, String(quality));
  } catch {
    /* не критично */
  }
}

/** Коды ошибок бэкенда, у которых есть локализованный текст. */
export type StreamErrorCode =
  | "STREAM_INVALID_URL"
  | "STREAM_TOOLS_MISSING"
  | "STREAM_TOOLS_BUSY"
  | "STREAM_NOT_SUPPORTED";

export function streamErrorCode(err: unknown): StreamErrorCode | null {
  const text = String(err ?? "");
  const codes: StreamErrorCode[] = ["STREAM_INVALID_URL", "STREAM_TOOLS_MISSING", "STREAM_TOOLS_BUSY", "STREAM_NOT_SUPPORTED"];
  return codes.find((code) => text.includes(code)) ?? null;
}

export interface StreamingToolsStatus {
  ytdlp_installed: boolean;
  deno_installed: boolean;
  ready: boolean;
  ytdlp_version: string | null;
  deno_version: string | null;
  installing: boolean;
  updating: boolean;
  dir: string;
}

export interface StreamingToolsProgress {
  stage: "ytdlp" | "deno" | "verify" | "extract" | "update" | "done";
  percent: number;
  downloaded_bytes: number;
  total_bytes: number;
  finished: boolean;
  error: string | null;
}

export interface StreamOpenStatus {
  url: string;
  state: "resolving" | "ready" | "failed";
  title: string | null;
  error: string | null;
}
