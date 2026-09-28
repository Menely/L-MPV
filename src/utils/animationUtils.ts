/**
 * Единый центр управления анимациями L-MPV.
 *
 * Проблема которую решает модуль:
 * - раньше проверка `document.documentElement.classList.contains("no-animations")`
 *   была скопирована в 10+ мест, а длительности закрытия (120/140/200мс)
 *   хардкодились в каждом `setTimeout` отдельно от CSS-переменных
 *   `--t-close-fast/base` — рассинхрон давал обрезанные или залипающие анимации;
 * - флаг хранился в двух местах: класс `no-animations` и атрибут
 *   `data-animations`, которые могли разъехаться.
 *
 * Теперь: один источник правды. CSS-переменные в `variables.css` — эталон,
 * константы ниже — их зеркало. При смене длительностей менять в двух местах.
 */

export const CLOSE_FAST_MS = 120; // = --t-close-fast
export const CLOSE_BASE_MS = 140; // = --t-close-base (+ modalOverlayFadeOut/modalFadeOut)
export const CLOSE_OSD_MS = 200; // = osdFadeOut 200ms в base.css
export const CLOSE_BUFFER_MS = 50; // запас на пропуск кадра / rAF-джиттер

export type CloseKind = "fast" | "base" | "osd";

export function getCloseCssMs(kind: CloseKind): number {
  if (kind === "fast") return CLOSE_FAST_MS;
  if (kind === "osd") return CLOSE_OSD_MS;
  return CLOSE_BASE_MS;
}

/** Полный таймаут для JS (CSS + запас). Использовать везде вместо магических чисел. */
export function getCloseTimeoutMs(kind: CloseKind): number {
  return getCloseCssMs(kind) + CLOSE_BUFFER_MS;
}

const ANIM_KEY = "l-mpv-animations-enabled";

/** Анимации разрешены? Учитывает ручной тумблер и системный reduce-motion. */
export function isMotionAllowed(): boolean {
  try {
    if (typeof document !== "undefined") {
      if (document.documentElement.classList.contains("no-animations")) return false;
    }
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    }
  } catch {
    /* ignore — считаем что motion разрешён */
  }
  return true;
}

export function isAnimationsEnabled(): boolean {
  try {
    return localStorage.getItem(ANIM_KEY) !== "false";
  } catch {
    return true;
  }
}

/**
 * Единственная точка переключения анимаций.
 * Синхронизирует localStorage + класс + data-атрибут + событие.
 * Не делает IPC — персист в settings.json идёт через существующий uiSettingsSync.
 */
export function setAnimationsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ANIM_KEY, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
  try {
    document.documentElement.classList.toggle("no-animations", !enabled);
    document.documentElement.setAttribute("data-animations", enabled ? "on" : "off");
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
  } catch {
    /* ignore */
  }
}

/** Применить текущее значение флага к DOM (вызывать при старте/гидратации). */
export function applyAnimationsFlagToDom(): void {
  const enabled = isAnimationsEnabled();
  try {
    document.documentElement.classList.toggle("no-animations", !enabled);
    document.documentElement.setAttribute("data-animations", enabled ? "on" : "off");
  } catch {
    /* ignore */
  }
}
