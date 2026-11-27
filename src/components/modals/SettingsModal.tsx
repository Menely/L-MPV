import { SettingsFooter } from "../settings/components/SettingsFooter";
import { applyAmbientPreview, saveAmbientSettings } from "../../utils/ambientPreviewQueue";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useIsPresent } from "motion/react";
import { MotionSurface } from "../motion/MotionSurface";
import { SelectionRail } from "../motion/SelectionRail";
import { notifyLiquidGlassAnimation } from "../../theme/liquidGlass/LiquidGlassSync";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Keyboard,
  SlidersHorizontal,
  Palette,
  Link,
  Sparkles,
  Layers,
  X,
  Settings,
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
} from "../../theme/controlBarStyle";
import {
  createDefaultAmbientSettings,
  normalizeAmbientSettings,
} from "../../utils/ambientSettingsUtils";
import type { AmbientSettings } from "../../utils/ambientSettingsUtils";
import {
  getSavedSeekStepSeconds,
  getSavedSkipOpeningSeconds,
} from "../../utils/seekUtils";
import { UpdateInfo } from "./UpdateModal";
import { PresetsSection } from "../settings/sections/PresetsSection";
import { UpscalingSettingsSection } from "../settings/sections/UpscalingSettingsSection";
import { HotkeysSettingsTab } from "../settings/tabs/HotkeysSettingsTab";
import { IntegrationSettingsTab } from "../settings/tabs/IntegrationSettingsTab";
import { AppearanceSettingsTab } from "../settings/tabs/AppearanceSettingsTab";
import { GeneralSettingsTab } from "../settings/tabs/GeneralSettingsTab";
import { useSettingsTabTransition } from "../settings/lib/useSettingsTabTransition";
import {
  getSettingsViewSession,
  sectionIdForModalTab,
  updateSettingsViewSession,
} from "../settings/lib/settingsViewSession";
import {
  preloadPresetsSettings,
  preloadUpscaleSettings,
} from "../settings/lib/settingsTabPreload";
import { preloadSystemDiagnostics } from "../settings/lib/systemDiagnostics";
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
} from "../../theme/tokens";

export type { AmbientSettings } from "../../utils/ambientSettingsUtils";

interface SettingsModalProps {
  onClose: () => void;
  onShowUpdate?: (info: UpdateInfo) => void;
}

export { AccordionSection } from "../settings/components/AccordionSection";
export type { AccordionSectionProps } from "../settings/components/AccordionSection";

// Both appearances fill up to the safe vertical bounds between the titlebar and controls.
const SETTINGS_MODAL_MAX_HEIGHT = "100%";

const SETTINGS_TABS = [
  "general",
  "appearance",
  "presets",
  "upscaling",
  "hotkeys",
  "integration",
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number];

const MemoizedGeneralSettingsTab = React.memo(GeneralSettingsTab);
const MemoizedAppearanceSettingsTab = React.memo(AppearanceSettingsTab);
const MemoizedPresetsSection = React.memo(PresetsSection);
const MemoizedUpscalingSettingsSection = React.memo(UpscalingSettingsSection);
const MemoizedHotkeysSettingsTab = React.memo(HotkeysSettingsTab);
const MemoizedIntegrationSettingsTab = React.memo(IntegrationSettingsTab);

