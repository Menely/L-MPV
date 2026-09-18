/**
 * Схема хранения пользовательской раскладки ПКМ-меню.
 *
 * Раскладка — упорядоченный массив записей LayoutEntry,
 * где каждая запись — либо пункт меню, либо разделитель.
 * Сохраняется в localStorage под ключом STORAGE_KEY.
 */

import { invoke } from "@tauri-apps/api/core";
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
  { type: "item", id: "screenshot" },
  { type: "item", id: "chapters" },
  { type: "divider" },
  { type: "item", id: "control_buttons_visibility" },
  { type: "item", id: "presets" },
  { type: "divider" },
  { type: "item", id: "detailed_media_info" },
  { type: "item", id: "settings" },
];

/** Кэш раскладки в памяти для мгновенного синхронного доступа. */
let cachedLayout: LayoutEntry[] | null = null;

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

/** Загружает сохранённую раскладку из портативного файла или кэша. */
export function getSavedLayout(): LayoutEntry[] {
  if (cachedLayout) return [...cachedLayout];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cachedLayout = validateLayout(JSON.parse(raw));
      return [...cachedLayout];
    }
  } catch {
    // Игнорируем ошибку чтения локального кэша
  }

  cachedLayout = [...DEFAULT_LAYOUT];
  return [...DEFAULT_LAYOUT];
}

/**
 * Инициализирует и синхронизирует раскладку из портативного
 * файла config/context_menu.json на диске.
 */
export async function initLayoutFromBackend(): Promise<LayoutEntry[]> {
  try {
    const json = await invoke<string>("get_context_menu_layout");
    if (json && json.trim().length > 0) {
      const parsed = JSON.parse(json);
      const validated = validateLayout(parsed);
      cachedLayout = validated;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
      window.dispatchEvent(new Event(LAYOUT_CHANGED_EVENT));
      return [...validated];
    }
  } catch (err) {
    console.error("Ошибка чтения портативного файла config/context_menu.json:", err);
  }
  return getSavedLayout();
}

/** Автоматический фоновый запрос чтения раскладки из портативной папки config/. */
if (typeof window !== "undefined") {
  initLayoutFromBackend().catch(() => {});
}

/**
 * Сохраняет раскладку в портативный файл config/context_menu.json
 * и диспатчит событие обновления интерфейса.
 */
export function saveLayout(layout: LayoutEntry[]): void {
  cachedLayout = [...layout];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Игнорируем ошибку локального кэша
  }

  // Физическое сохранение в портативную директорию плеера
  invoke("save_context_menu_layout", {
    layoutJson: JSON.stringify(layout, null, 2),
  }).catch((err) => {
    console.error("Ошибка сохранения в config/context_menu.json:", err);
  });

  window.dispatchEvent(new Event(LAYOUT_CHANGED_EVENT));
}

/** Сбрасывает раскладку на дефолтную и сохраняет в портативный файл. */
export function resetLayout(): LayoutEntry[] {
  const layout = [...DEFAULT_LAYOUT];
  saveLayout(layout);
  return layout;
}

