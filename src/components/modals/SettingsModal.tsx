import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Векторная иконка GitHub для ссылки на репозиторий.
 */
const GithubIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={{ display: "block" }}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

/**
 * Векторная иконка Telegram для ссылки на сообщество.
 */
const TelegramIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={{ display: "block" }}
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.96 1.25-5.54 3.69-.52.36-1 .54-1.42.53-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.49 1.02-.75 4.02-1.75 6.7-2.9 8.04-3.46 3.83-1.6 4.62-1.88 5.14-1.89.11 0 .37.03.54.17.14.12.18.28.2.4.02.12.01.24 0 .35z" />
  </svg>
);
import {
  Keyboard,
  SlidersHorizontal,
  Palette,
  Link,
  Loader2,
  Sparkles,
  Layers,
  RefreshCw,
  X,
} from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";
import {
  TimeDisplayPosition,
  getSavedTimePosition,
  saveTimePosition,
} from "../../utils/timePositionUtils";
import {
  TimeFormatMode,
  getSavedTimeFormat,
  saveTimeFormat,
} from "../../utils/timeFormatUtils";
import {
  ControlBarStyle,
  getSavedControlBarStyle,
  saveControlBarStyle,
} from "../../utils/controlBarStyleUtils";
import {
  createDefaultAmbientSettings,
  normalizeAmbientSettings,
} from "../../utils/ambientSettingsUtils";
import type { AmbientSettings } from "../../utils/ambientSettingsUtils";
import { UpdateInfo } from "./UpdateModal";
import { getEffectiveAccentColor } from "../../utils/colorUtils";
import { PresetsSection } from "../settings/PresetsSection";
import { UpscalingSettingsSection } from "../settings/UpscalingSettingsSection";
import { HotkeysSettingsTab } from "../settings/HotkeysSettingsTab";
import { IntegrationSettingsTab } from "../settings/IntegrationSettingsTab";
import { AppearanceSettingsTab } from "../settings/AppearanceSettingsTab";
import { GeneralSettingsTab } from "../settings/GeneralSettingsTab";
import { useSettingsTabTransition } from "../settings/useSettingsTabTransition";
import { preloadSettingsTabs } from "../settings/settingsTabPreload";
import { isMotionAllowed, getCloseTimeoutMs } from "../../utils/animationUtils";
import { SettingsPreset } from "../../utils/presetsUtils";
import {
  UiRadiusLevel,
  UI_RADIUS_PRESETS,
  getSavedUiRadius,
  saveUiRadius,
  UiScaleMode,
  getSavedUiScale,
  saveUiScale,
  getSavedUiOpacity,
  saveUiOpacity,
  UiFontId,
  getSavedUiFont,
  saveUiFont,
} from "../../utils/uiThemeUtils";

export type { AmbientSettings } from "../../utils/ambientSettingsUtils";

interface SettingsModalProps {
  onClose: () => void;
  onShowUpdate?: (info: UpdateInfo) => void;
}

export { AccordionSection } from "../settings/AccordionSection";
export type { AccordionSectionProps } from "../settings/AccordionSection";

const SETTINGS_TABS = [
  "general",
  "appearance",
  "presets",
  "upscaling",
  "hotkeys",
  "integration",
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number];

