/**
 * Модуль двусторонней синхронизации визуальных настроек L-MPV с портативным файлом config/settings.json.
 * 
 * Обеспечивает персистентность пользовательского оформления (тема, шрифт, цвета, масштаб,
 * скругления, прозрачность, горячие клавиши и ширина плейлиста) независимо от состояния
 * локального кэша WebView2 и при переносе портативной папки плеера.
 */

import { invoke } from "@tauri-apps/api/core";
import { applyAnimationsFlagToDom } from "./animationUtils";
import {
  getSavedPlayerTheme,
  savePlayerTheme,
  getGlowIntensity,
  saveGlowIntensity,
  getCustomColors,
  saveCustomColors,
  applyAccentColor,
  applyPlayerTheme,
  type GlowIntensity,
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
  initActiveCustomFont,
  getSavedUiSettingsStyle,
  saveUiSettingsStyle,
  UiSettingsStyle,
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
import { getSavedLocale, saveLocale, type Locale } from "../i18n/index";

export interface StoredVisualizerSettings {
  enabled: boolean;
  placement: string;
  mode: string;
  theme: string;
  height: number;
}

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
  language?: string;
  settings_style?: string;
  hide_controls_in_upper_half?: boolean;
  hotload_enabled?: boolean;
  save_tracks_to_video_dir?: boolean;
  skip_opening_seconds?: number;
  visualizer_config?: StoredVisualizerSettings;
}

const UI_SYNC_PENDING_KEY = "l-mpv-ui-sync-pending";

let isHydrating = false;
let hydrationBlocked = false;
let hydrationRetryTimer: ReturnType<typeof setTimeout> | null = null;
let isApplyingHydration = false;
let pendingHydrationSnapshot: UiSettings | null = null;
let pendingDiskSnapshot: UiSettings | null = null;
let syncWriteInFlight: Promise<void> | null = null;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncRetryTimer: ReturnType<typeof setTimeout> | null = null;
let syncRetryDelay = 500;

function markUiSyncPending(): void {
  try {
    localStorage.setItem(UI_SYNC_PENDING_KEY, "true");
  } catch {}
}

function scheduleSyncRetry(): void {
  if (syncRetryTimer !== null || !pendingDiskSnapshot) return;
  syncRetryTimer = setTimeout(() => {
    syncRetryTimer = null;
    void flushUiSettingsQueue();
  }, syncRetryDelay);
  syncRetryDelay = Math.min(syncRetryDelay * 2, 30000);
}

async function flushUiSettingsQueue(): Promise<void> {
  if (syncWriteInFlight || !pendingDiskSnapshot) return;
  if (syncRetryTimer !== null) {
    clearTimeout(syncRetryTimer);
    syncRetryTimer = null;
  }
  const snapshot = pendingDiskSnapshot;
  pendingDiskSnapshot = null;
  let retryQueued = false;
  const request = invoke<void>("save_ui_settings", { ui: snapshot })
    .then(() => {
      syncRetryDelay = 500;
      if (!pendingDiskSnapshot && syncDebounceTimer === null) {
        try {
          localStorage.removeItem(UI_SYNC_PENDING_KEY);
        } catch {}
      }
    })
    .catch((error) => {
      console.error("[UiSettingsSync] Ошибка сохранения настроек интерфейса в config/settings.json:", error);
      if (!pendingDiskSnapshot) {
        pendingDiskSnapshot = snapshot;
        retryQueued = true;
      }
      scheduleSyncRetry();
    })
    .finally(() => {
      syncWriteInFlight = null;
      if (pendingDiskSnapshot && !retryQueued) void flushUiSettingsQueue();
    });
  syncWriteInFlight = request;
  await request;
}

function queueUiSettingsSnapshot(snapshot: UiSettings): void {
  pendingDiskSnapshot = snapshot;
  markUiSyncPending();
  if (syncRetryTimer !== null) {
    clearTimeout(syncRetryTimer);
    syncRetryTimer = null;
  }
  syncRetryDelay = 500;
  void flushUiSettingsQueue();
}

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

  let visualizerConfig: StoredVisualizerSettings | undefined;
  try {
    const rawVisualizer = localStorage.getItem("l-mpv-visualizer-settings");
    if (rawVisualizer) {
      const parsed = JSON.parse(rawVisualizer) as Partial<StoredVisualizerSettings>;
      const placements = ["above_timeline", "toolbar", "inside_timeline", "off"];
      const modes = ["waveform", "spectrum", "bars", "matrix", "ribbon", "particles", "circular", "blob", "strings"];
      const themes = ["accent", "pastel", "neon", "sunset", "aurora", "ocean", "crimson", "mint", "violet", "gold"];
      const height = Number(parsed.height);
      visualizerConfig = {
        enabled: parsed.enabled === true,
        placement: placements.includes(parsed.placement || "") ? parsed.placement! : "above_timeline",
        mode: modes.includes(parsed.mode || "") ? parsed.mode! : "waveform",
        theme: themes.includes(parsed.theme || "") ? parsed.theme! : "accent",
        height: Number.isFinite(height) ? Math.min(80, Math.max(8, Math.round(height))) : 22,
      };
    }
  } catch (error) {
    console.error("[UiSettingsSync] Ошибка чтения визуализатора:", error);
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
    language: getSavedLocale(),
    settings_style: getSavedUiSettingsStyle(),
    hide_controls_in_upper_half: localStorage.getItem("l-mpv-hide-controls-upper-half") === "true",
    hotload_enabled: localStorage.getItem("l-mpv-hotload-enabled") === "true",
    save_tracks_to_video_dir: localStorage.getItem("l-mpv-save-tracks-to-video-dir") !== "false",
    skip_opening_seconds: Math.min(600, Math.max(1, Number(localStorage.getItem("l-mpv-skip-opening-seconds")) || 90)),
    visualizer_config: visualizerConfig,
  };
}

