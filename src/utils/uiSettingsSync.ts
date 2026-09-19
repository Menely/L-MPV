/**
 * Модуль двусторонней синхронизации визуальных настроек L-MPV с портативным файлом config/settings.json.
 * 
 * Обеспечивает персистентность пользовательского оформления (тема, шрифт, цвета, масштаб,
 * скругления, прозрачность, горячие клавиши и ширина плейлиста) независимо от состояния
 * локального кэша WebView2 и при переносе портативной папки плеера.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  getSavedPlayerTheme,
  savePlayerTheme,
  getGlowIntensity,
  saveGlowIntensity,
  getCustomColors,
  saveCustomColors,
  applyAccentColor,
  applyPlayerTheme,
} from "./colorUtils";
import {
  getSavedUiRadius,
  saveUiRadius,
  getSavedUiScale,
  saveUiScale,
  getSavedUiOpacity,
  saveUiOpacity,
  getSavedUiFont,
  saveUiFont,
  applyUiRadius,
  applyUiScale,
  applyUiOpacity,
  applyUiFont,
  UiFontId,
  UiRadiusLevel,
  UiScaleMode,
} from "./uiThemeUtils";
import {
  getSavedControlBarStyle,
  saveControlBarStyle,
  ControlBarStyle,
} from "./controlBarStyleUtils";
import {
  getSavedTimePosition,
  saveTimePosition,
  TimeDisplayPosition,
} from "./timePositionUtils";
import {
  getSavedTimeFormat,
  saveTimeFormat,
  TimeFormatMode,
} from "./timeFormatUtils";
import { getCustomHotkeys, saveCustomHotkeys } from "./hotkeyUtils";

export interface UiSettings {
  player_theme?: string;
  ui_font?: string;
  accent_color?: string;
  glow_intensity?: string;
  ui_opacity?: number;
  ui_radius_level?: string;
  ui_radius_value?: number;
  ui_scale_mode?: string;
  ui_scale_value?: number;
  control_bar_style?: string;
  time_position?: string;
  time_format?: string;
  animations_enabled?: boolean;
  show_track_names?: boolean;
  playlist_width?: number;
  custom_colors?: string[];
  visible_buttons?: Record<string, boolean>;
  custom_hotkeys?: Record<string, string[]>;
}

let isHydrating = false;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Сбор всех активных визуальных настроек приложения из localStorage и системных утилит.
 */
export function collectCurrentUiSettings(): UiSettings {
  const uiRadius = getSavedUiRadius();
  const uiScale = getSavedUiScale();

  let visibleButtons: Record<string, boolean> | undefined = undefined;
  try {
    const rawButtons = localStorage.getItem("l-mpv-visible-buttons");
    if (rawButtons) {
      visibleButtons = JSON.parse(rawButtons);
    }
  } catch (e) {
    console.error("[UiSettingsSync] Ошибка чтения видимости кнопок:", e);
  }

  let playlistWidth: number | undefined = undefined;
  try {
    const rawWidth = localStorage.getItem("l-mpv-playlist-width");
    if (rawWidth) {
      const parsed = parseInt(rawWidth, 10);
      if (!isNaN(parsed) && parsed >= 360) {
        playlistWidth = parsed;
      }
    }
  } catch (e) {
    console.error("[UiSettingsSync] Ошибка чтения ширины плейлиста:", e);
  }

  return {
    player_theme: getSavedPlayerTheme(),
    ui_font: getSavedUiFont(),
    accent_color: localStorage.getItem("l-mpv-accent-color") || "#7fc7ff",
    glow_intensity: getGlowIntensity(),
    ui_opacity: getSavedUiOpacity(),
    ui_radius_level: uiRadius.level,
    ui_radius_value: uiRadius.value,
    ui_scale_mode: uiScale.mode,
    ui_scale_value: uiScale.value,
    control_bar_style: getSavedControlBarStyle(),
    time_position: getSavedTimePosition(),
    time_format: getSavedTimeFormat(),
    animations_enabled: localStorage.getItem("l-mpv-animations-enabled") !== "false",
    show_track_names: localStorage.getItem("l-mpv-show-track-names") !== "false",
    playlist_width: playlistWidth,
    custom_colors: getCustomColors(),
    visible_buttons: visibleButtons,
    custom_hotkeys: getCustomHotkeys(),
  };
}

/**
 * Асинхронное сохранение параметров интерфейса в config/settings.json с дебаунсом.
 * Предотвращает частые дисковые операции при плавном перемещении ползунков.
 */
export function syncUiSettingsToDisk(delayMs = 400): void {
  if (isHydrating) {
    return;
  }

  if (syncDebounceTimer !== null) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(async () => {
    syncDebounceTimer = null;
    try {
      const currentUi = collectCurrentUiSettings();
      await invoke("save_ui_settings", { ui: currentUi });
    } catch (err) {
      console.error("[UiSettingsSync] Ошибка сохранения настроек интерфейса в config/settings.json:", err);
    }
  }, delayMs);
}

/**
 * Применение параметров оформления ко всем DOM-элементам плеера.
 */
