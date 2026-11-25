import { saveAmbientSettings } from "./ambientPreviewQueue";
// ─── Утилиты управления пресетами настроек L-MPV ──────────────
// Данный модуль обеспечивает создание снимков текущих настроек,
// их портативное сохранение в config/presets.json и localStorage,
// а также мгновенное применение любых пресетов в рантайме.

import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { setAnimationsEnabled } from "./animationUtils";
import {
  applyAccentColor,
  GlowIntensity,
  getGlowIntensity,
  saveGlowIntensity,
  getCustomColors,
  saveCustomColors,
  PLAYER_THEMES,
  PlayerThemeId,
  getSavedPlayerTheme,
  savePlayerTheme,
} from "./colorUtils";
import {
  VisualizerConfig,
  getVisualizerConfig,
  saveVisualizerConfig,
} from "../components/player/AudioVisualizer";
import {
  HeatmapConfig,
  DEFAULT_HEATMAP_CONFIG,
  getHeatmapConfig,
  saveHeatmapConfig,
} from "../components/player/heatmap";
import { getCustomHotkeys, saveCustomHotkeys } from "./hotkeyUtils";
import {
  UiRadiusLevel,
  getSavedUiRadius,
  saveUiRadius,
  UiScaleMode,
  getSavedUiScale,
  saveUiScale,
  saveUiOpacity,
  UiFontId,
  getSavedUiFont,
  saveUiFont,
  getSavedUiSettingsStyle,
  saveUiSettingsStyle,
  UiSettingsStyle,
} from "./uiThemeUtils";
import {
  TimeDisplayPosition,
  getSavedTimePosition,
  saveTimePosition,
} from "./timePositionUtils";
import {
  TimeFormatMode,
  getSavedTimeFormat,
  saveTimeFormat,
} from "./timeFormatUtils";
import {
  ControlBarStyle,
  getSavedControlBarStyle,
  saveControlBarStyle,
} from "./controlBarStyleUtils";
import {
  DEFAULT_GLASS_BLUR,
  DEFAULT_GLASS_REFRACTION,
  DEFAULT_GLASS_TINT,
  MAX_GLASS_REFRACTION,
  getGlassBlur,
  getGlassRefraction,
  getGlassTint,
  getPlayerTheme,
  saveGlassBlur,
  saveGlassRefraction,
  saveGlassTint,
  setPlayerTheme,
  type GlassTintId,
  type PlayerTheme,
} from "../features/liquidGlass/preferences";
import {
  type UtilityButtonId,
  getSavedUtilityCards,
  saveUtilityCards,
  normalizeUtilityCards,
  UTILITY_CARDS_CHANGED_EVENT,
} from "./controlBarUtilityLayout";
import type { AmbientPresetSettings } from "./ambientSettingsUtils";
import { normalizeAmbientSettings } from "./ambientSettingsUtils";
import { getEffectiveLocale, saveLocale, type Locale } from "../i18n/index";
import {
  getSavedSeekStepSeconds,
  getSavedSkipOpeningSeconds,
  saveSeekStepSeconds,
  saveSkipOpeningSeconds,
} from "./seekUtils";
import { getUserPresetsCache, setUserPresetsCache, userPresetsCacheRevision } from "./userPresetsCache";

export interface SettingsPresetData {
  /** Режим оформления интерфейса плеера (L-MPV или Liquid Glass) */
  playerInterfaceTheme?: PlayerTheme;
  /** Тема оформления плеера (расцветка фона и поверхностей) */
  playerTheme?: PlayerThemeId | string;
  /** Стиль панели управления в теме Liquid Glass */
  liquidGlassStyle?: ControlBarStyle;
  /** Интенсивность размытия Liquid Glass (0 - 100) */
  liquidGlassBlur?: number;
  /** Степень оптического преломления Liquid Glass (0 - 10) */
  liquidGlassRefraction?: number;
  /** Оттенок стекла в Liquid Glass ("transparent" или ID темы плеера) */
  liquidGlassTint?: GlassTintId;
  /** Стиль окна настроек (модальное окно или боковая панель) */
  settingsStyle?: UiSettingsStyle;
  /** Язык интерфейса (ru или en) */
  language?: Locale;
  /** Семейство шрифта интерфейса */
  uiFont?: UiFontId | string;
  /** Положение отображения времени воспроизведения видео */
  timePosition?: TimeDisplayPosition;
  /** Формат отображения времени (прошедшее/общее, оставшееся, расчет окончания) */
  timeFormat?: TimeFormatMode;
  /** Стиль панели управления (парящий остров или пристыкованная плашка) */
  controlBarStyle?: ControlBarStyle;
  /** Акцентный цвет (HEX или "windows") */
  accentColor: string;
  /** Интенсивность неонового свечения */
  glowIntensity: GlowIntensity;
  /** Прозрачность интерфейса (0.2 - 1.0) */
  uiOpacity: number;
  /** Уровень скругления интерфейса */
  uiRadius?: UiRadiusLevel | { level: UiRadiusLevel; value?: number };
  /** Масштаб интерфейса */
  uiScale?: {
    mode: UiScaleMode;
    value?: number;
  };
  /** Включение плавных пружинящих анимаций */
  animationsEnabled: boolean;
  /** Отображение названий аудио- и субтитров на панели */
  showTrackNames: boolean;
  /** Карта видимости кнопок нижней панели управления */
  visibleButtons: Record<string, boolean>;
  /** Распределение и порядок кнопок утилит по карточкам */
  utilityButtonCards?: UtilityButtonId[][];
  /** Пользовательская сохранённая палитра цветов */
  customColors?: string[];
  /** Параметры подсветки полос (Blur) */
  ambient: AmbientPresetSettings;
  /** Конфигурация аудио-визуализатора */
  visualizer: VisualizerConfig;
  /** Конфигурация тепловой карты таймлайна */
  heatmap?: HeatmapConfig;
  /** Сохранять извлечённые дорожки в папку с видео */
  saveTracksToVideoDir: boolean;
  /** Автоподхват внешних дорожек при перетаскивании */
  hotloadEnabled: boolean;
  /** Количество секунд пропуска опенинга */
  skipOpeningSeconds: number;
  /** Количество секунд шага перемотки (стрелки / кнопки) */
  seekStepSeconds?: number;
  /** Пользовательские горячие клавиши */
  customHotkeys?: Record<string, string[]>;
}

