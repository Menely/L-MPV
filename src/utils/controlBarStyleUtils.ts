/**
 * Утилиты для управления стилем панели управления (Control Bar) в L-MPV:
 * - "floating": Парящий остров (Floating Island) с отступами снизу и скруглением углов (Стандарт).
 * - "docked": Пристыкованная плашка (Docked Bar) во всю ширину окна внизу без зазоров.
 */

export type ControlBarStyle = "floating" | "docked";

export const CONTROL_BAR_STYLE_STORAGE_KEY = "l-mpv-control-bar-style";
export const DEFAULT_CONTROL_BAR_STYLE: ControlBarStyle = "floating";

export interface ControlBarStyleOption {
  id: ControlBarStyle;
  label: string;
  desc: string;
  badge: string;
}

export const CONTROL_BAR_STYLE_OPTIONS: ControlBarStyleOption[] = [
  {
    id: "floating",
    label: "Парящий остров (Floating)",
    desc: "Воздушная капсула с отступами от краев",
    badge: "Современный",
  },
  {
    id: "docked",
    label: "Пристыкованная планка (Docked)",
    desc: "Сплошная панель во всю ширину окна без зазоров",
    badge: "Классический",
  },
];

/**
 * Чтение сохранённого стиля панели управления из localStorage с валидацией.
 */
export function getSavedControlBarStyle(): ControlBarStyle {
  try {
    const saved = localStorage.getItem(CONTROL_BAR_STYLE_STORAGE_KEY);
    if (saved === "floating" || saved === "docked") {
      return saved;
    }
  } catch (e) {
    console.error("Ошибка чтения стиля панели управления из localStorage:", e);
  }
  return DEFAULT_CONTROL_BAR_STYLE;
}

/**
 * Сохранение стиля панели управления в localStorage и отправка глобального события.
 */
export function saveControlBarStyle(style: ControlBarStyle): void {
  try {
    localStorage.setItem(CONTROL_BAR_STYLE_STORAGE_KEY, style);
  } catch (e) {
    console.error("Ошибка сохранения стиля панели управления в localStorage:", e);
  }
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}
