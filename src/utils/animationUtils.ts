/**
 * Единый центр управления анимациями L-MPV.
 *
 * Проблема которую решает модуль:
 * - раньше длительности закрытия (120/140/200мс) хардкодились в каждом
 *   `setTimeout` отдельно от CSS-переменных `--t-close-*`
 *   — рассинхрон давал обрезанные или залипающие анимации.
 *
 * Теперь: один источник правды. CSS-переменные в `variables.css` — эталон,
 * константы ниже — их JS-зеркало. При смене длительностей менять синхронно.
 *
 * Кинетическая модель (5 уровней):
 *   instant → fast → pop → panel → modal
 * Правило закрытия: exit ≈ 70% от entry (быстрее освобождаем экран).
 */

/* ─── Entry durations (мс) — зеркало CSS --t-* ──────── */
export const T_INSTANT_MS = 100;  // = --t-instant  (тактильный отклик)
export const T_FAST_MS    = 160;  // = --t-fast     (ховеры, тултипы)
export const T_POP_MS     = 220;  // = --t-pop      (поповеры, меню)
export const T_PANEL_MS   = 280;  // = --t-panel    (плейлист, drawer)
export const T_MODAL_MS   = 320;  // = --t-modal    (настройки, MediaInfo)

/* ─── Exit durations (мс) — зеркало CSS --t-close-* ─── */
export const CLOSE_FAST_MS  = 120;  // = --t-close-fast  (ховер-состояния)
export const CLOSE_POP_MS   = 155;  // = --t-close-pop   (поповеры, контекстное меню)
export const CLOSE_PANEL_MS = 200;  // = --t-close-panel (плейлист, боковые панели)
export const CLOSE_MODAL_MS = 230;  // = --t-close-modal (модальные окна)

/** Запас на пропуск кадра / rAF-джиттер (добавляется к CSS-длительности в setTimeout). */
export const CLOSE_BUFFER_MS = 40;

/* Обратная совместимость: старые экспорты → псевдонимы */
/** @deprecated Используй CLOSE_POP_MS */
export const CLOSE_BASE_MS = CLOSE_POP_MS;
/** @deprecated Используй T_POP_MS */
export const CLOSE_OSD_MS  = T_POP_MS;

export type CloseKind = "fast" | "pop" | "panel" | "modal" | "base" | "osd";

export function getCloseCssMs(kind: CloseKind): number {
  switch (kind) {
    case "fast":  return CLOSE_FAST_MS;
    case "pop":   return CLOSE_POP_MS;
    case "panel": return CLOSE_PANEL_MS;
    case "modal": return CLOSE_MODAL_MS;
    /* обратная совместимость */
    case "base":  return CLOSE_POP_MS;
    case "osd":   return CLOSE_PANEL_MS;
    default:      return CLOSE_POP_MS;
  }
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
