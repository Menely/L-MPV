/**
 * Схема хранения пользовательской раскладки ПКМ-меню.
 *
 * Раскладка — упорядоченный массив записей LayoutEntry,
 * где каждая запись — либо пункт меню, либо разделитель.
 * Сохраняется в localStorage под ключом STORAGE_KEY.
 */

import { type MenuItemId, isMenuItemId } from "./contextMenuRegistry";

/** Запись раскладки меню: пункт или разделитель. */
export type LayoutEntry =
  | { type: "item"; id: MenuItemId }
  | { type: "divider" };

const STORAGE_KEY = "l-mpv-context-menu-layout";

/** Событие, диспатчится при изменении раскладки меню. */
export const LAYOUT_CHANGED_EVENT = "l-mpv-context-menu-layout-changed";

/**
 * Раскладка по умолчанию, полностью совпадающая
 * с прежним хардкоженным menuItems в ContextMenu.tsx.
 */
export const DEFAULT_LAYOUT: LayoutEntry[] = [
  { type: "item", id: "open_file" },
  { type: "divider" },
  { type: "item", id: "audio_track" },
  { type: "item", id: "subtitle_track" },
  { type: "divider" },
  { type: "item", id: "chapters" },
  { type: "divider" },
  { type: "item", id: "aspect_ratio" },
  { type: "item", id: "rotation" },
  { type: "item", id: "ambient" },
  { type: "item", id: "speed" },
  { type: "divider" },
  { type: "item", id: "repeat_mode" },
  { type: "item", id: "shuffle" },
  { type: "divider" },
  { type: "item", id: "always_on_top" },
  { type: "item", id: "screenshot" },
  { type: "item", id: "media_info" },
  { type: "item", id: "detailed_media_info" },
  { type: "divider" },
  { type: "item", id: "time_position" },
  { type: "item", id: "time_format" },
  { type: "item", id: "control_bar_style" },
  { type: "item", id: "settings" },
];

/**
 * Валидирует сохранённую раскладку: отфильтровывает
 * устаревшие или некорректные записи.
 */
function validateLayout(raw: unknown): LayoutEntry[] {
  if (!Array.isArray(raw)) return [...DEFAULT_LAYOUT];
  const valid: LayoutEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.type === "divider") {
      valid.push({ type: "divider" });
    } else if (entry.type === "item" && isMenuItemId(entry.id)) {
      valid.push({ type: "item", id: entry.id });
    }
  }
  return valid.some((e) => e.type === "item") ? valid : [...DEFAULT_LAYOUT];
}

/** Загружает сохранённую раскладку из localStorage. */
export function getSavedLayout(): LayoutEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_LAYOUT];
    return validateLayout(JSON.parse(raw));
  } catch {
    return [...DEFAULT_LAYOUT];
  }
}

/** Сохраняет раскладку в localStorage и диспатчит событие обновления. */
export function saveLayout(layout: LayoutEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    window.dispatchEvent(new Event(LAYOUT_CHANGED_EVENT));
  } catch (err) {
    console.error("Ошибка сохранения раскладки меню:", err);
  }
}

/** Сбрасывает раскладку на дефолтную и сохраняет изменение. */
export function resetLayout(): LayoutEntry[] {
  const layout = [...DEFAULT_LAYOUT];
  saveLayout(layout);
  return layout;
}