export interface SettingsPreset {
  /** Уникальный идентификатор пресета */
  id: string;
  /** Отображаемое название пресета */
  name: string;
  /** Описание стиля пресета */
  description?: string;
  /** Timestamp времени создания */
  createdAt: number;
  /** Timestamp времени последнего изменения */
  updatedAt?: number;
  /** Флаг встроенного системного пресета */
  isBuiltIn?: boolean;
  /** Данные настроек */
  data: SettingsPresetData;
}

const PRESETS_STORAGE_KEY = "l-mpv-settings-presets";

const BUILTIN_DEFAULT_CARDS: UtilityButtonId[][] = [
  [
    "speed",
    "skipOpening",
    "alwaysOnTop",
    "info",
    "mediaInfo",
    "visualizer",
    "playlist",
    "screenshot",
  ],
  ["fullscreen"],
];

/**
 * Встроенные заводские пресеты для быстрого выбора визуального стиля.
 */
// Explicit geometry and a disabled heatmap make each style independent of the previous preset.
export const BUILT_IN_PRESETS: SettingsPreset[] = [
  {
    id: "builtin_classic",
    name: "Классический L-MPV",
    description: "Тёмный графит, небесный акцент и плавающая панель Classic",
    createdAt: 1700000000000,
    isBuiltIn: true,
    data: {
      playerInterfaceTheme: "lmpv",
      playerTheme: "graphite",
      uiFont: "inter",
      accentColor: "#7fc7ff",
      glowIntensity: "soft",
      uiOpacity: 0.92,
      controlBarStyle: "modern",
      uiRadius: "default",
      settingsStyle: "modal",
      uiScale: { mode: "auto" },
      timePosition: "timeline_right",
      timeFormat: "elapsed_total",
      heatmap: { ...DEFAULT_HEATMAP_CONFIG, enabled: false },
      animationsEnabled: true,
      showTrackNames: true,
      visibleButtons: {
        repeat: false,
        shuffle: false,
        alwaysOnTop: true,
        info: false,
        mediaInfo: false,
        visualizer: true,
        screenshot: true,
        playlist: true,
        fullscreen: true,
        skipOpening: true,
        speed: false,
        seekButtons: true,
      },
      utilityButtonCards: BUILTIN_DEFAULT_CARDS.map((card) => [...card]),
      ambient: {
        mode: "blur",
        blur_radius: 35,
      },
      visualizer: {
        enabled: true,
        placement: "above_timeline",
        mode: "waveform",
        theme: "accent",
        height: 22,
      },
      saveTracksToVideoDir: true,
      hotloadEnabled: false,
      skipOpeningSeconds: 90,
      seekStepSeconds: 10,
    },
  },
  {
    id: "builtin_cyberpunk",
    name: "Сумеречный ирис",
    description: "Чернильный индиго, розовый акцент и капсулы со спектром в тон",
    createdAt: 1700000000001,
    isBuiltIn: true,
    data: {
      playerInterfaceTheme: "lmpv",
      playerTheme: "indigo",
      uiFont: "outfit",
      accentColor: "#f9a8d4",
      glowIntensity: "soft",
      uiOpacity: 0.94,
      controlBarStyle: "capsule",
      uiRadius: "pill",
      settingsStyle: "modal",
      uiScale: { mode: "auto" },
      timePosition: "timeline_right",
      timeFormat: "elapsed_total",
      heatmap: { ...DEFAULT_HEATMAP_CONFIG, enabled: false },
      animationsEnabled: true,
      showTrackNames: true,
      visibleButtons: {
        repeat: true,
        shuffle: false,
        alwaysOnTop: true,
        info: false,
        mediaInfo: true,
        visualizer: true,
        screenshot: true,
        playlist: true,
        fullscreen: true,
        skipOpening: true,
        speed: false,
        seekButtons: true,
      },
      utilityButtonCards: BUILTIN_DEFAULT_CARDS.map((card) => [...card]),
      ambient: {
        mode: "off",
        blur_radius: 50,
      },
      visualizer: {
        enabled: true,
        placement: "toolbar",
        mode: "bars",
        theme: "accent",
        height: 26,
      },
      saveTracksToVideoDir: true,
      hotloadEnabled: false,
      skipOpeningSeconds: 90,
      seekStepSeconds: 10,
    },
  },
  {
    id: "builtin_cinema",
    name: "Ночной кинозал",
    description: "Глубокий OLED, янтарные детали и спокойная классическая панель",
    createdAt: 1700000000002,
    isBuiltIn: true,
    data: {
      playerInterfaceTheme: "lmpv",
      playerTheme: "oled",
      uiFont: "jakarta",
      accentColor: "#e8a236",
      glowIntensity: "off",
      uiOpacity: 0.96,
      controlBarStyle: "docked",
      uiRadius: "default",
      settingsStyle: "modal",
      uiScale: { mode: "auto" },
      timePosition: "timeline_right",
      timeFormat: "elapsed_total",
      heatmap: { ...DEFAULT_HEATMAP_CONFIG, enabled: false },
      animationsEnabled: true,
      showTrackNames: false,
      visibleButtons: {
        repeat: true,
        shuffle: false,
        alwaysOnTop: true,
        info: false,
        mediaInfo: false,
        visualizer: false,
        screenshot: true,
        playlist: true,
        fullscreen: true,
        skipOpening: false,
        speed: false,
        seekButtons: true,
      },
      utilityButtonCards: BUILTIN_DEFAULT_CARDS.map((card) => [...card]),
      ambient: {
        mode: "blur",
        blur_radius: 65,
      },
      visualizer: {
        enabled: false,
        placement: "off",
        mode: "waveform",
        theme: "sunset",
        height: 20,
      },
      saveTracksToVideoDir: true,
      hotloadEnabled: false,
      skipOpeningSeconds: 90,
      seekStepSeconds: 10,
    },
  },
  {
    id: "builtin_minimal",
    name: "Тихий титан",
    description: "Тёплый минеральный серый, серебряный акцент и строгая геометрия",
    createdAt: 1700000000003,
    isBuiltIn: true,
    data: {
      playerInterfaceTheme: "lmpv",
      playerTheme: "slate",
      uiFont: "inter",
      accentColor: "#c3c8d0",
      glowIntensity: "off",
      uiOpacity: 1.0,
      controlBarStyle: "docked",
      uiRadius: "minimal",
      settingsStyle: "sidebar",
      uiScale: { mode: "auto" },
      timePosition: "timeline_right",
      timeFormat: "elapsed_total",
      heatmap: { ...DEFAULT_HEATMAP_CONFIG, enabled: false },
      animationsEnabled: true,
      showTrackNames: false,
      visibleButtons: {
        repeat: true,
        shuffle: false,
        alwaysOnTop: true,
        info: false,
        mediaInfo: false,
        visualizer: false,
        screenshot: false,
        playlist: true,
        fullscreen: true,
        skipOpening: false,
        speed: false,
        seekButtons: true,
      },
      utilityButtonCards: BUILTIN_DEFAULT_CARDS.map((card) => [...card]),
      ambient: {
        mode: "off",
        blur_radius: 20,
      },
      visualizer: {
        enabled: false,
        placement: "off",
        mode: "waveform",
        theme: "accent",
        height: 20,
      },
      saveTracksToVideoDir: true,
      hotloadEnabled: false,
      skipOpeningSeconds: 90,
      seekStepSeconds: 10,
    },
  },
  {
    id: "builtin_forest",
    name: "Лесной нефрит",
    description: "Лесной шалфей, мятный нефритовый акцент и мягкие парящие капсулы",
    createdAt: 1700000000004,
    isBuiltIn: true,
    data: {
      playerInterfaceTheme: "lmpv",
      playerTheme: "pine",
      uiFont: "manrope",
      accentColor: "#a7f3d0",
      glowIntensity: "off",
      uiOpacity: 0.90,
      controlBarStyle: "capsule",
      uiRadius: "pill",
      settingsStyle: "modal",
      uiScale: { mode: "auto" },
      timePosition: "timeline_right",
      timeFormat: "elapsed_total",
      heatmap: { ...DEFAULT_HEATMAP_CONFIG, enabled: false },
      animationsEnabled: true,
      showTrackNames: true,
      visibleButtons: {
        repeat: false,
        shuffle: false,
        alwaysOnTop: true,
        info: false,
        mediaInfo: false,
        visualizer: true,
        screenshot: true,
        playlist: true,
        fullscreen: true,
        skipOpening: true,
        speed: false,
        seekButtons: true,
      },
      utilityButtonCards: BUILTIN_DEFAULT_CARDS.map((card) => [...card]),
      ambient: {
        mode: "off",
        blur_radius: 35,
      },
      visualizer: {
        enabled: true,
        placement: "toolbar",
        mode: "waveform",
        theme: "accent",
        height: 22,
      },
      saveTracksToVideoDir: true,
      hotloadEnabled: false,
      skipOpeningSeconds: 90,
      seekStepSeconds: 10,
    },
  },
  {
    id: "builtin_liquid_glass",
    name: "Жидкое стекло",
    description: "Кристально прозрачное стекло Liquid Glass, капсулы с преломлением и мягкий небесный акцент",
    createdAt: 1700000000005,
    isBuiltIn: true,
    data: {
      playerInterfaceTheme: "glass",
      liquidGlassStyle: "capsule",
      liquidGlassBlur: 90,
      liquidGlassRefraction: DEFAULT_GLASS_REFRACTION,
      liquidGlassTint: "transparent",
      uiFont: "inter",
      accentColor: "#7fc7ff",
      glowIntensity: "soft",
      uiOpacity: 0.92,
      controlBarStyle: "capsule",
      uiRadius: "pill",
      settingsStyle: "modal",
      uiScale: { mode: "auto" },
      timePosition: "timeline_right",
      timeFormat: "elapsed_total",
      heatmap: { ...DEFAULT_HEATMAP_CONFIG, enabled: false },
      animationsEnabled: true,
      showTrackNames: true,
      visibleButtons: {
        repeat: false,
        shuffle: false,
        alwaysOnTop: true,
        info: false,
        mediaInfo: false,
        visualizer: false,
        screenshot: true,
        playlist: true,
        fullscreen: true,
        skipOpening: true,
        speed: false,
        seekButtons: true,
      },
      utilityButtonCards: BUILTIN_DEFAULT_CARDS.map((card) => [...card]),
      ambient: {
        mode: "off",
        blur_radius: 35,
      },
      visualizer: {
        enabled: false,
        placement: "off",
        mode: "waveform",
        theme: "accent",
        height: 22,
      },
      saveTracksToVideoDir: true,
      hotloadEnabled: false,
      skipOpeningSeconds: 90,
      seekStepSeconds: 10,
    },
  },
  {
    id: "builtin_sapphire_glass",
    name: "Сапфировый кристалл",
    description: "Сапфировое тонированное стекло Liquid Glass, парящая классика и ледяной бирюзовый акцент",
    createdAt: 1700000000006,
    isBuiltIn: true,
    data: {
      playerInterfaceTheme: "glass",
      liquidGlassStyle: "modern",
      liquidGlassBlur: 85,
      liquidGlassRefraction: DEFAULT_GLASS_REFRACTION,
      liquidGlassTint: "sapphire",
      uiFont: "jakarta",
      accentColor: "#5eead4",
      glowIntensity: "soft",
      uiOpacity: 0.92,
      controlBarStyle: "modern",
      uiRadius: "default",
      settingsStyle: "modal",
      uiScale: { mode: "auto" },
      timePosition: "timeline_right",
      timeFormat: "elapsed_total",
      heatmap: { ...DEFAULT_HEATMAP_CONFIG, enabled: false },
      animationsEnabled: true,
      showTrackNames: true,
      visibleButtons: {
        repeat: false,
        shuffle: false,
        alwaysOnTop: true,
        info: false,
        mediaInfo: true,
        visualizer: false,
        screenshot: true,
        playlist: true,
        fullscreen: true,
        skipOpening: true,
        speed: false,
        seekButtons: true,
      },
      utilityButtonCards: BUILTIN_DEFAULT_CARDS.map((card) => [...card]),
      ambient: {
        mode: "off",
        blur_radius: 35,
      },
      visualizer: {
        enabled: false,
        placement: "off",
        mode: "waveform",
        theme: "accent",
        height: 22,
      },
      saveTracksToVideoDir: true,
      hotloadEnabled: false,
      skipOpeningSeconds: 90,
      seekStepSeconds: 10,
    },
  },
];