/**
 * Асинхронное сохранение параметров интерфейса в config/settings.json с дебаунсом.
 * Предотвращает частые дисковые операции при плавном перемещении ползунков.
 */
export function syncUiSettingsToDisk(delayMs = 400): void {
  if (!isApplyingHydration) markUiSyncPending();
  if (isHydrating || hydrationBlocked) {
    if (!isApplyingHydration) {
      pendingHydrationSnapshot = collectCurrentUiSettings();
    }
    return;
  }

  if (syncDebounceTimer !== null) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    queueUiSettingsSnapshot(collectCurrentUiSettings());
  }, delayMs);
}

/**
 * Применение параметров оформления ко всем DOM-элементам плеера.
 */
export function applyAllVisualSettings(): void {
  // Анимации — единый источник правды (класс + data-атрибут + localStorage)
  applyAnimationsFlagToDom();

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
  initActiveCustomFont().catch(() => {});

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

function applyUiSettingsSnapshot(ui: UiSettings): boolean {
  let restored = false;
  if (ui.player_theme) {
    savePlayerTheme(ui.player_theme);
    restored = true;
  }
  if (ui.ui_font) {
    saveUiFont(ui.ui_font as UiFontId);
    restored = true;
  }
  if (ui.accent_color) {
    localStorage.setItem("l-mpv-accent-color", ui.accent_color);
    restored = true;
  }
  if (ui.glow_intensity && ["off", "soft", "medium", "intense"].includes(ui.glow_intensity)) {
    saveGlowIntensity(ui.glow_intensity as GlowIntensity);
    restored = true;
  }
  if (typeof ui.ui_opacity === "number") {
    saveUiOpacity(ui.ui_opacity);
    restored = true;
  }
  if (ui.ui_radius_level) {
    saveUiRadius(ui.ui_radius_level as UiRadiusLevel, ui.ui_radius_value);
    restored = true;
  }
  if (ui.ui_scale_mode) {
    saveUiScale(ui.ui_scale_mode as UiScaleMode, ui.ui_scale_value);
    restored = true;
  }
  if (ui.control_bar_style) {
    saveControlBarStyle(ui.control_bar_style as ControlBarStyle);
    restored = true;
  }
  if (ui.time_position) {
    saveTimePosition(ui.time_position as TimeDisplayPosition);
    restored = true;
  }
  if (ui.time_format) {
    saveTimeFormat(ui.time_format as TimeFormatMode);
    restored = true;
  }
  if (typeof ui.animations_enabled === "boolean") {
    localStorage.setItem("l-mpv-animations-enabled", ui.animations_enabled ? "true" : "false");
    restored = true;
  }
  if (typeof ui.show_track_names === "boolean") {
    localStorage.setItem("l-mpv-show-track-names", ui.show_track_names ? "true" : "false");
    restored = true;
  }
  if (typeof ui.playlist_width === "number" && ui.playlist_width >= 360) {
    localStorage.setItem("l-mpv-playlist-width", ui.playlist_width.toString());
    restored = true;
  }
  if (ui.custom_colors && Array.isArray(ui.custom_colors)) {
    saveCustomColors(ui.custom_colors);
    restored = true;
  }
  if (ui.visible_buttons && typeof ui.visible_buttons === "object") {
    localStorage.setItem("l-mpv-visible-buttons", JSON.stringify(ui.visible_buttons));
    restored = true;
  }
  if (ui.custom_hotkeys && typeof ui.custom_hotkeys === "object") {
    saveCustomHotkeys(ui.custom_hotkeys);
    restored = true;
  }
  if (ui.language === "ru" || ui.language === "en") {
    saveLocale(ui.language as Locale);
    restored = true;
  }
  if (ui.settings_style === "modal" || ui.settings_style === "sidebar") {
    saveUiSettingsStyle(ui.settings_style as UiSettingsStyle);
    restored = true;
  }
  if (typeof ui.hide_controls_in_upper_half === "boolean") {
    localStorage.setItem("l-mpv-hide-controls-upper-half", ui.hide_controls_in_upper_half ? "true" : "false");
    restored = true;
  }
  if (typeof ui.hotload_enabled === "boolean") {
    localStorage.setItem("l-mpv-hotload-enabled", ui.hotload_enabled ? "true" : "false");
    restored = true;
  }
  if (typeof ui.save_tracks_to_video_dir === "boolean") {
    localStorage.setItem("l-mpv-save-tracks-to-video-dir", ui.save_tracks_to_video_dir ? "true" : "false");
    restored = true;
  }
  if (typeof ui.skip_opening_seconds === "number" && Number.isFinite(ui.skip_opening_seconds)) {
    const skipSeconds = Math.min(600, Math.max(1, Math.round(ui.skip_opening_seconds)));
    localStorage.setItem("l-mpv-skip-opening-seconds", skipSeconds.toString());
    restored = true;
  }
  if (ui.visualizer_config && typeof ui.visualizer_config === "object") {
    const visualizer = ui.visualizer_config;
    const placements = ["above_timeline", "toolbar", "inside_timeline", "off"];
    const modes = ["waveform", "spectrum", "bars", "matrix", "ribbon", "particles", "circular", "blob", "strings"];
    const themes = ["accent", "pastel", "neon", "sunset", "aurora", "ocean", "crimson", "mint", "violet", "gold"];
    const height = Number(visualizer.height);
    localStorage.setItem("l-mpv-visualizer-settings", JSON.stringify({
      enabled: visualizer.enabled === true,
      placement: placements.includes(visualizer.placement) ? visualizer.placement : "above_timeline",
      mode: modes.includes(visualizer.mode) ? visualizer.mode : "waveform",
      theme: themes.includes(visualizer.theme) ? visualizer.theme : "accent",
      height: Number.isFinite(height) ? Math.min(80, Math.max(8, Math.round(height))) : 22,
    } satisfies StoredVisualizerSettings));
    restored = true;
  }
  return restored;
}

function scheduleHydrationRetry(): void {
  if (hydrationRetryTimer !== null) return;
  hydrationRetryTimer = setTimeout(() => {
    hydrationRetryTimer = null;
    void hydrateUiSettingsFromDisk();
  }, 2000);
}

/**
 * Гидратация визуальных настроек из config/settings.json при холодном запуске приложения.
 * Если в файле конфигурации уже сохранены параметры, они восстанавливаются в localStorage
 * и немедленно активируются в DOM.
 */
export async function hydrateUiSettingsFromDisk(): Promise<void> {
  if (isHydrating) return;
  isHydrating = true;
  isApplyingHydration = false;
  try {
    if (localStorage.getItem(UI_SYNC_PENDING_KEY) === "true") {
      pendingHydrationSnapshot = collectCurrentUiSettings();
    }
  } catch {}
  let restored = false;
  let hydrationSucceeded = false;
  let localSnapshot: UiSettings | null = null;

  try {
    const ui = await invoke<UiSettings>("get_ui_settings");
    hydrationSucceeded = true;
    isApplyingHydration = true;
    try {
      if (ui) restored = applyUiSettingsSnapshot(ui);
    } finally {
      isApplyingHydration = false;
    }
  } catch (error) {
    isApplyingHydration = false;
    console.error("[UiSettingsSync] Ошибка гидратации визуальных настроек с диска:", error);
  }

  localSnapshot = pendingHydrationSnapshot;
  pendingHydrationSnapshot = null;
  if (localSnapshot) {
    isApplyingHydration = true;
    try {
      applyUiSettingsSnapshot(localSnapshot);
    } catch (error) {
      console.error("[UiSettingsSync] Ошибка применения локального снимка во время гидратации:", error);
    } finally {
      isApplyingHydration = false;
    }
  }
  try {
    applyAllVisualSettings();
  } finally {
    isHydrating = false;
  }

  pendingHydrationSnapshot = null;
  if (!hydrationSucceeded) {
    hydrationBlocked = true;
    if (localSnapshot) pendingHydrationSnapshot = localSnapshot;
    scheduleHydrationRetry();
    return;
  }

  hydrationBlocked = false;
  if (hydrationRetryTimer !== null) {
    clearTimeout(hydrationRetryTimer);
    hydrationRetryTimer = null;
  }
  if (localSnapshot) {
    queueUiSettingsSnapshot(localSnapshot);
  } else if (!restored) {
    queueUiSettingsSnapshot(collectCurrentUiSettings());
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
    if (syncDebounceTimer !== null) {
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = null;
    }
    if (hydrationRetryTimer !== null) {
      clearTimeout(hydrationRetryTimer);
      hydrationRetryTimer = null;
    }
    if (syncRetryTimer !== null) {
      clearTimeout(syncRetryTimer);
      syncRetryTimer = null;
    }
  };
}
