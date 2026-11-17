/**
 * Модуль управления шагом перемотки и всплывающим индикатором (Seek Indicator).
 * Обеспечивает единую точку правды для шага перемотки видео (в секундах)
 * и шину событий для UI-оверлеев.
 */

export const DEFAULT_SEEK_STEP_SECONDS = 10;
export const MIN_SEEK_STEP_SECONDS = 1;
export const MAX_SEEK_STEP_SECONDS = 300;

export const SEEK_STEP_STORAGE_KEY = "l-mpv-seek-step-seconds";
export const DEFAULT_SKIP_OPENING_SECONDS = 90;
export const MIN_SKIP_OPENING_SECONDS = 1;
export const MAX_SKIP_OPENING_SECONDS = 600;
export const SKIP_OPENING_STORAGE_KEY = "l-mpv-skip-opening-seconds";
export const SEEK_INDICATOR_EVENT = "l-mpv-seek-action";

export interface SeekActionDetail {
  /** Направление перемотки: назад ('left') или вперед ('right') */
  direction: "left" | "right";
  /** Количество секунд в текущем шаге */
  seconds: number;
}

/** Нормализация шага перемотки в допустимом диапазоне [1..300] сек. */
export function normalizeSeekStepSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_SEEK_STEP_SECONDS;
  return Math.max(MIN_SEEK_STEP_SECONDS, Math.min(MAX_SEEK_STEP_SECONDS, Math.round(seconds)));
}

/** Нормализация шага пропуска опенинга в допустимом диапазоне [1..600] сек. */
export function normalizeSkipOpeningSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_SKIP_OPENING_SECONDS;
  return Math.max(MIN_SKIP_OPENING_SECONDS, Math.min(MAX_SKIP_OPENING_SECONDS, Math.round(seconds)));
}

/**
 * Получить сохранённое значение шага перемотки из localStorage.
 * При отсутствии или некорректном значении возвращает дефолтное (10 сек).
 */
export function getSavedSeekStepSeconds(): number {
  try {
    const val = localStorage.getItem(SEEK_STEP_STORAGE_KEY);
    if (val !== null) {
      const parsed = parseInt(val, 10);
      if (!Number.isNaN(parsed) && parsed >= MIN_SEEK_STEP_SECONDS && parsed <= MAX_SEEK_STEP_SECONDS) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Ошибка чтения шага перемотки из localStorage:", e);
  }
  return DEFAULT_SEEK_STEP_SECONDS;
}

/**
 * Сохранить пользовательский шаг перемотки в localStorage и при необходимости уведомить систему.
 */
export function saveSeekStepSeconds(seconds: number, notify: boolean = true): void {
  try {
    const clamped = normalizeSeekStepSeconds(seconds);
    localStorage.setItem(SEEK_STEP_STORAGE_KEY, clamped.toString());
    if (notify) {
      window.dispatchEvent(new Event("l-mpv-settings-changed"));
    }
  } catch (e) {
    console.error("Ошибка сохранения шага перемотки в localStorage:", e);
  }
}

/**
 * Получить сохранённое значение перемотки опенинга из localStorage.
 * При отсутствии или некорректном значении возвращает дефолтное (90 сек).
 */
export function getSavedSkipOpeningSeconds(): number {
  try {
    const val = localStorage.getItem(SKIP_OPENING_STORAGE_KEY);
    if (val !== null) {
      const parsed = parseInt(val, 10);
      if (!Number.isNaN(parsed) && parsed >= MIN_SKIP_OPENING_SECONDS && parsed <= MAX_SKIP_OPENING_SECONDS) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Ошибка чтения шага перемотки опенинга из localStorage:", e);
  }
  return DEFAULT_SKIP_OPENING_SECONDS;
}

/**
 * Сохранить пользовательский шаг перемотки опенинга в localStorage и уведомить систему.
 */
export function saveSkipOpeningSeconds(seconds: number, notify: boolean = true): void {
  try {
    const clamped = normalizeSkipOpeningSeconds(seconds);
    localStorage.setItem(SKIP_OPENING_STORAGE_KEY, clamped.toString());
    if (notify) {
      window.dispatchEvent(new Event("l-mpv-settings-changed"));
    }
  } catch (e) {
    console.error("Ошибка сохранения шага перемотки опенинга в localStorage:", e);
  }
}

/**
 * Вызвать появление всплывающего индикатора перемотки (YouTube-like).
 */
export function triggerSeekIndicator(direction: "left" | "right", seconds: number): void {
  try {
    window.dispatchEvent(
      new CustomEvent<SeekActionDetail>(SEEK_INDICATOR_EVENT, {
        detail: { direction, seconds },
      })
    );
  } catch (e) {
    console.error("Ошибка отправки события индикатора перемотки:", e);
  }
}