/**
 * Создание снимка текущих настроек плеера в виде объекта пресета.
 */
export async function captureCurrentSettings(name: string): Promise<SettingsPreset> {
  const accentColor = localStorage.getItem("l-mpv-accent-color") || "#7fc7ff";
  const glowIntensity = getGlowIntensity();
  const uiOpacity = Number(localStorage.getItem("l-mpv-ui-opacity") || 0.88);
  const animationsEnabled = localStorage.getItem("l-mpv-animations-enabled") !== "false";
  const showTrackNames = localStorage.getItem("l-mpv-show-track-names") !== "false";

  let visibleButtons: Record<string, boolean> = {
    repeat: false,
    shuffle: false,
    alwaysOnTop: true,
    info: false,
    mediaInfo: false,
    visualizer: false,
    screenshot: true,
    playlist: true,
    fullscreen: true,
    skipOpening: true,
    speed: false,
    seekButtons: true,
  };
  try {
    const rawBtns = localStorage.getItem("l-mpv-visible-buttons");
    if (rawBtns) {
      visibleButtons = { ...visibleButtons, ...JSON.parse(rawBtns) };
    }
  } catch (e) {
    console.error("Ошибка чтения кнопок:", e);
  }

  const customColors = getCustomColors();

  let ambient: AmbientPresetSettings = {
    mode: "off",
    blur_radius: 35,
  };
  try {
    const savedAmbient = await invoke<unknown>("get_ambient_settings");
    if (savedAmbient) {
      ambient = normalizeAmbientSettings(savedAmbient);
    }
  } catch (e) {
    console.error("Ошибка получения настроек Blur:", e);
  }

  const visualizer = getVisualizerConfig();
  const heatmap = getHeatmapConfig();
  const saveTracksToVideoDir = localStorage.getItem("l-mpv-save-tracks-to-video-dir") !== "false";
  const hotloadEnabled = localStorage.getItem("l-mpv-hotload-enabled") === "true";
  const skipOpeningSeconds = getSavedSkipOpeningSeconds();
  const seekStepSeconds = getSavedSeekStepSeconds();
  const customHotkeys = getCustomHotkeys();
  const uiRadius = getSavedUiRadius();
  const uiScale = getSavedUiScale();
  const uiFont = getSavedUiFont();
  const playerTheme = getSavedPlayerTheme();
  const playerInterfaceTheme = getPlayerTheme();
  const lmpvControlBarStyle = getSavedControlBarStyle("lmpv");
  const liquidGlassStyle = getSavedControlBarStyle("glass");
  const liquidGlassBlur = getGlassBlur();
  const liquidGlassRefraction = getGlassRefraction();
  const liquidGlassTint = getGlassTint();

  return {
    id: `preset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim() || "Пользовательский пресет",
    createdAt: Date.now(),
    isBuiltIn: false,
    data: {
       playerInterfaceTheme,
       playerTheme,
       liquidGlassStyle,
       liquidGlassBlur,
       liquidGlassRefraction,
       liquidGlassTint,
       settingsStyle: getSavedUiSettingsStyle(),
       language: getEffectiveLocale(),
       uiFont,
      timePosition: getSavedTimePosition(),
      timeFormat: getSavedTimeFormat(),
      controlBarStyle: playerInterfaceTheme === "glass" ? liquidGlassStyle : lmpvControlBarStyle,
      accentColor,
      glowIntensity,
      uiOpacity,
      uiRadius,
      uiScale,
      animationsEnabled,
      showTrackNames,
      visibleButtons,
      utilityButtonCards: getSavedUtilityCards(),
      customColors,
      ambient,
      visualizer,
      heatmap,
      saveTracksToVideoDir,
      hotloadEnabled,
      skipOpeningSeconds,
      seekStepSeconds,
      customHotkeys,
    },
  };
}

/**
 * Мгновенное применение всех параметров выбранного пресета.
 */
export async function applySettingsPreset(preset: SettingsPreset): Promise<void> {
  const { data } = preset;

  if (data.ambient) {
    const ambient = normalizeAmbientSettings(data.ambient);
    await saveAmbientSettings(ambient);
    window.dispatchEvent(new CustomEvent("l-mpv-ambient-changed", { detail: ambient }));
  }

  // 0. Главный режим интерфейса (L-MPV или Liquid Glass) и параметры стекла
  const targetInterfaceTheme: PlayerTheme =
    data.playerInterfaceTheme === "glass" || data.playerInterfaceTheme === "lmpv"
      ? data.playerInterfaceTheme
      : getPlayerTheme();
  if (data.playerInterfaceTheme === "glass" || data.playerInterfaceTheme === "lmpv") {
    setPlayerTheme(data.playerInterfaceTheme);
    window.dispatchEvent(
      new CustomEvent("l-mpv-player-theme-changed", {
        detail: data.playerInterfaceTheme,
      }),
    );
  }
  if (typeof data.liquidGlassBlur === "number") {
    saveGlassBlur(data.liquidGlassBlur);
  }
  if (typeof data.liquidGlassRefraction === "number") {
    saveGlassRefraction(data.liquidGlassRefraction);
  }
  if (data.liquidGlassTint) {
    saveGlassTint(data.liquidGlassTint);
  }

  // 0.1. Тема оформления плеера (расцветка фона и поверхностей L-MPV)
  if (data.playerTheme) {
    savePlayerTheme(data.playerTheme);
  }

  // 1. Акцентный цвет
  if (data.accentColor) {
    if (data.accentColor === "windows") {
      try {
        const winHex = await invoke<string>("get_windows_accent_color");
        localStorage.setItem("l-mpv-accent-color-windows", winHex);
        applyAccentColor(winHex);
      } catch {
        applyAccentColor("#7fc7ff");
      }
      localStorage.setItem("l-mpv-accent-color", "windows");
    } else {
      applyAccentColor(data.accentColor);
      localStorage.setItem("l-mpv-accent-color", data.accentColor);
    }
  }

  // 2. Интенсивность свечения
  if (data.glowIntensity) {
    saveGlowIntensity(data.glowIntensity);
  }

  // 3. Прозрачность UI
  if (typeof data.uiOpacity === "number") {
    saveUiOpacity(data.uiOpacity);
  }


  // 3.1 Скругление интерфейса
  if (data.uiRadius) {
    if (typeof data.uiRadius === "string") {
      saveUiRadius(data.uiRadius);
    } else {
      saveUiRadius(data.uiRadius.level, data.uiRadius.value);
    }
  }

  // 3.2 Масштаб интерфейса
  if (data.uiScale) {
    saveUiScale(data.uiScale.mode, data.uiScale.value);
  }

  // 3.3 Шрифт интерфейса
  if (data.uiFont) {
    saveUiFont(data.uiFont as UiFontId);
  }

  // 3.4 Положение времени воспроизведения
  if (data.timePosition) {
    saveTimePosition(data.timePosition);
  }

  // 3.5 Формат времени воспроизведения
  if (data.timeFormat) {
    saveTimeFormat(data.timeFormat);
  }

  // 3.6 Стиль панели управления (раздельно для L-MPV и Liquid Glass)
  if (data.liquidGlassStyle) {
    saveControlBarStyle(data.liquidGlassStyle, "glass");
  }
  if (targetInterfaceTheme === "glass") {
    const activeGlassStyle = data.liquidGlassStyle || data.controlBarStyle;
    if (activeGlassStyle) {
      saveControlBarStyle(activeGlassStyle, "glass");
      window.dispatchEvent(
        new CustomEvent("l-mpv-control-bar-style-changed", {
          detail: activeGlassStyle,
        }),
      );
    }
  } else if (data.controlBarStyle) {
    saveControlBarStyle(data.controlBarStyle, "lmpv");
    window.dispatchEvent(
      new CustomEvent("l-mpv-control-bar-style-changed", {
        detail: data.controlBarStyle,
      }),
    );
  }

  if (data.settingsStyle === "modal" || data.settingsStyle === "sidebar") {
    saveUiSettingsStyle(data.settingsStyle);
  }

  // 3.7 Язык интерфейса
  if (data.language === "ru" || data.language === "en") {
    saveLocale(data.language);
  }

  // 4. Плавные анимации — через единый сеттер (localStorage + класс + data-атрибут)
  if (typeof data.animationsEnabled === "boolean") {
    setAnimationsEnabled(data.animationsEnabled);
  }

  // 5. Названия дорожек
  if (typeof data.showTrackNames === "boolean") {
    localStorage.setItem("l-mpv-show-track-names", data.showTrackNames ? "true" : "false");
  }

  // 6. Видимые кнопки
  if (data.visibleButtons) {
    localStorage.setItem("l-mpv-visible-buttons", JSON.stringify(data.visibleButtons));
  }
  if (Array.isArray(data.utilityButtonCards)) {
    saveUtilityCards(data.utilityButtonCards, { notify: false });
    window.dispatchEvent(new Event(UTILITY_CARDS_CHANGED_EVENT));
  }

  // 7. Пользовательские цвета
  if (data.customColors && Array.isArray(data.customColors)) {
    saveCustomColors(data.customColors);
  }

  // 9. Аудио-визуализатор
  if (data.visualizer) {
    saveVisualizerConfig(data.visualizer);
  }

  // 9.1. Тепловая карта таймлайна
  if (data.heatmap) {
    saveHeatmapConfig(data.heatmap);
  }

  // 10. Поведение сохранения дорожек и хотлоад
  if (typeof data.saveTracksToVideoDir === "boolean") {
    localStorage.setItem("l-mpv-save-tracks-to-video-dir", data.saveTracksToVideoDir ? "true" : "false");
  }
  if (typeof data.hotloadEnabled === "boolean") {
    localStorage.setItem("l-mpv-hotload-enabled", data.hotloadEnabled ? "true" : "false");
  }
  if (typeof data.skipOpeningSeconds === "number") {
    saveSkipOpeningSeconds(data.skipOpeningSeconds, false);
  }
  if (typeof data.seekStepSeconds === "number") {
    saveSeekStepSeconds(data.seekStepSeconds, false);
  }

  // 11. Горячие клавиши (если сохранены в пресете)
  if (data.customHotkeys && Object.keys(data.customHotkeys).length > 0) {
    saveCustomHotkeys(data.customHotkeys);
  }

  // 12. Глобальные оповещения для синхронизации всех открытых компонентов
  saveActivePresetId(preset.id);
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
  window.dispatchEvent(new CustomEvent("l-mpv-preset-applied", { detail: preset }));
}

/**
 * Загрузка пользовательских пресетов из индивидуальных файлов в config/presets/*.json и localStorage.
 */
export async function loadUserPresets(): Promise<SettingsPreset[]> {
  const revision = userPresetsCacheRevision();
  const normalizeList = (list: unknown[]): SettingsPreset[] => {
    return list
      .filter((item): item is SettingsPreset => {
        return !!(item && typeof item === "object" && typeof (item as SettingsPreset).name === "string");
      })
      .map((item) => ({
        id: item.id || `preset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: item.name,
        description: item.description,
        createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : undefined,
        isBuiltIn: false,
        data: {
          ...(item.data || {}),
          ambient: normalizeAmbientSettings(item.data?.ambient),
        },
      }));
  };

  try {
    // 1. Попытка чтения из бэкенда (сканирование папки config/presets/*.json)
    const jsonFromBackend = await invoke<string>("get_settings_presets");
    if (jsonFromBackend && jsonFromBackend.trim() !== "") {
      const parsed = JSON.parse(jsonFromBackend);
      if (Array.isArray(parsed)) {
        const normalized = normalizeList(parsed);
        if (revision !== userPresetsCacheRevision()) return getUserPresetsCache() ?? normalized;
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
      }
    }
  } catch (e) {
    console.warn("Чтение пресетов из бэкенда не удалось, используется локальное хранилище:", e);
  }

  // 2. Фолбэк на localStorage
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return normalizeList(parsed);
      }
    }
  } catch (e) {
    console.error("Ошибка чтения пресетов из localStorage:", e);
  }

  return [];
}

