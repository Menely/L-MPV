/**
 * Модуль управления параметрами внешнего вида интерфейса L-MPV.
 *
 * Предоставляет функции и токены для настройки уровня скругления (Border Radius),
 * масштабирования интерфейса (UI Scale) и прозрачности (UI Opacity).
 */

// ─── Скругления интерфейса (Border Radius) ───────────────────────────────────

export type UiRadiusLevel = "none" | "minimal" | "default" | "smooth" | "pill" | "custom";

export interface UiRadiusTokens {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  pill: string;
  controls: string;
}

export interface UiRadiusPreset {
  id: Exclude<UiRadiusLevel, "custom">;
  label: string;
  badge: string;
  desc: string;
  controlsRadius: number;
  tokens: UiRadiusTokens;
}

/**
 * Расчет гармоничных пропорций CSS-токенов скругления по радиусу панели управления.
 */
export function calculateRadiusTokens(controlsRadius: number): UiRadiusTokens {
  const r = Math.max(0, Math.min(48, Math.round(controlsRadius)));
  if (r === 0) {
    return { xs: "0px", sm: "0px", md: "0px", lg: "0px", xl: "0px", pill: "0px", controls: "0px" };
  }
  return {
    xs: `${Math.max(1, Math.round(r * 0.25))}px`,
    sm: `${Math.max(2, Math.round(r * 0.38))}px`,
    md: `${Math.max(4, Math.round(r * 0.62))}px`,
    lg: `${Math.max(6, Math.round(r * 0.88))}px`,
    xl: `${Math.max(8, Math.round(r * 1.25))}px`,
    pill: r >= 26 ? "9999px" : `${Math.max(12, r * 2)}px`,
    controls: `${r}px`,
  };
}

/**
 * Наборы дизайн-токенов скругления для каждого уровня.
 */
export const UI_RADIUS_PRESETS: Record<Exclude<UiRadiusLevel, "custom">, UiRadiusPreset> = {
  none: {
    id: "none",
    label: "Прямоугольный",
    badge: "0 px",
    desc: "Строгие прямые углы в духе классических медиаплееров",
    controlsRadius: 0,
    tokens: { xs: "0px", sm: "0px", md: "0px", lg: "0px", xl: "0px", pill: "0px", controls: "0px" },
  },
  minimal: {
    id: "minimal",
    label: "Минимальный",
    badge: "8 px",
    desc: "Сдержанные строгие скругления элементов и окон",
    controlsRadius: 8,
    tokens: { xs: "2px", sm: "4px", md: "6px", lg: "8px", xl: "10px", pill: "12px", controls: "8px" },
  },
  default: {
    id: "default",
    label: "Стандартный",
    badge: "16 px (Стандарт)",
    desc: "Фирменный сбалансированный стиль L-MPV по умолчанию",
    controlsRadius: 16,
    tokens: { xs: "4px", sm: "6px", md: "10px", lg: "14px", xl: "20px", pill: "50px", controls: "16px" },
  },
  smooth: {
    id: "smooth",
    label: "Мягкий",
    badge: "22 px",
    desc: "Выразительные плавные грани панелей, кнопок и окон",
    controlsRadius: 22,
    tokens: { xs: "6px", sm: "10px", md: "16px", lg: "20px", xl: "26px", pill: "50px", controls: "22px" },
  },
  pill: {
    id: "pill",
    label: "Капсульный",
    badge: "30 px",
    desc: "Максимально округлые овальные формы и капсулы",
    controlsRadius: 30,
    tokens: { xs: "8px", sm: "14px", md: "22px", lg: "28px", xl: "34px", pill: "9999px", controls: "30px" },
  },
};

export const UI_RADIUS_STORAGE_KEY = "l-mpv-ui-radius";
export const UI_RADIUS_VALUE_STORAGE_KEY = "l-mpv-ui-radius-value";

/**
 * Получить текущий сохранённый уровень и числовое значение скругления.
 */
