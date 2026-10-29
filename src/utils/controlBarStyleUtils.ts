/**
 * Утилиты для управления стилем панели управления («Стиль плеера») в L-MPV:
 * - "capsule": Три парящих островка (потоки, транспорт, утилиты) с отдельной полосой таймлайна.
 * - "modern": Единая парящая капсула со встроенным таймлайном (ранее "floating").
 * - "docked": Классический стиль во всю ширину окна внизу без зазоров.
 */

export type ControlBarStyle = "capsule" | "modern" | "docked";

export const CONTROL_BAR_STYLE_STORAGE_KEY = "l-mpv-control-bar-style";
export const DEFAULT_CONTROL_BAR_STYLE: ControlBarStyle = "modern";

export interface ControlBarStyleOption {
  id: ControlBarStyle;
  label: string;
  desc: string;
  badge: string;
}

export const CONTROL_BAR_STYLE_OPTIONS: ControlBarStyleOption[] = [
  {
    id: "capsule",
    label: "Капсула",
    desc: "Три парящих островка с независимой полосой таймлайна",
    badge: "Новинка",
  },
  {
    id: "modern",
    label: "Модерн",
    desc: "Единая парящая капсула со встроенным таймлайном",
    badge: "Современный",
  },
  {
    id: "docked",
    label: "Классический",
    desc: "Сплошная панель во всю ширину окна без зазоров",
    badge: "Классический",
  },
];

/**
 * Чтение сохранённого стиля панели управления из localStorage с валидацией
 * и автоматической миграцией устаревшего значения "floating" -> "modern".
 */
export function getSavedControlBarStyle(): ControlBarStyle {
  try {
    const saved = localStorage.getItem(CONTROL_BAR_STYLE_STORAGE_KEY);
    if (saved === "floating" || saved === "modern") {
      return "modern";
    }
    if (saved === "capsule" || saved === "docked") {
      return saved;
    }
  } catch (e) {
    console.error("Ошибка чтения стиля плеера из localStorage:", e);
  }
  return DEFAULT_CONTROL_BAR_STYLE;
}

/**
 * Сохранение стиля панели управления в localStorage и отправка глобального события.
 */
export function saveControlBarStyle(style: ControlBarStyle | "floating"): void {
  try {
    const normalizedStyle: ControlBarStyle = style === "floating" ? "modern" : style;
    localStorage.setItem(CONTROL_BAR_STYLE_STORAGE_KEY, normalizedStyle);
  } catch (e) {
    console.error("Ошибка сохранения стиля плеера в localStorage:", e);
  }
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}