export function SettingsModal({ onClose, onShowUpdate }: SettingsModalProps) {
  const [screenshotDir, setScreenshotDir] = useState<string>("");
  const [uiOpacity, setUiOpacity] = useState<number>(() => getSavedUiOpacity());
  const [activeColor, setActiveColor] = useState<string>(() => {
    try {
      return localStorage.getItem("l-mpv-accent-color") || "#7fc7ff";
    } catch {
      return "#7fc7ff";
    }
  });
  const [showTrackNames, setShowTrackNames] = useState<boolean>(true);
  const [subtitlesAvoidUi, setSubtitlesAvoidUi] = useState<boolean>(() => {
    try {
      return localStorage.getItem('l-mpv-subtitles-avoid-ui') === 'true';
    } catch {
      return false;
    }
  });
  const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('l-mpv-animations-enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [multiInstance, setMultiInstance] = useState<boolean>(false);
  const [saveTracksToVideoDir, setSaveTracksToVideoDir] = useState<boolean>(true);
  const [autoLoadTracks, setAutoLoadTracks] = useState<boolean>(false);
  const [autoSelectExternalAudio, setAutoSelectExternalAudio] = useState<boolean>(false);
  const [playNextOnEnd, setPlayNextOnEnd] = useState<boolean>(true);
  const [appVersion, setAppVersion] = useState<string>("2.5.4");
  const [visibleButtons, setVisibleButtons] = useState<Record<string, boolean>>({});
  const [skipOpeningSeconds, setSkipOpeningSeconds] = useState<number>(() => Number(localStorage.getItem('l-mpv-skip-opening-seconds') || 90));
  const [hotloadEnabled, setHotloadEnabled] = useState<boolean>(() => localStorage.getItem('l-mpv-hotload-enabled') === 'true');
  const [hideControlsInUpperHalf, setHideControlsInUpperHalf] = useState<boolean>(() => localStorage.getItem('l-mpv-hide-controls-upper-half') === 'true');
    const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
    const [uiRadius, setUiRadius] = useState<{ level: UiRadiusLevel; value: number }>(() => getSavedUiRadius());
  const [uiScale, setUiScale] = useState<{ mode: UiScaleMode; value: number }>(() => getSavedUiScale());
  const [uiFont, setUiFont] = useState<UiFontId>(() => getSavedUiFont());
  const [timePosition, setTimePosition] = useState<TimeDisplayPosition>(() => getSavedTimePosition());
  const [timeFormat, setTimeFormat] = useState<TimeFormatMode>(() => getSavedTimeFormat());
  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() => getSavedControlBarStyle());
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const { bodyRef, panelRef, beginSwitch } = useSettingsTabTransition(activeTab, SETTINGS_TABS);
  const { dict } = useTranslation();

  // Единая точка смены вкладки: плавный переход высоты + слайд, логика табов не меняется
  const handleTabChange = useCallback((next: SettingsTabId) => {
    if (beginSwitch(next)) setActiveTab(next);
  }, [beginSwitch]);

  const [isClosing, setIsClosing] = useState<boolean>(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (closeTimerRef.current) return;
    if (!isMotionAllowed()) {
      onClose();
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, getCloseTimeoutMs("base"));
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // Прогрев тяжёлых вкладок (пресеты, апскейлинг) при открытии окна:
  // к моменту переключения данные уже в кэше, первый paint полный.
  useLayoutEffect(() => {
    preloadSettingsTabs();
  }, []);

  // Навигация стрелками влево и вправо для переключения категорий настроек
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем переключение, если идет запись горячей клавиши
      if (isRecordingHotkey) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
        return;
      }

      const currentIndex = SETTINGS_TABS.indexOf(activeTab);
      if (currentIndex === -1) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const nextIndex = (currentIndex + 1) % SETTINGS_TABS.length;
        handleTabChange(SETTINGS_TABS[nextIndex]);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const prevIndex = (currentIndex - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
        handleTabChange(SETTINGS_TABS[prevIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [activeTab, isRecordingHotkey, handleClose, handleTabChange]);

  // Синхронизация локальных состояний SettingsModal при применении любого пресета
  const handlePresetApplied = useCallback((preset: SettingsPreset) => {
    const { data } = preset;
    if (data.accentColor) setActiveColor(data.accentColor);
    if (typeof data.uiOpacity === "number") setUiOpacity(data.uiOpacity);
    if (data.uiRadius) {
      if (typeof data.uiRadius === "string") {
        const val = data.uiRadius in UI_RADIUS_PRESETS
          ? UI_RADIUS_PRESETS[data.uiRadius as Exclude<UiRadiusLevel, "custom">].controlsRadius
          : 16;
        setUiRadius({ level: data.uiRadius, value: val });
      } else {
        setUiRadius({ level: data.uiRadius.level, value: data.uiRadius.value ?? 16 });
      }
    }
    if (data.uiScale) setUiScale({ mode: data.uiScale.mode, value: data.uiScale.value ?? 1.0 });
    if (data.uiFont) setUiFont(data.uiFont as UiFontId);
    if (data.timePosition) setTimePosition(data.timePosition);
    if (data.timeFormat) setTimeFormat(data.timeFormat);
    if (data.controlBarStyle) setControlBarStyle(data.controlBarStyle);
    if (typeof data.animationsEnabled === "boolean") setAnimationsEnabled(data.animationsEnabled);
    if (typeof data.showTrackNames === "boolean") setShowTrackNames(data.showTrackNames);
    if (data.visibleButtons) setVisibleButtons(data.visibleButtons);
    if (data.ambient) setAmbientSettings(normalizeAmbientSettings(data.ambient));
    if (typeof data.saveTracksToVideoDir === "boolean") setSaveTracksToVideoDir(data.saveTracksToVideoDir);
    if (typeof data.hotloadEnabled === "boolean") setHotloadEnabled(data.hotloadEnabled);
    if (typeof data.skipOpeningSeconds === "number") setSkipOpeningSeconds(data.skipOpeningSeconds);
      }, []);

          
  const [ambientSettings, setAmbientSettings] = useState<AmbientSettings>(() =>
    createDefaultAmbientSettings()
  );

  useEffect(() => {
    const handleRadiusChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ level: UiRadiusLevel; value?: number } | UiRadiusLevel>;
      if (customEvent.detail) {
        if (typeof customEvent.detail === "string") {
          const lvl = customEvent.detail;
          const val = lvl in UI_RADIUS_PRESETS
            ? UI_RADIUS_PRESETS[lvl as Exclude<UiRadiusLevel, "custom">].controlsRadius
            : 16;
          setUiRadius({ level: lvl, value: val });
        } else {
          setUiRadius({
            level: customEvent.detail.level,
            value: customEvent.detail.value ?? 16,
          });
        }
      }
    };
    const handleScaleChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ mode: UiScaleMode; value?: number }>;
      if (customEvent.detail) {
        setUiScale({
          mode: customEvent.detail.mode,
          value: customEvent.detail.value ?? 1.0,
        });
      }
    };
    const handleOpacityChanged = (e: Event) => {
      const customEvent = e as CustomEvent<number>;
      if (typeof customEvent.detail === "number") {
        setUiOpacity(customEvent.detail);
      }
    };
    const handleFontChanged = (e: Event) => {
      const customEvent = e as CustomEvent<UiFontId>;
      if (customEvent.detail) {
        setUiFont(customEvent.detail);
      }
    };
    const handleSettingsChanged = () => {
      setTimePosition(getSavedTimePosition());
      setTimeFormat(getSavedTimeFormat());
      setControlBarStyle(getSavedControlBarStyle());
      setSubtitlesAvoidUi(localStorage.getItem('l-mpv-subtitles-avoid-ui') === 'true');
    };
    window.addEventListener("l-mpv-ui-radius-changed", handleRadiusChanged);
    window.addEventListener("l-mpv-ui-scale-changed", handleScaleChanged);
    window.addEventListener("l-mpv-ui-opacity-changed", handleOpacityChanged);
    window.addEventListener("l-mpv-ui-font-changed", handleFontChanged);
    window.addEventListener("l-mpv-settings-changed", handleSettingsChanged);
    return () => {
      window.removeEventListener("l-mpv-ui-radius-changed", handleRadiusChanged);
      window.removeEventListener("l-mpv-ui-scale-changed", handleScaleChanged);
      window.removeEventListener("l-mpv-ui-opacity-changed", handleOpacityChanged);
      window.removeEventListener("l-mpv-ui-font-changed", handleFontChanged);
      window.removeEventListener("l-mpv-settings-changed", handleSettingsChanged);
    };
  }, []);
  // По умолчанию все категории свернуты (пустой Set / объект)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [isUpdateFound, setIsUpdateFound] = useState<boolean>(false);
  const [foundUpdate, setFoundUpdate] = useState<UpdateInfo | null>(null);
  const [isLoadingVersionInfo, setIsLoadingVersionInfo] = useState<boolean>(false);
  const updateStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ambientSettingsRef = useRef<AmbientSettings>(ambientSettings);
  ambientSettingsRef.current = ambientSettings;
  const isAmbientDirtyRef = useRef<boolean>(false);
  const ambientSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ambientLocalEventRef = useRef(false);
  // Коалесцинг превью: драг слайдера шлёт десятки onChange/сек,
  // в mpv уходит максимум один IPC за кадр.
  const ambientPreviewRafRef = useRef<number | null>(null);
  const pendingPreviewRef = useRef<AmbientSettings | null>(null);

  const flushAmbientPreview = () => {
    ambientPreviewRafRef.current = null;
    const settings = pendingPreviewRef.current;
    pendingPreviewRef.current = null;
    if (settings) {
      invoke("apply_ambient_preview", { settings }).catch((err) => {
        console.error("Ошибка предпросмотра Ambient Light:", err);
      });
    }
  };

  const scheduleAmbientPreview = (settings: AmbientSettings) => {
    pendingPreviewRef.current = settings;
    if (ambientPreviewRafRef.current === null) {
      ambientPreviewRafRef.current = requestAnimationFrame(flushAmbientPreview);
    }
  };

  // Сброс таймера статуса при размонтировании
  useEffect(() => {
    return () => {
      if (updateStatusTimerRef.current) {
        clearTimeout(updateStatusTimerRef.current);
      }
    };
  }, []);

  // Сброс несохраненных изменений на диск при закрытии/размонтировании модального окна
  useEffect(() => {
    return () => {
      if (ambientPreviewRafRef.current !== null) {
        cancelAnimationFrame(ambientPreviewRafRef.current);
        ambientPreviewRafRef.current = null;
      }
      // Неприменённое превью не теряем: дожимаем последнее значение в mpv
      if (pendingPreviewRef.current) {
        const settings = pendingPreviewRef.current;
        pendingPreviewRef.current = null;
        invoke("apply_ambient_preview", { settings }).catch(console.error);
      }
      if (ambientSaveTimeoutRef.current) {
        clearTimeout(ambientSaveTimeoutRef.current);
        ambientSaveTimeoutRef.current = null;
      }
      if (isAmbientDirtyRef.current) {
        isAmbientDirtyRef.current = false;
        invoke("set_ambient_settings", { settings: ambientSettingsRef.current }).catch(console.error);
      }
    };
  }, []);

  // Загружаем текущий путь к скриншотам из mpv
  useEffect(() => {
    let ambientRevision = 0;
    const loadAmbient = (event?: Event) => {
      const detail = (event as CustomEvent<unknown> | undefined)?.detail;
      if (detail) {
        ambientRevision += 1;
        const normalized = normalizeAmbientSettings(detail);
        ambientSettingsRef.current = normalized;
        if (!ambientLocalEventRef.current) {
          if (ambientPreviewRafRef.current !== null) {
            cancelAnimationFrame(ambientPreviewRafRef.current);
            ambientPreviewRafRef.current = null;
          }
          pendingPreviewRef.current = null;
          if (ambientSaveTimeoutRef.current) {
            clearTimeout(ambientSaveTimeoutRef.current);
            ambientSaveTimeoutRef.current = null;
          }
          isAmbientDirtyRef.current = false;
        }
        setAmbientSettings(normalized);
        return;
      }
      const requestRevision = ambientRevision;
      invoke<unknown>("get_ambient_settings")
        .then((settings) => {
          if (requestRevision === ambientRevision) {
            setAmbientSettings(normalizeAmbientSettings(settings));
          }
        })
        .catch((e) => console.error("Ошибка загрузки настроек Ambient Light:", e));
    };

    invoke<string>("get_screenshot_dir").then(setScreenshotDir).catch(console.error);
    invoke<boolean>("get_multi_instance").then(setMultiInstance).catch(console.error);
    invoke<boolean>("get_auto_load_tracks").then(setAutoLoadTracks).catch(console.error);
    invoke<boolean>("get_auto_select_external_audio").then(setAutoSelectExternalAudio).catch(console.error);
    invoke<boolean>("get_play_next_on_end").then(setPlayNextOnEnd).catch(console.error);
    invoke<boolean>("get_subtitles_avoid_ui").then((val) => {
      setSubtitlesAvoidUi(val);
      localStorage.setItem("l-mpv-subtitles-avoid-ui", val ? "true" : "false");
    }).catch(console.error);
    invoke<string>("get_app_version").then(setAppVersion).catch(console.error);
    loadAmbient();

    const savedAccent = localStorage.getItem("l-mpv-accent-color");
    if (savedAccent) setActiveColor(savedAccent);

    const savedShowTracks = localStorage.getItem("l-mpv-show-track-names");
    if (savedShowTracks !== null) setShowTrackNames(savedShowTracks === "true");

    const savedBtns = localStorage.getItem("l-mpv-visible-buttons");
    if (savedBtns) {
      try { setVisibleButtons(JSON.parse(savedBtns)); } catch {}
    }

    const savedTrackDirSetting = localStorage.getItem("l-mpv-save-tracks-to-video-dir");
    if (savedTrackDirSetting !== null) setSaveTracksToVideoDir(savedTrackDirSetting === "true");

    window.addEventListener("l-mpv-ambient-changed", loadAmbient);
    return () => {
      window.removeEventListener("l-mpv-ambient-changed", loadAmbient);
    };
  }, []);

  // Оптимизированное применение: шейдерный preview на GPU через rAF-коалесцинг
  // (максимум один IPC за кадр при драге слайдера) + отложенное сохранение (Debounce 400ms)
  const updateAmbient = async (newSettings: Partial<AmbientSettings>, immediateSave: boolean = false) => {
    const updated = normalizeAmbientSettings({
      ...ambientSettingsRef.current,
      ...newSettings,
      sample_widths: {
        ...ambientSettingsRef.current.sample_widths,
        ...newSettings.sample_widths,
      },
    });
    ambientSettingsRef.current = updated;
    setAmbientSettings(updated);

    // 1. Мгновенное применение шейдеров в mpv без блокирующего дискового ввода-вывода
    scheduleAmbientPreview(updated);
    ambientLocalEventRef.current = true;
    window.dispatchEvent(new CustomEvent("l-mpv-ambient-changed", { detail: updated }));
    ambientLocalEventRef.current = false;

    // 2. Дебаунсинг сохранения настроек в файл config/settings.json
    if (ambientSaveTimeoutRef.current) {
      clearTimeout(ambientSaveTimeoutRef.current);
      ambientSaveTimeoutRef.current = null;
    }

    if (immediateSave) {
      isAmbientDirtyRef.current = false;
      try {
        await invoke("set_ambient_settings", { settings: updated });
      } catch (err) {
        console.error("Ошибка сохранения настроек Ambient Light:", err);
      }
    } else {
      isAmbientDirtyRef.current = true;
      ambientSaveTimeoutRef.current = setTimeout(async () => {
        isAmbientDirtyRef.current = false;
        try {
          await invoke("set_ambient_settings", { settings: updated });
        } catch (err) {
          console.error("Ошибка отложенного сохранения настроек Ambient Light:", err);
        }
      }, 400);
    }

  };

  // Выбор папки скриншотов через диалог Tauri
  const handlePickFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: dict.settings.integration.pickFolderTitle,
      });
      if (selected && typeof selected === "string") {
        await invoke("set_screenshot_dir", { path: selected });
        setScreenshotDir(selected);
      }
    } catch (e) {
      console.error("Ошибка выбора папки:", e);
    }
  };

  // Сброс папки скриншотов на значение по умолчанию ("screenshots")
  const handleResetDefault = async () => {
    try {
      const defaultPath = "screenshots";
      await invoke("set_screenshot_dir", { path: defaultPath });
      setScreenshotDir(defaultPath);
    } catch (e) {
      console.error("Ошибка сброса пути:", e);
    }
  };

  // Ручная проверка обновлений через GitHub Releases API
  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus(null);
    setFoundUpdate(null);
    if (updateStatusTimerRef.current) {
      clearTimeout(updateStatusTimerRef.current);
      updateStatusTimerRef.current = null;
    }

    try {
      const info = await invoke<UpdateInfo>("check_for_updates");
      setFoundUpdate(info);
      if (info.has_update) {
        setUpdateStatus(dict.settings.integration.updateFound(info.latest_version.replace(/^[vV]/, "")));
        setIsUpdateFound(true);
        if (onShowUpdate) {
          onShowUpdate(info);
        }
      } else {
        setUpdateStatus(dict.settings.integration.upToDate);
        setIsUpdateFound(false);
        updateStatusTimerRef.current = setTimeout(() => setUpdateStatus(null), 4000);
      }
    } catch (err) {
      console.error("Ошибка проверки обновлений:", err);
      setUpdateStatus(dict.settings.integration.checkFailed);
      setIsUpdateFound(false);
      updateStatusTimerRef.current = setTimeout(() => setUpdateStatus(null), 4000);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  // Показ информации о текущей установленной версии и её чейнджлога (при клике на v{appVersion})
  const handleShowVersionInfo = async () => {
    if (!onShowUpdate || isLoadingVersionInfo) return;

    if (foundUpdate) {
      onShowUpdate(foundUpdate);
      return;
    }

    setIsLoadingVersionInfo(true);
    try {
      const info = await invoke<UpdateInfo>("check_for_updates");
      setFoundUpdate(info);
      onShowUpdate(info);
    } catch (err) {
      console.warn("Не удалось получить описание версии из сети, открытие резервного окна:", err);
      const fallbackInfo: UpdateInfo = {
        current_version: appVersion,
        latest_version: `v${appVersion}`,
        has_update: false,
        release_notes: dict.settings.integration.fallbackReleaseNotes(appVersion),
        download_url: "",
        asset_name: "",
        published_at: "",
        release_url: `https://github.com/Menely/L-MPV/releases/tag/v${appVersion}`,
      };
      setFoundUpdate(fallbackInfo);
      onShowUpdate(fallbackInfo);
    } finally {
      setIsLoadingVersionInfo(false);
    }
  };

  return (
    <div className={`modal-overlay ${isClosing ? "modal-overlay--closing" : ""}`} onClick={handleClose}>
      <div
        className={`modal modal--settings ${isClosing ? "modal--closing" : ""}`}
        style={{
          width: 720,
          maxWidth: "95vw",
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка модального окна */}
        <div className="modal__header" style={{ padding: "14px 18px", flexShrink: 0 }}>
          <h2 className="modal__title" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "1.15rem" }}>
            <SlidersHorizontal size={20} color="var(--accent)" /> {dict.settings.title}
          </h2>

          <button
            className="modal__close"
            onClick={handleClose}
            id="btn-settings-close"
            title={dict.settings.close}
            aria-label={dict.settings.close}
          >
            <X size={18} />
          </button>
        </div>

        {/* Навигация по вкладкам */}
        <div className="settings-tabs">
          {[
            { id: "general", label: dict.settings.tabs.general, icon: SlidersHorizontal },
            { id: "appearance", label: dict.settings.tabs.appearance, icon: Palette },
            { id: "presets", label: dict.settings.tabs.presets, icon: Layers },
            { id: "upscaling", label: dict.settings.tabs.upscaling, icon: Sparkles },
            { id: "hotkeys", label: dict.settings.tabs.hotkeys, icon: Keyboard },
            { id: "integration", label: dict.settings.tabs.integration, icon: Link },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id as typeof activeTab)}
                className={`settings-tab-btn ${isActive ? "settings-tab-btn--active" : ""}`}
              >
                <Icon size={16} className="settings-tab-icon" />
                <span className="settings-tab-label">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Тело модального окна */}
        <div className="modal__body" ref={bodyRef} style={{ padding: "16px 20px 10px 20px" }}>
          <div ref={panelRef} className="settings-tab-panel">
          <div key={activeTab} className="settings-tab-content">
            {activeTab === "general" && (
            <GeneralSettingsTab
              multiInstance={multiInstance} setMultiInstance={setMultiInstance}
              saveTracksToVideoDir={saveTracksToVideoDir} setSaveTracksToVideoDir={setSaveTracksToVideoDir}
              autoLoadTracks={autoLoadTracks} setAutoLoadTracks={setAutoLoadTracks}
              autoSelectExternalAudio={autoSelectExternalAudio} setAutoSelectExternalAudio={setAutoSelectExternalAudio}
              playNextOnEnd={playNextOnEnd} setPlayNextOnEnd={setPlayNextOnEnd}
              hotloadEnabled={hotloadEnabled} setHotloadEnabled={setHotloadEnabled}
              hideControlsInUpperHalf={hideControlsInUpperHalf} setHideControlsInUpperHalf={setHideControlsInUpperHalf}
              openSections={openSections} onToggleSection={toggleSection}
              screenshotDir={screenshotDir}
              handlePickFolder={handlePickFolder}
              handleResetDefault={handleResetDefault}
              showTrackNames={showTrackNames}
              setShowTrackNames={setShowTrackNames}
              subtitlesAvoidUi={subtitlesAvoidUi}
              setSubtitlesAvoidUi={setSubtitlesAvoidUi}
            />
          )}

          {activeTab === "appearance" && (
            <AppearanceSettingsTab
              activeColor={activeColor} setActiveColor={setActiveColor}
              uiRadius={uiRadius} saveUiRadius={saveUiRadius} setUiRadius={setUiRadius}
              uiScale={uiScale} saveUiScale={saveUiScale} setUiScale={setUiScale}
              uiOpacity={uiOpacity} saveUiOpacity={saveUiOpacity} setUiOpacity={setUiOpacity}
              uiFont={uiFont} saveUiFont={saveUiFont} setUiFont={setUiFont}
              timePosition={timePosition} saveTimePosition={saveTimePosition} setTimePosition={setTimePosition}
              timeFormat={timeFormat} saveTimeFormat={saveTimeFormat} setTimeFormat={setTimeFormat}
              controlBarStyle={controlBarStyle} saveControlBarStyle={saveControlBarStyle} setControlBarStyle={setControlBarStyle}
              ambientSettings={ambientSettings} updateAmbient={updateAmbient}
              visibleButtons={visibleButtons} setVisibleButtons={setVisibleButtons}
              skipOpeningSeconds={skipOpeningSeconds} setSkipOpeningSeconds={setSkipOpeningSeconds}
              animationsEnabled={animationsEnabled} setAnimationsEnabled={setAnimationsEnabled}
              openSections={openSections} onToggleSection={toggleSection}
              getEffectiveAccentColor={getEffectiveAccentColor}
            />
          )}

          {activeTab === "presets" && (
            <div className="modal__section" style={{ display: "flex", flexDirection: "column" }}>
              <PresetsSection onPresetApplied={handlePresetApplied} />
            </div>
          )}

          {activeTab === "upscaling" && (
            <div className="modal__section" style={{ display: "flex", flexDirection: "column" }}>
              <UpscalingSettingsSection onRecordingChange={setIsRecordingHotkey} />
            </div>
          )}

          {activeTab === "hotkeys" && (
            <HotkeysSettingsTab
              openSections={openSections}
              onToggleSection={toggleSection}
              onRecordingChange={setIsRecordingHotkey}
            />
          )}

          {activeTab === "integration" && (
            <IntegrationSettingsTab />
          )}
          </div>
          </div>
        </div>
        {/* Футер с версией приложения и проверкой обновлений */}
        <div className="settings-footer">
          <div className="settings-footer__left">
            {/* Иконки социальных сетей слева от названия L-MPV */}
            <div className="settings-footer__icons">
              <button
                type="button"
                onClick={() => openUrl("https://github.com/Menely/L-MPV")}
                className="settings-footer__icon-btn hover-bright"
                title={dict.settings.integration.githubTooltip}
              >
                <GithubIcon size={19} />
              </button>

              <button
                type="button"
                onClick={() => openUrl("https://t.me/+pI8qa9mSkINkYmFi")}
                className="settings-footer__icon-btn hover-bright"
                title={dict.settings.integration.telegramTooltip}
              >
                <TelegramIcon size={19} />
              </button>
            </div>

            <span className="settings-footer__title">L-MPV</span>

            <button
              type="button"
              onClick={handleShowVersionInfo}
              disabled={isLoadingVersionInfo}
              className="settings-footer__btn settings-footer__btn--version"
            >
              {isLoadingVersionInfo && <Loader2 size={11} className="animate-spin" />}
              <span>v{appVersion}</span>
            </button>

            <button
              type="button"
              onClick={handleCheckForUpdates}
              disabled={isCheckingUpdate}
              className="settings-footer__btn settings-footer__btn--check"
            >
              {isCheckingUpdate ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>{dict.settings.integration.checking}</span>
                </>
              ) : (
                <>
                  <RefreshCw size={12} />
                  <span>{dict.settings.integration.checkUpdates}</span>
                </>
              )}
            </button>

            {updateStatus && (
              foundUpdate && onShowUpdate ? (
                <button
                  type="button"
                  onClick={() => onShowUpdate(foundUpdate)}
                  className="settings-footer__btn settings-footer__btn--update"
                >
                  <Sparkles size={12} />
                  <span>{updateStatus}</span>
                </button>
              ) : (
                <span
                  style={{
                    fontSize: "0.78rem",
                    color: isUpdateFound ? "var(--accent)" : "var(--text-muted)",
                    marginLeft: 4,
                  }}
                >
                  {updateStatus}
                </span>
              )
            )}
          </div>
          <span style={{ fontSize: "0.76rem" }}>{dict.settings.integration.portableEdition}</span>
        </div>
      </div>
    </div>
  );
}