export function getSavedUiRadius(): { level: UiRadiusLevel; value: number } {
  try {
    const saved = localStorage.getItem(UI_RADIUS_STORAGE_KEY) as UiRadiusLevel | null;
    const rawVal = localStorage.getItem(UI_RADIUS_VALUE_STORAGE_KEY);

    if (saved && (saved in UI_RADIUS_PRESETS || saved === "custom")) {
      let value: number;
      if (rawVal !== null) {
        const parsed = parseInt(rawVal, 10);
        value = Number.isFinite(parsed) && parsed >= 0 && parsed <= 48 ? parsed : 16;
      } else {
        value = saved in UI_RADIUS_PRESETS
          ? UI_RADIUS_PRESETS[saved as Exclude<UiRadiusLevel, "custom">].controlsRadius
          : 16;
      }
      return { level: saved, value };
    }
  } catch (e) {
    console.error("Ошибка загрузки скругления UI из localStorage:", e);
  }
  return { level: "default", value: 16 };
}

/**
 * Применить уровень скругления к корневому документу приложения.
 */
export function applyUiRadius(level: UiRadiusLevel, customValue?: number): void {
  const root = document.documentElement;
  const isCustom = level === "custom";
  const val = typeof customValue === "number" && Number.isFinite(customValue) ? customValue : 16;
  const tokens = isCustom
    ? calculateRadiusTokens(val)
    : (UI_RADIUS_PRESETS[level as Exclude<UiRadiusLevel, "custom">] || UI_RADIUS_PRESETS.default).tokens;

  root.setAttribute("data-ui-radius", isCustom ? "custom" : level);
  root.style.setProperty("--radius-xs", tokens.xs);
  root.style.setProperty("--radius-sm", tokens.sm);
  root.style.setProperty("--radius-md", tokens.md);
  root.style.setProperty("--radius-lg", tokens.lg);
  root.style.setProperty("--radius-xl", tokens.xl);
  root.style.setProperty("--radius-pill", tokens.pill);
  root.style.setProperty("--radius-controls", tokens.controls);
}

/**
 * Сохранить и мгновенно применить уровень скругления.
 */
export function saveUiRadius(level: UiRadiusLevel, customValue?: number): void {
  const value =
    typeof customValue === "number" && Number.isFinite(customValue)
      ? customValue
      : (level in UI_RADIUS_PRESETS
          ? UI_RADIUS_PRESETS[level as Exclude<UiRadiusLevel, "custom">].controlsRadius
          : 16);

  try {
    localStorage.setItem(UI_RADIUS_STORAGE_KEY, level);
    localStorage.setItem(UI_RADIUS_VALUE_STORAGE_KEY, value.toString());
  } catch (e) {
    console.error("Ошибка сохранения скругления UI в localStorage:", e);
  }
  applyUiRadius(level, value);
  window.dispatchEvent(
    new CustomEvent("l-mpv-ui-radius-changed", { detail: { level, value } })
  );
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}

// ─── Размеры и масштаб интерфейса (UI Scale) ─────────────────────────────────

export type UiScaleMode =
  | "auto"
  | "compact"
  | "standard"
  | "medium"
  | "large"
  | "maximum"
  | "custom";

export interface UiScalePreset {
  id: UiScaleMode;
  label: string;
  badge: string;
  desc: string;
  value: number | null; // null означает адаптивное авто-масштабирование
}

export const UI_SCALE_PRESETS: UiScalePreset[] = [
  {
    id: "auto",
    label: "Авто (Адаптивно)",
    badge: "Авто (Стандарт)",
    desc: "Автоматический подбор масштаба под разрешение экрана (1.0 – 1.5x)",
    value: null,
  },
  {
    id: "compact",
    label: "Компактный",
    badge: "85%",
    desc: "Экономия пространства, максимум полезной площади видео",
    value: 0.85,
  },
  {
    id: "standard",
    label: "Стандартный",
    badge: "100%",
    desc: "Классический исходный размер элементов интерфейса 1:1",
    value: 1.0,
  },
  {
    id: "medium",
    label: "Увеличенный",
    badge: "115%",
    desc: "Комфортный масштаб для мониторов 1080p и 1440p",
    value: 1.15,
  },
  {
    id: "large",
    label: "Крупный",
    badge: "130%",
    desc: "Крупные кнопки и легко читаемые надписи с расстояния",
    value: 1.3,
  },
  {
    id: "maximum",
    label: "Максимальный",
    badge: "150%",
    desc: "Оптимально для 4K экранов, телевизоров и диванного просмотра",
    value: 1.5,
  },
];