/**
 * Сохранение списка пользовательских пресетов в localStorage и config/presets.json.
 */
export async function saveUserPresets(presets: SettingsPreset[]): Promise<void> {
  const userOnly = presets.filter((p) => !p.isBuiltIn);
  const jsonStr = JSON.stringify(userOnly, null, 2);

  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, jsonStr);
  } catch (e) {
    console.error("Ошибка записи пресетов в localStorage:", e);
  }

  await invoke("save_settings_presets", { presetsJson: jsonStr });

  setUserPresetsCache(userOnly);
  window.dispatchEvent(new CustomEvent("l-mpv-presets-updated"));
}

/**
 * Вспомогательная функция безопасного скачивания JSON-файла с освобождением URL.
 */
function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Экспорт выбранного пресета с открытием нативного проводника Windows.
 */
export async function exportPresetToFile(preset: SettingsPreset): Promise<string | null> {
  const cleanName = preset.name.replace(/[\\/:*?"<>|]/g, "_").trim() || "preset";
  const defaultFileName = `l-mpv-preset-${cleanName}.json`;

  try {
    const selectedPath = await save({
      title: `Экспорт пресета «${preset.name}»`,
      defaultPath: defaultFileName,
      filters: [
        {
          name: "Пресет L-MPV (*.json)",
          extensions: ["json"],
        },
      ],
    });

    if (!selectedPath) return null;

    const content = JSON.stringify(preset, null, 2);
    await invoke("write_text_file", { path: selectedPath, content });
    return selectedPath;
  } catch (e) {
    console.error("Ошибка нативного экспорта пресета:", e);
    // Фолбэк на скачивание через браузерный Blob если вызов Tauri отклонён
    downloadJson(defaultFileName, preset);
    return defaultFileName;
  }
}

/**
 * Экспорт всех пользовательских пресетов в один файл backup с открытием нативного проводника.
 */
export async function exportAllPresetsToFile(presets: SettingsPreset[]): Promise<string | null> {
  const userOnly = presets.filter((p) => !p.isBuiltIn);
  const defaultFileName = `l-mpv-presets-all-${new Date().toISOString().slice(0, 10)}.json`;

  try {
    const selectedPath = await save({
      title: "Экспорт всех пресетов настроек",
      defaultPath: defaultFileName,
      filters: [
        {
          name: "Пресеты L-MPV (*.json)",
          extensions: ["json"],
        },
      ],
    });

    if (!selectedPath) return null;

    const content = JSON.stringify(userOnly, null, 2);
    await invoke("write_text_file", { path: selectedPath, content });
    return selectedPath;
  } catch (e) {
    console.error("Ошибка нативного экспорта всех пресетов:", e);
    downloadJson(defaultFileName, userOnly);
    return defaultFileName;
  }
}

/**
 * Нативный импорт пресетов через окно выбора файла проводника Windows.
 */
export async function importPresetsFromNativeDialog(): Promise<SettingsPreset[]> {
  try {
    const selectedPath = await open({
      title: "Выберите файл пресета для импорта (.json)",
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Файлы пресетов (*.json)",
          extensions: ["json"],
        },
      ],
    });

    if (!selectedPath || typeof selectedPath !== "string") {
      return [];
    }

    const fileContent = await invoke<string>("read_text_file", { path: selectedPath });
    return parseImportedPresets(fileContent);
  } catch (e) {
    console.error("Ошибка нативного импорта пресета:", e);
    throw e;
  }
}