export function applyAllVisualSettings(): void {
  // Анимации
  const isAnimOff = localStorage.getItem("l-mpv-animations-enabled") === "false";
  document.documentElement.classList.toggle("no-animations", isAnimOff);

  // Тема
  applyPlayerTheme(getSavedPlayerTheme());

  // Радиусы
  const curRadius = getSavedUiRadius();
  applyUiRadius(curRadius.level, curRadius.value);

  // Масштабирование
  const curScale = getSavedUiScale();
  applyUiScale(curScale.mode, curScale.value);

  // Прозрачность
  applyUiOpacity(getSavedUiOpacity());

  // Шрифт
  applyUiFont(getSavedUiFont());

  // Акцентный цвет
  const savedAccent = localStorage.getItem("l-mpv-accent-color") || "#7fc7ff";
  if (savedAccent === "windows") {
    invoke<string>("get_windows_accent_color")
      .then((winHex) => {
        localStorage.setItem("l-mpv-accent-color-windows", winHex);
        applyAccentColor(winHex);
      })
      .catch(() => {
        applyAccentColor("#7fc7ff");
      });
  } else {
    applyAccentColor(savedAccent);
  }
}

/**
 * Гидратация визуальных настроек из config/settings.json при холодном запуске приложения.
 * Если в файле конфигурации уже сохранены параметры, они восстанавливаются в localStorage
 * и немедленно активируются в DOM.
 */
export async function hydrateUiSettingsFromDisk(): Promise<void> {
  isHydrating = true;
  try {
    const ui = await invoke<UiSettings>("get_ui_settings");
    let hasRestoredValues = false;

    if (ui) {
      if (ui.player_theme) {
        savePlayerTheme(ui.player_theme);
        hasRestoredValues = true;
      }
      if (ui.ui_font) {
        saveUiFont(ui.ui_font as UiFontId);
        hasRestoredValues = true;
      }
      if (ui.accent_color) {
        localStorage.setItem("l-mpv-accent-color", ui.accent_color);
        hasRestoredValues = true;
      }
      if (ui.glow_intensity) {
        saveGlowIntensity(ui.glow_intensity as any);
        hasRestoredValues = true;
      }
      if (typeof ui.ui_opacity === "number") {
        saveUiOpacity(ui.ui_opacity);
        hasRestoredValues = true;
      }
      if (ui.ui_radius_level) {
        saveUiRadius(ui.ui_radius_level as UiRadiusLevel, ui.ui_radius_value);
        hasRestoredValues = true;
      }
      if (ui.ui_scale_mode) {
        saveUiScale(ui.ui_scale_mode as UiScaleMode, ui.ui_scale_value);
        hasRestoredValues = true;
      }
      if (ui.control_bar_style) {
        saveControlBarStyle(ui.control_bar_style as ControlBarStyle);
        hasRestoredValues = true;
      }
      if (ui.time_position) {
        saveTimePosition(ui.time_position as TimeDisplayPosition);
        hasRestoredValues = true;
      }
      if (ui.time_format) {
        saveTimeFormat(ui.time_format as TimeFormatMode);
        hasRestoredValues = true;
      }
      if (typeof ui.animations_enabled === "boolean") {
        localStorage.setItem(
          "l-mpv-animations-enabled",
          ui.animations_enabled ? "true" : "false"
        );
        document.documentElement.setAttribute(
          "data-animations",
          ui.animations_enabled ? "on" : "off"
        );
        hasRestoredValues = true;
      }
      if (typeof ui.show_track_names === "boolean") {
        localStorage.setItem(
          "l-mpv-show-track-names",
          ui.show_track_names ? "true" : "false"
        );
        hasRestoredValues = true;
      }
      if (typeof ui.playlist_width === "number" && ui.playlist_width >= 360) {
        localStorage.setItem("l-mpv-playlist-width", ui.playlist_width.toString());
        hasRestoredValues = true;
      }
      if (ui.custom_colors && Array.isArray(ui.custom_colors)) {
        saveCustomColors(ui.custom_colors);
        hasRestoredValues = true;
      }
      if (ui.visible_buttons && typeof ui.visible_buttons === "object") {
        localStorage.setItem("l-mpv-visible-buttons", JSON.stringify(ui.visible_buttons));
        hasRestoredValues = true;
      }
      if (ui.custom_hotkeys && typeof ui.custom_hotkeys === "object") {
        saveCustomHotkeys(ui.custom_hotkeys);
        hasRestoredValues = true;
      }
    }

    // Применяем восстановленные настройки к DOM
    applyAllVisualSettings();

    // Если в settings.json ещё не было сохранённых настроек (например, первый запуск после обновления),
    // персистируем текущие стартовые параметры в config/settings.json
    if (!hasRestoredValues) {
      isHydrating = false;
      syncUiSettingsToDisk(100);
      return;
    }
  } catch (err) {
    console.error("[UiSettingsSync] Ошибка гидратации визуальных настроек с диска:", err);
  } finally {
    isHydrating = false;
  }
}

/**
 * Инициализация автоматической синхронизации параметров интерфейса с диском.
 * Отслеживает пользовательские события изменения темы, цвета, масштаба и т.д.
 */
export function initUiSettingsAutoSync(): () => void {
  const handleSettingsChanged = () => {
    syncUiSettingsToDisk(400);
  };

  const events = [
    "l-mpv-settings-changed",
    "l-mpv-player-theme-changed",
    "l-mpv-ui-scale-changed",
    "l-mpv-accent-color-changed",
    "l-mpv-glow-intensity-changed",
    "l-mpv-ui-opacity-changed",
    "l-mpv-ui-radius-changed",
    "l-mpv-ui-font-changed",
    "l-mpv-control-bar-style-changed",
    "l-mpv-time-position-changed",
    "l-mpv-time-format-changed",
  ];

  events.forEach((evt) => window.addEventListener(evt, handleSettingsChanged));
  window.addEventListener("storage", handleSettingsChanged);

  return () => {
    events.forEach((evt) => window.removeEventListener(evt, handleSettingsChanged));
    window.removeEventListener("storage", handleSettingsChanged);
  };
}