export const UI_SCALE_MODE_STORAGE_KEY = "l-mpv-ui-scale-mode";
export const UI_SCALE_VALUE_STORAGE_KEY = "l-mpv-ui-scale-value";

/**
 * Получить текущие настройки масштабирования интерфейса.
 */
export function getSavedUiScale(): { mode: UiScaleMode; value: number } {
  try {
    const savedMode = (localStorage.getItem(UI_SCALE_MODE_STORAGE_KEY) as UiScaleMode) || "auto";
    const rawVal = localStorage.getItem(UI_SCALE_VALUE_STORAGE_KEY);
    const parsedVal = rawVal ? parseFloat(rawVal) : 1.0;
    const value = Number.isFinite(parsedVal) && parsedVal >= 0.7 && parsedVal <= 2.0 ? parsedVal : 1.0;
    return { mode: savedMode, value };
  } catch (e) {
    console.error("Ошибка загрузки масштаба UI из localStorage:", e);
  }
  return { mode: "auto", value: 1.0 };
}

/**
 * Применить масштаб к корневому элементу DOM.
 */
export function applyUiScale(mode: UiScaleMode, customValue?: number): void {
  const root = document.documentElement;
  if (mode === "auto") {
    root.style.removeProperty("--ui-scale");
    root.setAttribute("data-ui-scale-mode", "auto");
  } else {
    let scale = customValue;
    if (typeof scale !== "number" || !Number.isFinite(scale)) {
      const foundPreset = UI_SCALE_PRESETS.find((p) => p.id === mode);
      scale = foundPreset && foundPreset.value !== null ? foundPreset.value : 1.0;
    }
    const clampedScale = Math.max(0.7, Math.min(2.0, Number(scale.toFixed(2))));
    root.style.setProperty("--ui-scale", clampedScale.toString());
    root.setAttribute("data-ui-scale-mode", mode);
  }
}

/**
 * Сохранить и мгновенно применить масштаб интерфейса.
 */
export function saveUiScale(mode: UiScaleMode, value?: number): void {
  const scale =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : (UI_SCALE_PRESETS.find((p) => p.id === mode)?.value ?? 1.0);

  try {
    localStorage.setItem(UI_SCALE_MODE_STORAGE_KEY, mode);
    localStorage.setItem(UI_SCALE_VALUE_STORAGE_KEY, scale.toFixed(2));
  } catch (e) {
    console.error("Ошибка сохранения масштаба UI в localStorage:", e);
  }
  applyUiScale(mode, scale);
  window.dispatchEvent(new CustomEvent("l-mpv-ui-scale-changed", { detail: { mode, value: scale } }));
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}

// ─── Прозрачность интерфейса (UI Opacity) ────────────────────────────────────

export const UI_OPACITY_STORAGE_KEY = "l-mpv-ui-opacity";
export const DEFAULT_UI_OPACITY = 0.88;

/**
 * Получить сохранённое значение прозрачности интерфейса (по умолчанию 0.88).
 */
export function getSavedUiOpacity(): number {
  try {
    const raw = localStorage.getItem(UI_OPACITY_STORAGE_KEY);
    if (raw) {
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 1.0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Ошибка загрузки прозрачности UI из localStorage:", e);
  }
  return DEFAULT_UI_OPACITY;
}

/**
 * Применить значение прозрачности интерфейса к CSS-переменной --ui-opacity.
 */
export function applyUiOpacity(opacity: number): void {
  const clamped = Math.max(0.1, Math.min(1.0, Number(opacity.toFixed(2))));
  document.documentElement.style.setProperty("--ui-opacity", clamped.toString());
}

/**
 * Сохранить и мгновенно применить прозрачность интерфейса.
 */
export function saveUiOpacity(opacity: number): void {
  const clamped = Math.max(0.1, Math.min(1.0, Number(opacity.toFixed(2))));
  try {
    localStorage.setItem(UI_OPACITY_STORAGE_KEY, clamped.toString());
  } catch (e) {
    console.error("Ошибка сохранения прозрачности UI в localStorage:", e);
  }
  applyUiOpacity(clamped);
  window.dispatchEvent(new CustomEvent("l-mpv-ui-opacity-changed", { detail: clamped }));
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}