export function SettingsModal({ onClose, onShowUpdate }: SettingsModalProps) {
  const [screenshotDir, setScreenshotDir] = useState<string>("");
  const [uiOpacity, setUiOpacity] = useState<number>(() => getSavedUiOpacity());

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
  const [appVersion, setAppVersion] = useState<string>("2.8.0");
  const [visibleButtons, setVisibleButtons] = useState<Record<string, boolean>>({});
  const [skipOpeningSeconds, setSkipOpeningSeconds] = useState<number>(() => getSavedSkipOpeningSeconds());
  const [seekStepSeconds, setSeekStepSeconds] = useState<number>(() => getSavedSeekStepSeconds());
  const [hotloadEnabled, setHotloadEnabled] = useState<boolean>(() => localStorage.getItem('l-mpv-hotload-enabled') === 'true');
  const [hideControlsInUpperHalf, setHideControlsInUpperHalf] = useState<boolean>(() => localStorage.getItem('l-mpv-hide-controls-upper-half') === 'true');
    const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
    const [uiRadius, setUiRadius] = useState<{ level: UiRadiusLevel; value: number }>(() => getSavedUiRadius());
  const [uiScale, setUiScale] = useState<{ mode: UiScaleMode; value: number }>(() => getSavedUiScale());
  const [uiFont, setUiFont] = useState<UiFontId>(() => getSavedUiFont());
  const [timePosition, setTimePosition] = useState<TimeDisplayPosition>(() => getSavedTimePosition());
  const [timeFormat, setTimeFormat] = useState<TimeFormatMode>(() => getSavedTimeFormat());
  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() => getSavedControlBarStyle());
  const isCapsule = controlBarStyle === "capsule";
  const initialViewSession = getSettingsViewSession();
  const [activeTab, setActiveTab] = useState<SettingsTabId>(() => {
    const saved = initialViewSession.modalTab as SettingsTabId;
    return SETTINGS_TABS.includes(saved) ? saved : "general";
  });
  const { bodyRef, panelRef, beginSwitch } = useSettingsTabTransition(activeTab, SETTINGS_TABS);
  const { dict } = useTranslation();

  // Preserve the layout tween; SelectionRail carries navigation motion.
  const handleTabChange = useCallback((next: SettingsTabId) => {
    if (next === "presets") preloadPresetsSettings();
    if (next === "upscaling") preloadUpscaleSettings();
    if (beginSwitch(next)) {
      notifyLiquidGlassAnimation(340);
      setActiveTab(next);
    }
  }, [beginSwitch]);

  const isPresent = useIsPresent();
  const updatePresentRef = useRef(isPresent);
  updatePresentRef.current = isPresent;
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const handleClose = onClose;

  useEffect(() => {
    preloadPresetsSettings();
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const modal = modalRef.current;
    return () => {
      const focused = document.activeElement;
      if (focused === document.body || (focused && modal?.contains(focused))) {
        returnFocusRef.current?.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    if (!isPresent) return;
    const frame = requestAnimationFrame(() => {
      if (!modalRef.current?.contains(document.activeElement)) closeButtonRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isPresent]);

  // Навигация стрелками влево и вправо для переключения категорий настроек
  useEffect(() => {
    if (!isPresent) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".color-picker-modal")) return;

      if (e.key === "Tab" && modalRef.current) {
        const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        )).filter((element) => !element.closest("[inert]"));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (first && last) {
          if (e.shiftKey && (document.activeElement === first || !modalRef.current.contains(document.activeElement))) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && (document.activeElement === last || !modalRef.current.contains(document.activeElement))) {
            e.preventDefault();
            first.focus();
          }
        }
      }

      if (isRecordingHotkey) return;

      if (e.key === "Escape") {
        if (modalRef.current?.querySelector('.confirm-dialog[aria-modal="true"]')) return;
        e.preventDefault();
        e.stopPropagation();
        handleClose();
        return;
      }

      if (target?.getAttribute("role") === "slider") return;

      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
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
  }, [activeTab, isRecordingHotkey, handleClose, handleTabChange, isPresent]);

  // Синхронизация локальных состояний SettingsModal при применении любого пресета
  const handlePresetApplied = useCallback((preset: SettingsPreset) => {
    const { data } = preset;
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
    if (typeof data.seekStepSeconds === "number") setSeekStepSeconds(data.seekStepSeconds);
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
      setSkipOpeningSeconds(getSavedSkipOpeningSeconds());
      setSeekStepSeconds(getSavedSeekStepSeconds());
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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => initialViewSession.openSections,
  );

  useEffect(() => {
    updateSettingsViewSession({
      modalTab: activeTab,
      panelSection: sectionIdForModalTab(activeTab),
      openSections,
    });
  }, [activeTab, openSections]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const savedScrollTop = getSettingsViewSession().modalScrollTop;
    const restoreFrame = requestAnimationFrame(() => {
      body.scrollTop = savedScrollTop;
    });
    const handleScroll = () => {
      updateSettingsViewSession({ modalScrollTop: body.scrollTop });
    };
    body.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(restoreFrame);
      body.removeEventListener("scroll", handleScroll);
      updateSettingsViewSession({ modalScrollTop: body.scrollTop });
    };
  }, [bodyRef]);

  const toggleSection = useCallback((id: string) => {
    notifyLiquidGlassAnimation(280);
    setOpenSections((prev) => {
      if (prev[id]) {
        return {};
      }
      return { [id]: true };
    });
  }, []);

  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [foundUpdate, setFoundUpdate] = useState<UpdateInfo | null>(null);
  const updateMountedRef = useRef(false);
  const updateRequestRef = useRef(0);
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
  const ambientSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const ambientSaveRevisionRef = useRef(0);
  const ambientMountedRef = useRef(true);

  const flushAmbientPreview = () => {
    ambientPreviewRafRef.current = null;
    const settings = pendingPreviewRef.current;
    pendingPreviewRef.current = null;
    if (settings) {
      applyAmbientPreview(settings).catch((err) => {
        console.error("Ошибка предпросмотра Blur:", err);
      });
    }
  };

  const scheduleAmbientPreview = (settings: AmbientSettings) => {
    pendingPreviewRef.current = settings;
    if (ambientPreviewRafRef.current === null) {
      ambientPreviewRafRef.current = requestAnimationFrame(flushAmbientPreview);
    }
  };

  useEffect(() => {
    ambientMountedRef.current = true;
    return () => {
      ambientMountedRef.current = false;
    };
  }, []);

  const queueAmbientSave = useCallback(function queueAmbientSave(
    settings: AmbientSettings,
    revision = ++ambientSaveRevisionRef.current,
  ) {
    // Submit now: the shared queue owns ordering across both views and presets.
    const request = saveAmbientSettings(settings)
      .then(() => {
        if (revision === ambientSaveRevisionRef.current) {
          isAmbientDirtyRef.current = false;
        }
      });
    ambientSaveQueueRef.current = request.catch((error) => {
      console.error("Ошибка сохранения настроек Blur:", error);
      if (revision === ambientSaveRevisionRef.current && ambientMountedRef.current) {
        isAmbientDirtyRef.current = true;
        if (ambientSaveTimeoutRef.current !== null) {
          clearTimeout(ambientSaveTimeoutRef.current);
        }
        ambientSaveTimeoutRef.current = setTimeout(() => {
          ambientSaveTimeoutRef.current = null;
          if (revision === ambientSaveRevisionRef.current && ambientMountedRef.current) {
            void queueAmbientSave(settings, revision);
          }
        }, 1000);
      }
    });
    return ambientSaveQueueRef.current;
  }, []);

  // Сброс таймера статуса при размонтировании
  useEffect(() => {
    updateMountedRef.current = true;
    return () => {
      updateMountedRef.current = false;
      updateRequestRef.current += 1;
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
        applyAmbientPreview(settings).catch(console.error);
      }
      if (ambientSaveTimeoutRef.current) {
        clearTimeout(ambientSaveTimeoutRef.current);
        ambientSaveTimeoutRef.current = null;
      }
      if (isAmbientDirtyRef.current) {
        isAmbientDirtyRef.current = false;
        void queueAmbientSave(
          ambientSettingsRef.current,
          ambientSaveRevisionRef.current,
        );
      }
    };
  }, [queueAmbientSave]);

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
          ambientSaveRevisionRef.current += 1;
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
        .catch((e) => console.error("Ошибка загрузки настроек Blur:", e));
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
    });
    const revision = ++ambientSaveRevisionRef.current;
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
        void queueAmbientSave(updated, revision);
    } else {
      isAmbientDirtyRef.current = true;
      ambientSaveTimeoutRef.current = setTimeout(async () => {
        isAmbientDirtyRef.current = false;
        try {
        await queueAmbientSave(updated, revision);
        } catch (err) {
          console.error("Ошибка отложенного сохранения настроек Blur:", err);
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
    if (isCheckingUpdate || isLoadingVersionInfo || !updatePresentRef.current) return;
    const request = ++updateRequestRef.current;
    setIsCheckingUpdate(true);
    setUpdateStatus(null);
    setFoundUpdate(null);
    if (updateStatusTimerRef.current) {
      clearTimeout(updateStatusTimerRef.current);
      updateStatusTimerRef.current = null;
    }

    try {
      const info = await invoke<UpdateInfo>("check_for_updates");
      if (!updateMountedRef.current || !updatePresentRef.current || request !== updateRequestRef.current) return;
      setFoundUpdate(info);
      if (info.has_update) {
        setUpdateStatus(dict.settings.integration.updateFound(info.latest_version.replace(/^[vV]/, "")));
        if (onShowUpdate) {
          onShowUpdate(info);
        }
      } else {
        setUpdateStatus(dict.settings.integration.upToDate);
        updateStatusTimerRef.current = setTimeout(() => setUpdateStatus(null), 4000);
      }
    } catch (err) {
      if (!updateMountedRef.current || !updatePresentRef.current || request !== updateRequestRef.current) return;
      console.error("Ошибка проверки обновлений:", err);
      setUpdateStatus(dict.settings.integration.checkFailed);
      updateStatusTimerRef.current = setTimeout(() => setUpdateStatus(null), 4000);
    } finally {
      if (updateMountedRef.current && request === updateRequestRef.current) setIsCheckingUpdate(false);
    }
  };

  // Показ информации о текущей установленной версии и её чейнджлога (при клике на v{appVersion})
  const handleShowVersionInfo = async () => {
    if (!onShowUpdate || isLoadingVersionInfo || isCheckingUpdate || !updatePresentRef.current) return;

    if (foundUpdate) {
      onShowUpdate(foundUpdate);
      return;
    }

    const request = ++updateRequestRef.current;
    setIsLoadingVersionInfo(true);
    try {
      const info = await invoke<UpdateInfo>("check_for_updates");
      if (!updateMountedRef.current || !updatePresentRef.current || request !== updateRequestRef.current) return;
      setFoundUpdate(info);
      onShowUpdate(info);
    } catch (err) {
      if (!updateMountedRef.current || !updatePresentRef.current || request !== updateRequestRef.current) return;
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
      if (updateMountedRef.current && request === updateRequestRef.current) setIsLoadingVersionInfo(false);
    }
  };

  const tabItems = [
    { id: "general" as const, label: dict.settings.tabs.general, icon: SlidersHorizontal },
    { id: "appearance" as const, label: dict.settings.tabs.appearance, icon: Palette },
    { id: "presets" as const, label: dict.settings.tabs.presets, icon: Layers },
    { id: "upscaling" as const, label: dict.settings.tabs.upscaling, icon: Sparkles },
    { id: "hotkeys" as const, label: dict.settings.tabs.hotkeys, icon: Keyboard },
    { id: "integration" as const, label: dict.settings.tabs.integration, icon: Link },
  ];

  const renderTabContent = () => (
    <div key={activeTab} className="settings-tab-content">
      {activeTab === "general" && (
        <MemoizedGeneralSettingsTab
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
        <MemoizedAppearanceSettingsTab
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
          seekStepSeconds={seekStepSeconds} setSeekStepSeconds={setSeekStepSeconds}
          animationsEnabled={animationsEnabled} setAnimationsEnabled={setAnimationsEnabled}
          openSections={openSections} onToggleSection={toggleSection}
        />
      )}

      {activeTab === "presets" && (
        <MemoizedPresetsSection onPresetApplied={handlePresetApplied} />
      )}

      {activeTab === "upscaling" && (
        <div className="modal__section col">
          <MemoizedUpscalingSettingsSection onRecordingChange={setIsRecordingHotkey} />
        </div>
      )}

      {activeTab === "hotkeys" && (
        <MemoizedHotkeysSettingsTab
          openSections={openSections}
          onToggleSection={toggleSection}
          onRecordingChange={setIsRecordingHotkey}
        />
      )}

      {activeTab === "integration" && (
        <MemoizedIntegrationSettingsTab />
      )}
    </div>
  );

  const footerElement = (
    <SettingsFooter
      isCapsule={isCapsule}
      appVersion={appVersion}
      isLoadingVersionInfo={isLoadingVersionInfo}
      isCheckingUpdate={isCheckingUpdate}
      updateStatus={updateStatus}
      foundUpdate={foundUpdate}
      onShowVersionInfo={handleShowVersionInfo}
      onCheckForUpdates={handleCheckForUpdates}
      onShowUpdate={onShowUpdate}
    />
  );

  return (
    <MotionSurface kind="settingsBackdrop" className="modal-overlay settings-modal-overlay" onClick={handleClose}>
      {!isCapsule ? (
        /* ─── КЛАССИЧЕСКИЙ РЕЖИМ (Модерн, Прикрепленный) ─── */
        <MotionSurface
          kind="settingsDialog"
          ref={modalRef}
          className="modal modal--settings"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-modal-title"
          style={{
            width: 720,
            maxWidth: "min(95vw, calc(100vw / var(--ui-scale, 1) - 24px))",
            maxHeight: SETTINGS_MODAL_MAX_HEIGHT,
            display: "flex",
            flexDirection: "column",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Шапка модального окна с шестерёнкой */}
          <div className="modal__header" style={{ flexShrink: 0 }}>
            <h2
              id="settings-modal-title"
              className="modal__title"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <Settings size={20} color="var(--accent-text, var(--accent))" /> {dict.settings.title}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              className="modal__close"
              onClick={handleClose}
              id="btn-settings-close"
              aria-label={dict.settings.close}
            >
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>

          {/* Навигация по вкладкам */}
          <SelectionRail activeKey={activeTab} className="settings-tabs">
            {tabItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  onMouseEnter={() => {
                    if (tab.id === "presets") preloadPresetsSettings();
                    if (tab.id === "upscaling") preloadUpscaleSettings();
                    if (tab.id === "integration") preloadSystemDiagnostics();
                  }}
                  className={`settings-tab-btn ${isActive ? "settings-tab-btn--active" : ""}`}
                  aria-current={isActive ? "true" : undefined}
                >
                  <Icon size={16} className="settings-tab-icon" />
                  <span className="settings-tab-label">{tab.label}</span>
                </button>
              );
            })}
          </SelectionRail>

          {/* Тело модального окна */}
          <div className="modal__body" ref={bodyRef} style={{ padding: "var(--settings-section-padding) 20px" }}>
            <div ref={panelRef} className="settings-tab-panel">
              {renderTabContent()}
            </div>
          </div>

          {/* Футер с версией приложения и проверкой обновлений */}
          {footerElement}
        </MotionSurface>
      ) : (
        /* ─── ОСТРОВНОЙ РЕЖИМ (Стиль «Капсула») ─── */
        <MotionSurface
          kind="settingsDialog"
          ref={modalRef}
          className="modal modal--settings modal--settings-capsule"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-modal-title"
          style={{
            width: 720,
            maxWidth: "min(95vw, calc(100vw / var(--ui-scale, 1) - 24px))",
            maxHeight: SETTINGS_MODAL_MAX_HEIGHT,
            display: "flex",
            flexDirection: "column",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Верхний ряд: 3 самостоятельные карточки-островка */}
          <div className="settings-capsule-header">
            <h2 id="settings-modal-title" className="sr-only">
              {dict.settings.title}
            </h2>

            {/* Карточка 1: Шестерёнка */}
            <div
              className="settings-card settings-card--gear"
              aria-label={dict.settings.title}
            >
              <Settings size={20} color="var(--accent-text, var(--accent))" />
            </div>

            {/* Карточка 2: Вкладки */}
            <SelectionRail activeKey={activeTab} className="settings-card settings-card--tabs">
              {tabItems.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    onMouseEnter={() => {
                      if (tab.id === "presets") preloadPresetsSettings();
                      if (tab.id === "upscaling") preloadUpscaleSettings();
                      if (tab.id === "integration") preloadSystemDiagnostics();
                    }}
                    className={`settings-tab-btn ${isActive ? "settings-tab-btn--active" : ""}`}
                    aria-label={tab.label}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <Icon size={14} className="settings-tab-icon" />
                    <span className="settings-tab-label">{tab.label}</span>
                  </button>
                );
              })}
            </SelectionRail>

            {/* Карточка 3: Крестик */}
            <div className="settings-card settings-card--close">
              <button
                ref={closeButtonRef}
                type="button"
                className="island-action"
                onClick={handleClose}
                id="btn-settings-close"
                aria-label={dict.settings.close}
              >
                <X size={20} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {/* Карточка 2: Основное тело настроек */}
          <div className="settings-card settings-card--body">
            <div className="settings-card__scroll-container" ref={bodyRef}>
              <div ref={panelRef} className="settings-tab-panel">
                {renderTabContent()}
              </div>
            </div>
          </div>

          {/* Нижний ряд: 4 карточки-островка футера */}
          {footerElement}
        </MotionSurface>
      )}
    </MotionSurface>
  );
}
