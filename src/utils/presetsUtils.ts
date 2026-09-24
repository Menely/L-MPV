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
  PlayerThemeId,
  getSavedPlayerTheme,
  savePlayerTheme,
} from "./colorUtils";
import {
  VisualizerConfig,
  getVisualizerConfig,
  saveVisualizerConfig,
} from "../components/player/AudioVisualizer";
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

export interface SettingsPresetData {
  /** Тема оформления плеера (расцветка фона и поверхностей) */
  playerTheme?: PlayerThemeId | string;
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
  /** Пользовательская сохранённая палитра цветов */
  customColors?: string[];
  /** Параметры подсветки полос (Ambient Light) */
  ambient: {
    mode: "off" | "blur" | "color";
    blur_radius: number;
    color: string;
    brightness?: number;
    saturation?: number;
  };
  /** Конфигурация аудио-визуализатора */
  visualizer: VisualizerConfig;
  /** Сохранять извлечённые дорожки в папку с видео */
  saveTracksToVideoDir: boolean;
  /** Автоподхват внешних дорожек при перетаскивании */
  hotloadEnabled: boolean;
  /** Количество секунд пропуска опенинга */
  skipOpeningSeconds: number;
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

/**
 * Встроенные заводские пресеты для быстрого выбора визуального стиля.
 */
export const BUILT_IN_PRESETS: SettingsPreset[] = [
  {
    id: "builtin_classic",
    name: "Классический L-MPV",
    description: "Фирменный небесно-голубой стиль с мягкой подсветкой и волной",
    createdAt: 1700000000000,
    isBuiltIn: true,
    data: {
      playerTheme: "graphite",
      uiFont: "inter",
      accentColor: "#7fc7ff",
      glowIntensity: "soft",
      uiOpacity: 0.88,
      animationsEnabled: true,
      showTrackNames: true,
      visibleButtons: {
        repeat: true,
        shuffle: true,
        alwaysOnTop: true,
        info: true,
        mediaInfo: true,
        visualizer: true,
        screenshot: true,
        playlist: true,
        fullscreen: true,
        skipOpening: false,
      },
      ambient: {
        mode: "blur",
        blur_radius: 35,
        color: "#000000",
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
    },
  },
  {
    id: "builtin_cyberpunk",
    name: "Киберпанк Неон",
    description: "Яркий неоново-розовый акцент с сильным свечением и спектральными полосами",
    createdAt: 1700000000001,
    isBuiltIn: true,
    data: {
      playerTheme: "oled",
      uiFont: "outfit",
      accentColor: "#ff2a85",
      glowIntensity: "intense",
      uiOpacity: 0.94,
      animationsEnabled: true,
      showTrackNames: true,
      visibleButtons: {
        repeat: true,
        shuffle: true,
        alwaysOnTop: true,
        info: true,
        mediaInfo: true,
        visualizer: true,
        screenshot: true,
        playlist: true,
        fullscreen: true,
        skipOpening: true,
      },
      ambient: {
        mode: "color",
        blur_radius: 50,
        color: "#4a044e",
      },
      visualizer: {
        enabled: true,
        placement: "toolbar",
        mode: "bars",
        theme: "neon",
        height: 26,
      },
      saveTracksToVideoDir: true,
      hotloadEnabled: true,
      skipOpeningSeconds: 90,
    },
  },
  {
    id: "builtin_cinema",
    name: "Ночной кинозал",
    description: "Тёплый янтарный тон, глубокое фоновое размытие и приглушённый интерфейс",
    createdAt: 1700000000002,
    isBuiltIn: true,
    data: {
      playerTheme: "graphite",
      uiFont: "jakarta",
      accentColor: "#f59e0b",
      glowIntensity: "soft",
      uiOpacity: 0.72,
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
      },
      ambient: {
        mode: "blur",
        blur_radius: 65,
        color: "#000000",
      },
      visualizer: {
        enabled: false,
        placement: "off",
        mode: "waveform",
        theme: "sunset",
        height: 20,
      },
      saveTracksToVideoDir: false,
      hotloadEnabled: false,
      skipOpeningSeconds: 90,
    },
  },
  {
    id: "builtin_minimal",
    name: "Чистый минимализм",
    description: "Строгий нейтральный стиль без лишних кнопок и свечения",
    createdAt: 1700000000003,
    isBuiltIn: true,
    data: {
      playerTheme: "nord",
      uiFont: "inter",
      accentColor: "#cbd5e1",
      glowIntensity: "off",
      uiOpacity: 1.0,
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
      },
      ambient: {
        mode: "off",
        blur_radius: 20,
        color: "#000000",
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
    repeat: true,
    shuffle: true,
    alwaysOnTop: true,
    info: true,
    mediaInfo: true,
    visualizer: true,
    screenshot: true,
    playlist: true,
    fullscreen: true,
    skipOpening: false,
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

  let ambient: {
    mode: "off" | "blur" | "color";
    blur_radius: number;
    color: string;
    brightness?: number;
    saturation?: number;
  } = {
    mode: "off",
    blur_radius: 35,
    color: "#000000",
  };
  try {
    const savedAmbient = await invoke<{
      mode: "off" | "blur" | "color";
      blur_radius: number;
      color: string;
      brightness?: number;
      saturation?: number;
    }>(
      "get_ambient_settings"
    );
    if (savedAmbient) {
      ambient = savedAmbient;
    }
  } catch (e) {
    console.error("Ошибка получения настроек Ambient Light:", e);
  }

  const visualizer = getVisualizerConfig();
  const saveTracksToVideoDir = localStorage.getItem("l-mpv-save-tracks-to-video-dir") !== "false";
  const hotloadEnabled = localStorage.getItem("l-mpv-hotload-enabled") === "true";
  const skipOpeningSeconds = Number(localStorage.getItem("l-mpv-skip-opening-seconds") || 90);
  const customHotkeys = getCustomHotkeys();
  const uiRadius = getSavedUiRadius();
  const uiScale = getSavedUiScale();
  const uiFont = getSavedUiFont();
  const playerTheme = getSavedPlayerTheme();

  return {
    id: `preset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim() || "Пользовательский пресет",
    createdAt: Date.now(),
    isBuiltIn: false,
    data: {
      playerTheme,
      uiFont,
      timePosition: getSavedTimePosition(),
      timeFormat: getSavedTimeFormat(),
      controlBarStyle: getSavedControlBarStyle(),
      accentColor,
      glowIntensity,
      uiOpacity,
      uiRadius,
      uiScale,
      animationsEnabled,
      showTrackNames,
      visibleButtons,
      customColors,
      ambient,
      visualizer,
      saveTracksToVideoDir,
      hotloadEnabled,
      skipOpeningSeconds,
      customHotkeys,
    },
  };
}

/**
 * Мгновенное применение всех параметров выбранного пресета.
 */
export async function applySettingsPreset(preset: SettingsPreset): Promise<void> {
  const { data } = preset;

  // 0. Тема оформления плеера (расцветка фона и поверхностей)
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

  // 3.6 Стиль панели управления (парящий остров или пристыкованная плашка)
  if (data.controlBarStyle) {
    saveControlBarStyle(data.controlBarStyle);
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

  // 7. Пользовательские цвета
  if (data.customColors && Array.isArray(data.customColors)) {
    saveCustomColors(data.customColors);
  }

  // 8. Подсветка полос (Ambient Light)
  if (data.ambient) {
    try {
      await invoke("set_ambient_settings", { settings: data.ambient });
      await invoke("apply_ambient_preview", { settings: data.ambient }).catch(() => {});
      window.dispatchEvent(new CustomEvent("l-mpv-ambient-changed", { detail: data.ambient }));
    } catch (e) {
      console.error("Ошибка применения Ambient Light:", e);
    }
  }

  // 9. Аудио-визуализатор
  if (data.visualizer) {
    saveVisualizerConfig(data.visualizer);
  }

  // 10. Поведение сохранения дорожек и хотлоад
  if (typeof data.saveTracksToVideoDir === "boolean") {
    localStorage.setItem("l-mpv-save-tracks-to-video-dir", data.saveTracksToVideoDir ? "true" : "false");
  }
  if (typeof data.hotloadEnabled === "boolean") {
    localStorage.setItem("l-mpv-hotload-enabled", data.hotloadEnabled ? "true" : "false");
  }
  if (typeof data.skipOpeningSeconds === "number") {
    localStorage.setItem("l-mpv-skip-opening-seconds", data.skipOpeningSeconds.toString());
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
        data: item.data || {},
      }));
  };

  try {
    // 1. Попытка чтения из бэкенда (сканирование папки config/presets/*.json)
    const jsonFromBackend = await invoke<string>("get_settings_presets");
    if (jsonFromBackend && jsonFromBackend.trim() !== "") {
      const parsed = JSON.parse(jsonFromBackend);
      if (Array.isArray(parsed)) {
        const normalized = normalizeList(parsed);
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

  try {
    await invoke("save_settings_presets", { presetsJson: jsonStr });
  } catch (e) {
    console.error("Ошибка сохранения пресетов в config/presets.json:", e);
  }

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
      if (item && typeof item.name === "string" && item.data && typeof item.data === "object") {
        valid.push({
          id: `preset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: `${item.name.replace(/\s*\(Импорт\)\s*/g, "")} (Импорт)`,
          createdAt: Date.now(),
          isBuiltIn: false,
          data: {
            playerTheme: item.data.playerTheme || "graphite",
            accentColor: item.data.accentColor || "#7fc7ff",
            glowIntensity: item.data.glowIntensity || "medium",
            uiOpacity: typeof item.data.uiOpacity === "number" ? item.data.uiOpacity : 0.88,
            uiRadius: item.data.uiRadius,
            uiScale: item.data.uiScale,
            animationsEnabled: item.data.animationsEnabled !== false,
            showTrackNames: item.data.showTrackNames !== false,
            visibleButtons: item.data.visibleButtons || {},
            customColors: item.data.customColors || [],
            ambient: item.data.ambient || { mode: "off", blur_radius: 35, color: "#000000" },
            visualizer: item.data.visualizer || {
              enabled: false,
              placement: "off",
              mode: "waveform",
              theme: "accent",
              height: 22,
            },
            saveTracksToVideoDir: item.data.saveTracksToVideoDir !== false,
            hotloadEnabled: item.data.hotloadEnabled === true,
            skipOpeningSeconds: typeof item.data.skipOpeningSeconds === "number" ? item.data.skipOpeningSeconds : 90,
            customHotkeys: item.data.customHotkeys,
          },
        });
      }
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

  // 1. Тема плеера
  const curTheme = current.playerTheme || "graphite";
  const preTheme = preset.playerTheme || "graphite";
  if (curTheme !== preTheme) return false;

  // 2. Шрифт интерфейса
  const curFont = current.uiFont || "inter";
  const preFont = preset.uiFont || "inter";
  if (curFont !== preFont) return false;

  // 3. Акцентный цвет
  const curAccent = (current.accentColor || "#7fc7ff").toLowerCase();
  const preAccent = (preset.accentColor || "#7fc7ff").toLowerCase();
  if (curAccent !== preAccent) return false;

  // 4. Интенсивность неонового свечения
  const curGlow = current.glowIntensity || "soft";
  const preGlow = preset.glowIntensity || "soft";
  if (curGlow !== preGlow) return false;

  // 5. Прозрачность UI
  const curOpacity = Math.round(Number(current.uiOpacity ?? 0.88) * 100);
  const preOpacity = Math.round(Number(preset.uiOpacity ?? 0.88) * 100);
  if (curOpacity !== preOpacity) return false;

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

  // 10. Видимые кнопки
  if (current.visibleButtons && preset.visibleButtons) {
    const allKeys = Array.from(new Set([...Object.keys(current.visibleButtons), ...Object.keys(preset.visibleButtons)]));
    for (const key of allKeys) {
      const curBtn = current.visibleButtons[key] !== false;
      const preBtn = preset.visibleButtons[key] !== false;
      if (curBtn !== preBtn) return false;
    }
  }

  // 11. Ambient Light
  if (current.ambient && preset.ambient) {
    if (current.ambient.mode !== preset.ambient.mode) return false;
    if (current.ambient.mode !== "off") {
      if (current.ambient.blur_radius !== preset.ambient.blur_radius) return false;
      if (current.ambient.mode === "color" && current.ambient.color.toLowerCase() !== preset.ambient.color.toLowerCase()) return false;
      // Яркость/насыщенность сравниваем только если пресет их задаёт
      if (preset.ambient.brightness !== undefined && (current.ambient.brightness ?? 100) !== preset.ambient.brightness) return false;
      if (preset.ambient.saturation !== undefined && (current.ambient.saturation ?? 100) !== preset.ambient.saturation) return false;
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

