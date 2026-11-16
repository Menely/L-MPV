/**
 * Модуль управления шагом перемотки и всплывающим индикатором (Seek Indicator).
 * Обеспечивает единую точку правды для шага перемотки видео (в секундах)
 * и шину событий для UI-оверлеев.
 */

export const DEFAULT_SEEK_STEP_SECONDS = 10;
export const MIN_SEEK_STEP_SECONDS = 1;
export const MAX_SEEK_STEP_SECONDS = 300;

export const SEEK_STEP_STORAGE_KEY = "l-mpv-seek-step-seconds";
export const SEEK_INDICATOR_EVENT = "l-mpv-seek-action";

export interface SeekActionDetail {
  /** Направление перемотки: назад ('left') или вперед ('right') */
  direction: "left" | "right";
  /** Количество секунд в текущем шаге */
  seconds: number;
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
 * Сохранить пользовательский шаг перемотки в localStorage и уведомить систему.
 */
export function saveSeekStepSeconds(seconds: number): void {
  try {
    const clamped = Math.max(
      MIN_SEEK_STEP_SECONDS,
      Math.min(MAX_SEEK_STEP_SECONDS, Math.round(seconds))
    );
    localStorage.setItem(SEEK_STEP_STORAGE_KEY, clamped.toString());
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
  } catch (e) {
    console.error("Ошибка сохранения шага перемотки в localStorage:", e);
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