/**
 * Открытие портативной папки config/presets/ в Проводнике Windows.
 */
export async function openPresetsFolder(): Promise<void> {
  try {
    await invoke("open_presets_folder");
  } catch (e) {
    console.error("Ошибка открытия папки пресетов:", e);
  }
}

/**
 * Парсинг и валидация импортированного JSON текста с пресетами.
 */
export function parseImportedPresets(jsonString: string): SettingsPreset[] {
  try {
    const parsed = JSON.parse(jsonString);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const valid: SettingsPreset[] = [];

    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const d = (item.data && typeof item.data === "object") ? item.data : item;
      const rawName = typeof item.name === "string" ? item.name : "Импортированный пресет";

      valid.push({
        id: `preset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: `${rawName.replace(/\s*\(Импорт\)\s*/g, "")} (Импорт)`,
        createdAt: Date.now(),
        isBuiltIn: false,
        data: {
          playerInterfaceTheme:
            d.playerInterfaceTheme === "lmpv" || d.playerInterfaceTheme === "glass"
              ? d.playerInterfaceTheme
              : undefined,
          playerTheme: d.playerTheme || "graphite",
          liquidGlassStyle: d.liquidGlassStyle === "floating" ? "modern"
            : ["capsule", "modern", "docked"].includes(d.liquidGlassStyle) ? d.liquidGlassStyle : undefined,
          liquidGlassBlur:
            typeof d.liquidGlassBlur === "number" && Number.isFinite(d.liquidGlassBlur)
              ? Math.max(0, Math.min(100, Math.round(d.liquidGlassBlur)))
              : undefined,
          liquidGlassRefraction:
            typeof d.liquidGlassRefraction === "number" && Number.isFinite(d.liquidGlassRefraction)
              ? Math.max(0, Math.min(MAX_GLASS_REFRACTION, Math.round(d.liquidGlassRefraction)))
              : undefined,
          liquidGlassTint:
            d.liquidGlassTint === "transparent" ||
            (typeof d.liquidGlassTint === "string" && d.liquidGlassTint in PLAYER_THEMES)
              ? (d.liquidGlassTint as GlassTintId)
              : undefined,
          uiFont: typeof d.uiFont === "string" && d.uiFont.trim() ? d.uiFont : undefined,
          controlBarStyle: d.controlBarStyle === "floating" ? "modern"
            : ["capsule", "modern", "docked"].includes(d.controlBarStyle) ? d.controlBarStyle : undefined,
          timePosition: ["timeline_right", "timeline_left", "volume_right", "toolbar_right", "timeline_floating_center", "titlebar"].includes(d.timePosition) ? d.timePosition : undefined,
          timeFormat: ["elapsed_total", "elapsed_remaining", "remaining_only", "finish_time"].includes(d.timeFormat) ? d.timeFormat : undefined,
          settingsStyle: d.settingsStyle === "modal" || d.settingsStyle === "sidebar" ? d.settingsStyle : undefined,
          language: d.language === "ru" || d.language === "en" ? d.language : undefined,
          accentColor: d.accentColor || "#7fc7ff",
          glowIntensity: d.glowIntensity || "medium",
          uiOpacity: typeof d.uiOpacity === "number" ? d.uiOpacity : 0.88,
          uiRadius: d.uiRadius,
          uiScale: d.uiScale,
          animationsEnabled: d.animationsEnabled !== false,
          showTrackNames: d.showTrackNames !== false,
          visibleButtons: d.visibleButtons || {},
          utilityButtonCards: Array.isArray(d.utilityButtonCards)
            ? normalizeUtilityCards(d.utilityButtonCards, true)
            : undefined,
          customColors: d.customColors || [],
          ambient: normalizeAmbientSettings(d.ambient),
          visualizer: d.visualizer || {
            enabled: false,
            placement: "off",
            mode: "waveform",
            theme: "accent",
            height: 22,
          },
          heatmap: d.heatmap,
          saveTracksToVideoDir: d.saveTracksToVideoDir !== false,
          hotloadEnabled: d.hotloadEnabled === true,
          skipOpeningSeconds: typeof d.skipOpeningSeconds === "number" ? d.skipOpeningSeconds : 90,
          seekStepSeconds: typeof d.seekStepSeconds === "number" ? d.seekStepSeconds : 10,
          customHotkeys: d.customHotkeys,
        },
      });
    }
    return valid;
  } catch (e) {
    throw new Error("Неверный формат JSON файла пресета");
  }
}

export const ACTIVE_PRESET_STORAGE_KEY = "l-mpv-active-preset-id";

/**
 * Получить ID последнего применённого или сохранённого пресета.
 */
export function getSavedActivePresetId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PRESET_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Зафиксировать ID активного пресета в хранилище.
 */
export function saveActivePresetId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_PRESET_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_PRESET_STORAGE_KEY);
    }
  } catch (e) {
    console.error("Ошибка сохранения активного пресета:", e);
  }
}

/**
 * Проверяет, соответствуют ли текущие настройки плеера конфигурации пресета.
 */
export function isSettingsMatchingPreset(
  current: SettingsPresetData,
  preset: SettingsPresetData
): boolean {
  if (!current || !preset) return false;

  // 0. Режим интерфейса (L-MPV / Liquid Glass)
  if (preset.playerInterfaceTheme) {
    if ((current.playerInterfaceTheme || "lmpv") !== preset.playerInterfaceTheme) {
      return false;
    }
  }
  const effectiveInterfaceTheme: PlayerTheme =
    preset.playerInterfaceTheme || current.playerInterfaceTheme || "lmpv";

  // 1. Цвет плеера (L-MPV) или оттенок и размытие Liquid Glass
  if (effectiveInterfaceTheme === "glass") {
    if (typeof preset.liquidGlassBlur === "number") {
      const curBlur = Math.round(Number(current.liquidGlassBlur ?? DEFAULT_GLASS_BLUR));
      if (curBlur !== Math.round(preset.liquidGlassBlur)) return false;
    }
    if (typeof preset.liquidGlassRefraction === "number") {
      const curRefraction = Math.round(
        Number(current.liquidGlassRefraction ?? DEFAULT_GLASS_REFRACTION),
      );
      if (curRefraction !== Math.round(preset.liquidGlassRefraction)) return false;
    }
    if (preset.liquidGlassTint) {
      const curTint = current.liquidGlassTint || DEFAULT_GLASS_TINT;
      if (curTint !== preset.liquidGlassTint) return false;
    }
  } else {
    const curTheme = current.playerTheme || "graphite";
    const preTheme = preset.playerTheme || "graphite";
    if (curTheme !== preTheme) return false;
  }

  // 2. Шрифт интерфейса
  const curFont = current.uiFont || "inter";
  const preFont = preset.uiFont || "inter";
  if (curFont !== preFont) return false;

  if (preset.settingsStyle) {
    if (getSavedUiSettingsStyle() !== preset.settingsStyle) return false;
  }

  if (preset.language) {
    if (getEffectiveLocale() !== preset.language) return false;
  }

  // Compare only explicit options: older presets do not constrain missing fields.
  const normalizeStyle = (value: string | undefined) => value === "floating" ? "modern" : value || "modern";
  if (effectiveInterfaceTheme === "glass") {
    const preGlassStyle = preset.liquidGlassStyle || preset.controlBarStyle;
    if (
      preGlassStyle &&
      normalizeStyle(current.liquidGlassStyle || current.controlBarStyle) !== normalizeStyle(preGlassStyle)
    ) {
      return false;
    }
  } else if (
    preset.controlBarStyle &&
    normalizeStyle(current.controlBarStyle) !== normalizeStyle(preset.controlBarStyle)
  ) {
    return false;
  }
  if (preset.timePosition && (current.timePosition || "timeline_right") !== preset.timePosition) return false;
  if (preset.timeFormat && (current.timeFormat || "elapsed_total") !== preset.timeFormat) return false;

  // 3. Акцентный цвет
  const curAccent = (current.accentColor || "#7fc7ff").toLowerCase();
  const preAccent = (preset.accentColor || "#7fc7ff").toLowerCase();
  if (curAccent !== preAccent) return false;

  // 4. Интенсивность неонового свечения
  const curGlow = current.glowIntensity || "soft";
  const preGlow = preset.glowIntensity || "soft";
  if (curGlow !== preGlow) return false;

  // 5. Прозрачность UI (применяется в классическом режиме L-MPV)
  if (effectiveInterfaceTheme !== "glass") {
    const curOpacity = Math.round(Number(current.uiOpacity ?? 0.88) * 100);
    const preOpacity = Math.round(Number(preset.uiOpacity ?? 0.88) * 100);
    if (curOpacity !== preOpacity) return false;
  }

  // 6. Скругление углов
  const curRadiusLevel = typeof current.uiRadius === "string" ? current.uiRadius : current.uiRadius?.level || "default";
  const preRadiusLevel = typeof preset.uiRadius === "string" ? preset.uiRadius : preset.uiRadius?.level || "default";
  if (curRadiusLevel !== preRadiusLevel) return false;
  if (curRadiusLevel === "custom") {
    const curVal = typeof current.uiRadius === "object" ? current.uiRadius?.value : undefined;
    const preVal = typeof preset.uiRadius === "object" ? preset.uiRadius?.value : undefined;
    if (curVal !== preVal) return false;
  }

  // 7. Масштаб UI
  const curScaleMode = current.uiScale?.mode || "auto";
  const preScaleMode = preset.uiScale?.mode || "auto";
  if (curScaleMode !== preScaleMode) return false;
  if (curScaleMode === "custom") {
    const curScaleVal = Math.round((current.uiScale?.value ?? 1.0) * 100);
    const preScaleVal = Math.round((preset.uiScale?.value ?? 1.0) * 100);
    if (curScaleVal !== preScaleVal) return false;
  }

  // 8. Плавные анимации
  if (Boolean(current.animationsEnabled) !== Boolean(preset.animationsEnabled)) return false;

  // 9. Названия дорожек
  if (Boolean(current.showTrackNames) !== Boolean(preset.showTrackNames)) return false;

  // 10. Видимые кнопки и карточки утилит
  if (current.visibleButtons && preset.visibleButtons) {
    const allKeys = Array.from(new Set([...Object.keys(current.visibleButtons), ...Object.keys(preset.visibleButtons)]));
    for (const key of allKeys) {
      const curBtn = current.visibleButtons[key] !== false;
      const preBtn = preset.visibleButtons[key] !== false;
      if (curBtn !== preBtn) return false;
    }
  }
  if (preset.utilityButtonCards && current.utilityButtonCards) {
    if (JSON.stringify(current.utilityButtonCards) !== JSON.stringify(preset.utilityButtonCards)) {
      return false;
    }
  }

  // 10.2 Положение и формат времени
  if (preset.timePosition && current.timePosition) {
    if (current.timePosition !== preset.timePosition) return false;
  }
  if (preset.timeFormat && current.timeFormat) {
    if (current.timeFormat !== preset.timeFormat) return false;
  }

  // 11. Blur
  if (current.ambient && preset.ambient) {
    const currentAmbient = normalizeAmbientSettings(current.ambient);
    const presetAmbient = normalizeAmbientSettings(preset.ambient);
    if (currentAmbient.mode !== presetAmbient.mode) return false;
    if (currentAmbient.mode === "blur") {
      if (currentAmbient.blur_radius !== presetAmbient.blur_radius) return false;
    }

  }

  // 12. Аудио-визуализатор
  if (current.visualizer && preset.visualizer) {
    const curVisEnabled = Boolean(current.visualizer.enabled && current.visualizer.placement !== "off");
    const preVisEnabled = Boolean(preset.visualizer.enabled && preset.visualizer.placement !== "off");
    if (curVisEnabled !== preVisEnabled) return false;
    if (curVisEnabled) {
      if (current.visualizer.placement !== preset.visualizer.placement) return false;
      if (current.visualizer.mode !== preset.visualizer.mode) return false;
    }
  }

  // 13. Дополнительные опции
  if (Boolean(current.saveTracksToVideoDir) !== Boolean(preset.saveTracksToVideoDir)) return false;
  if (Boolean(current.hotloadEnabled) !== Boolean(preset.hotloadEnabled)) return false;
  if (Number(current.skipOpeningSeconds || 90) !== Number(preset.skipOpeningSeconds || 90)) return false;
  if (Number(current.seekStepSeconds || 10) !== Number(preset.seekStepSeconds || 10)) return false;

  // 14. Горячие клавиши (если они определены в пресете)
  if (preset.customHotkeys && Object.keys(preset.customHotkeys).length > 0) {
    if (!current.customHotkeys) return false;
    for (const [key, binds] of Object.entries(preset.customHotkeys)) {
      const curBinds = current.customHotkeys[key] || [];
      if (binds.join(",") !== curBinds.join(",")) return false;
    }
  }

  return true;
}

