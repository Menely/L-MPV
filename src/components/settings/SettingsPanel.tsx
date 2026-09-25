import { useState, useEffect, useLayoutEffect, useRef, useCallback, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
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
import { UpdateInfo } from "../modals/UpdateModal";
import { getEffectiveAccentColor } from "../../utils/colorUtils";
import { PresetsSection } from "../settings/PresetsSection";
import { UpscalingSettingsSection } from "../settings/UpscalingSettingsSection";
import { HotkeysSettingsTab } from "../settings/HotkeysSettingsTab";
import { IntegrationSettingsTab } from "../settings/IntegrationSettingsTab";
import { AppearanceSettingsTab } from "../settings/AppearanceSettingsTab";
import { GeneralSettingsTab } from "../settings/GeneralSettingsTab";
import {
  preloadPresetsSettings,
  preloadUpscaleSettings,
} from "../settings/settingsTabPreload";
import { isMotionAllowed, getCloseTimeoutMs } from "../../utils/animationUtils";
import {
  getSettingsViewSession,
  modalTabForSection,
  updateSettingsViewSession,
} from "./settingsViewSession";
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
  getActiveUiScale,
} from "../../utils/uiThemeUtils";
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

export type { AmbientSettings } from "../../utils/ambientSettingsUtils";

interface SettingsPanelProps {
  onClose: () => void;
  onShowUpdate?: (info: UpdateInfo) => void;
}

export { AccordionSection } from "../settings/AccordionSection";
export type { AccordionSectionProps } from "../settings/AccordionSection";

const SECTION_DEFS = [
  { id: "section-general",     Icon: SlidersHorizontal, labelKey: "general"      },
  { id: "section-appearance",  Icon: Palette,           labelKey: "appearance"   },
  { id: "section-presets",     Icon: Layers,            labelKey: "presets"      },
  { id: "section-upscaling",   Icon: Sparkles,          labelKey: "upscaling"    },
  { id: "section-hotkeys",     Icon: Keyboard,          labelKey: "hotkeys"      },
  { id: "section-integration", Icon: Link,              labelKey: "integration"  },
] as const;

type SectionId = (typeof SECTION_DEFS)[number]["id"];

const MemoizedGeneralSettingsTab = memo(GeneralSettingsTab);
const MemoizedAppearanceSettingsTab = memo(AppearanceSettingsTab);
const MemoizedPresetsSection = memo(PresetsSection);
const MemoizedUpscalingSettingsSection = memo(UpscalingSettingsSection);
const MemoizedHotkeysSettingsTab = memo(HotkeysSettingsTab);
const MemoizedIntegrationSettingsTab = memo(IntegrationSettingsTab);

interface SectionBlockProps {
  id: string;
  Icon: React.FC<{ size?: number }>;
  label: string;
  isMounted: boolean;
  children: React.ReactNode;
}

function SectionBlock({ id, Icon, label, isMounted, children }: SectionBlockProps) {
  return (
    <div id={id} className="settings-section-block" data-settings-section={id}>
      <div className="settings-section-anchor">
        <Icon size={14} />
        {label}
      </div>
      {isMounted ? children : <div className="settings-section-placeholder" aria-hidden="true" />}
    </div>
  );
}

export function SettingsPanel({ onClose, onShowUpdate }: SettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const initialViewSession = getSettingsViewSession();
  const savedPanelSection = initialViewSession.panelSection as SectionId;
  const initialPanelSection = SECTION_DEFS.some(({ id }) => id === savedPanelSection)
    ? savedPanelSection
    : "section-general";
  const [activeSection, setActiveSection] = useState<SectionId>(initialPanelSection);
  const [mountedSections, setMountedSections] = useState<Set<SectionId>>(
    () => new Set<SectionId>([initialPanelSection]),
  );

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
  
  const { dict } = useTranslation();

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

      const updateLayout = () => {
        const scale = Math.max(0.5, getActiveUiScale());
        const viewportWidth = window.innerWidth;
        const layoutViewportWidth = viewportWidth / scale;
        const width = layoutViewportWidth <= 768
          ? layoutViewportWidth
          : Math.min(720, Math.max(560, layoutViewportWidth * 0.64));
        const available = Math.max(0, layoutViewportWidth - width);
        document.body.style.setProperty("--settings-panel-css-width", `${width}px`);
        document.body.style.setProperty("--settings-panel-offset", `${width}px`);
        document.body.style.setProperty("--settings-controls-left", `${width + 14}px`);
        document.body.style.setProperty("--settings-controls-width", `${Math.max(0, available - 28)}px`);
        document.body.style.setProperty("--settings-docked-left", `${width}px`);
        document.body.style.setProperty("--settings-docked-width", `${available}px`);
      };

    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(panel);
    window.addEventListener("resize", updateLayout);
    window.addEventListener("l-mpv-ui-scale-changed", updateLayout);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("l-mpv-ui-scale-changed", updateLayout);
      document.body.style.removeProperty("--settings-panel-css-width");
      document.body.style.removeProperty("--settings-panel-offset");
      document.body.style.removeProperty("--settings-controls-left");
      document.body.style.removeProperty("--settings-controls-width");
      document.body.style.removeProperty("--settings-docked-left");
      document.body.style.removeProperty("--settings-docked-width");
    };
  }, []);

  // Навигация клавишами
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".color-picker-modal")) return;

      if (isRecordingHotkey) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isRecordingHotkey, handleClose]);

  const markSectionMounted = useCallback((id: SectionId) => {
    setMountedSections((previous) => {
      if (previous.has(id)) return previous;
      const next = new Set(previous);
      next.add(id);
      return next;
    });
    if (id === "section-presets") preloadPresetsSettings();
    if (id === "section-upscaling") preloadUpscaleSettings();
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const activeObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id as SectionId);
        }
      },
      {
        root,
        rootMargin: "0px 0px -65% 0px",
        threshold: 0,
      },
    );

    const preloadObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            markSectionMounted(entry.target.id as SectionId);
          }
        });
      },
      {
        root,
        rootMargin: "480px 0px 480px 0px",
        threshold: 0,
      },
    );

    SECTION_DEFS.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) {
        activeObserver.observe(element);
        preloadObserver.observe(element);
      }
    });

    return () => {
      activeObserver.disconnect();
      preloadObserver.disconnect();
    };
  }, [markSectionMounted]);

  const scrollToSection = useCallback((id: SectionId) => {
    setActiveSection(id);
    markSectionMounted(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: isMotionAllowed() ? "smooth" : "auto",
      block: "start",
    });
  }, [markSectionMounted]);

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
      setSubtitlesAvoidUi(localStorage.getItem("l-mpv-subtitles-avoid-ui") === "true");
      setAnimationsEnabled(localStorage.getItem("l-mpv-animations-enabled") !== "false");
      setShowTrackNames(localStorage.getItem("l-mpv-show-track-names") !== "false");
      setHotloadEnabled(localStorage.getItem("l-mpv-hotload-enabled") === "true");
      setHideControlsInUpperHalf(localStorage.getItem("l-mpv-hide-controls-upper-half") === "true");
      setSaveTracksToVideoDir(localStorage.getItem("l-mpv-save-tracks-to-video-dir") !== "false");
      const skipSeconds = Number(localStorage.getItem("l-mpv-skip-opening-seconds") || 90);
      setSkipOpeningSeconds(Number.isFinite(skipSeconds) ? Math.min(600, Math.max(1, skipSeconds)) : 90);
      setActiveColor(localStorage.getItem("l-mpv-accent-color") || "#7fc7ff");
      try {
        const rawButtons = localStorage.getItem("l-mpv-visible-buttons");
        if (rawButtons) setVisibleButtons(JSON.parse(rawButtons));
      } catch {
        setVisibleButtons({});
      }
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

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => initialViewSession.openSections,
  );

  useEffect(() => {
    updateSettingsViewSession({
      panelSection: activeSection,
      modalTab: modalTabForSection(activeSection),
      openSections,
    });
  }, [activeSection, openSections]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const savedScrollTop = getSettingsViewSession().panelScrollTop;
    const restoreFrame = requestAnimationFrame(() => {
      scrollElement.scrollTop = savedScrollTop;
    });
    const handleScroll = () => {
      updateSettingsViewSession({ panelScrollTop: scrollElement.scrollTop });
    };
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(restoreFrame);
      scrollElement.removeEventListener("scroll", handleScroll);
      updateSettingsViewSession({ panelScrollTop: scrollElement.scrollTop });
    };
  }, []);

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [isUpdateFound, setIsUpdateFound] = useState<boolean>(false);
  const [foundUpdate, setFoundUpdate] = useState<UpdateInfo | null>(null);
  const [isLoadingVersionInfo, setIsLoadingVersionInfo] = useState<boolean>(false);
  const updateStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateRequestRef = useRef(0);

  const ambientSettingsRef = useRef<AmbientSettings>(ambientSettings);
  ambientSettingsRef.current = ambientSettings;
  const isAmbientDirtyRef = useRef<boolean>(false);
  const ambientSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ambientLocalEventRef = useRef(false);
  const ambientPreviewRafRef = useRef<number | null>(null);
  const ambientPreviewInFlightRef = useRef(false);
  const pendingPreviewRef = useRef<AmbientSettings | null>(null);
  const ambientSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const ambientSaveRevisionRef = useRef(0);

  const flushAmbientPreview = useCallback(function flushAmbientPreview() {
    ambientPreviewRafRef.current = null;
    if (ambientPreviewInFlightRef.current) return;
    const settings = pendingPreviewRef.current;
    pendingPreviewRef.current = null;
    if (!settings) return;

    ambientPreviewInFlightRef.current = true;
    invoke("apply_ambient_preview", { settings })
      .catch((err) => {
        console.error("Ошибка предпросмотра Ambient Light:", err);
      })
      .finally(() => {
        ambientPreviewInFlightRef.current = false;
        if (mountedRef.current && pendingPreviewRef.current && ambientPreviewRafRef.current === null) {
          ambientPreviewRafRef.current = requestAnimationFrame(flushAmbientPreview);
        }
      });
  }, []);

  const scheduleAmbientPreview = useCallback((settings: AmbientSettings) => {
    pendingPreviewRef.current = settings;
    if (ambientPreviewRafRef.current === null && !ambientPreviewInFlightRef.current) {
      ambientPreviewRafRef.current = requestAnimationFrame(flushAmbientPreview);
    }
  }, [flushAmbientPreview]);

  const queueAmbientSave = useCallback(function queueAmbientSave(
    settings: AmbientSettings,
    revision = ++ambientSaveRevisionRef.current,
  ) {
    const request = ambientSaveQueueRef.current
      .catch(() => {})
      .then(() => invoke<void>("set_ambient_settings", { settings }))
      .then(() => {
        if (revision === ambientSaveRevisionRef.current) {
          isAmbientDirtyRef.current = false;
        }
      });
    ambientSaveQueueRef.current = request.catch((error) => {
      console.error("Ошибка сохранения настроек Ambient Light:", error);
      if (revision === ambientSaveRevisionRef.current && mountedRef.current) {
        isAmbientDirtyRef.current = true;
        if (ambientSaveTimeoutRef.current !== null) {
          clearTimeout(ambientSaveTimeoutRef.current);
        }
        ambientSaveTimeoutRef.current = setTimeout(() => {
          ambientSaveTimeoutRef.current = null;
          if (revision === ambientSaveRevisionRef.current && mountedRef.current) {
            void queueAmbientSave(settings);
          }
        }, 1000);
      }
    });
    return ambientSaveQueueRef.current;
  }, []);

  // Единый cleanup: таймеры проверки обновлений + ambient RAF/таймаут
  useEffect(() => {
    return () => {
      updateRequestRef.current += 1;
      if (updateStatusTimerRef.current) {
        clearTimeout(updateStatusTimerRef.current);
      }
      if (ambientPreviewRafRef.current !== null) {
        cancelAnimationFrame(ambientPreviewRafRef.current);
        ambientPreviewRafRef.current = null;
      }
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
        void queueAmbientSave(
          ambientSettingsRef.current,
          ambientSaveRevisionRef.current,
        );
      }
    };
  }, [queueAmbientSave]);

  useEffect(() => {
    let effectRevision = 0;
    let ambientRevision = 0;
    const requestEffectRevision = effectRevision;
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
        if (mountedRef.current && requestEffectRevision === effectRevision) setAmbientSettings(normalized);
        return;
      }
      const requestRevision = ambientRevision;
      invoke<unknown>("get_ambient_settings")
        .then((settings) => {
          if (mountedRef.current && requestEffectRevision === effectRevision && requestRevision === ambientRevision) {
            const normalized = normalizeAmbientSettings(settings);
            ambientSettingsRef.current = normalized;
            setAmbientSettings(normalized);
          }
        })
        .catch((e) => console.error("Ошибка загрузки настроек Ambient Light:", e));
    };

    invoke<string>("get_screenshot_dir").then((value) => {
      if (mountedRef.current && requestEffectRevision === effectRevision) setScreenshotDir(value);
    }).catch(console.error);
    invoke<boolean>("get_multi_instance").then((value) => {
      if (mountedRef.current && requestEffectRevision === effectRevision) setMultiInstance(value);
    }).catch(console.error);
    invoke<boolean>("get_auto_load_tracks").then((value) => {
      if (mountedRef.current && requestEffectRevision === effectRevision) setAutoLoadTracks(value);
    }).catch(console.error);
    invoke<boolean>("get_auto_select_external_audio").then((value) => {
      if (mountedRef.current && requestEffectRevision === effectRevision) setAutoSelectExternalAudio(value);
    }).catch(console.error);
    invoke<boolean>("get_play_next_on_end").then((value) => {
      if (mountedRef.current && requestEffectRevision === effectRevision) setPlayNextOnEnd(value);
    }).catch(console.error);
    invoke<boolean>("get_subtitles_avoid_ui").then((val) => {
      if (!mountedRef.current || requestEffectRevision !== effectRevision) return;
      setSubtitlesAvoidUi(val);
      localStorage.setItem("l-mpv-subtitles-avoid-ui", val ? "true" : "false");
    }).catch(console.error);
    invoke<string>("get_app_version").then((value) => {
      if (mountedRef.current && requestEffectRevision === effectRevision) setAppVersion(value);
    }).catch(console.error);
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
      effectRevision += 1;
      ambientRevision += 1;
      window.removeEventListener("l-mpv-ambient-changed", loadAmbient);
    };
  }, []);

  const updateAmbient = useCallback(async (newSettings: Partial<AmbientSettings>, immediateSave: boolean = false) => {
    const updated = normalizeAmbientSettings({
      ...ambientSettingsRef.current,
      ...newSettings,
      sample_widths: {
        ...ambientSettingsRef.current.sample_widths,
        ...newSettings.sample_widths,
      },
    });
    const revision = ++ambientSaveRevisionRef.current;
    ambientSettingsRef.current = updated;
    setAmbientSettings(updated);

    scheduleAmbientPreview(updated);
    ambientLocalEventRef.current = true;
    window.dispatchEvent(new CustomEvent("l-mpv-ambient-changed", { detail: updated }));
    ambientLocalEventRef.current = false;

    if (ambientSaveTimeoutRef.current) {
      clearTimeout(ambientSaveTimeoutRef.current);
      ambientSaveTimeoutRef.current = null;
    }

    if (immediateSave) {
      isAmbientDirtyRef.current = false;
      await queueAmbientSave(updated, revision);
    } else {
      isAmbientDirtyRef.current = true;
      ambientSaveTimeoutRef.current = setTimeout(() => {
        ambientSaveTimeoutRef.current = null;
        isAmbientDirtyRef.current = false;
        void queueAmbientSave(updated, revision);
      }, 400);
    }
  }, [queueAmbientSave, scheduleAmbientPreview]);

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

  const handleResetDefault = async () => {
    try {
      const defaultPath = "screenshots";
      await invoke("set_screenshot_dir", { path: defaultPath });
      setScreenshotDir(defaultPath);
    } catch (e) {
      console.error("Ошибка сброса пути:", e);
    }
  };

  const handleCheckForUpdates = async () => {
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
      if (!mountedRef.current || request !== updateRequestRef.current) return;
      setFoundUpdate(info);
      if (info.has_update) {
        setUpdateStatus(dict.settings.integration.updateFound(info.latest_version.replace(/^[vV]/, "")));
        setIsUpdateFound(true);
        onShowUpdate?.(info);
      } else {
        setUpdateStatus(dict.settings.integration.upToDate);
        setIsUpdateFound(false);
        updateStatusTimerRef.current = setTimeout(() => setUpdateStatus(null), 4000);
      }
    } catch (err) {
      if (!mountedRef.current || request !== updateRequestRef.current) return;
      console.error("Ошибка проверки обновлений:", err);
      setUpdateStatus(dict.settings.integration.checkFailed);
      setIsUpdateFound(false);
      updateStatusTimerRef.current = setTimeout(() => setUpdateStatus(null), 4000);
    } finally {
      if (mountedRef.current && request === updateRequestRef.current) {
        setIsCheckingUpdate(false);
      }
    }
  };

  const handleShowVersionInfo = async () => {
    if (!onShowUpdate || isLoadingVersionInfo) return;

    if (foundUpdate) {
      onShowUpdate(foundUpdate);
      return;
    }

    const request = ++updateRequestRef.current;
    setIsLoadingVersionInfo(true);
    try {
      const info = await invoke<UpdateInfo>("check_for_updates");
      if (!mountedRef.current || request !== updateRequestRef.current) return;
      setFoundUpdate(info);
      onShowUpdate(info);
    } catch (err) {
      if (!mountedRef.current || request !== updateRequestRef.current) return;
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
      if (mountedRef.current && request === updateRequestRef.current) {
        setIsLoadingVersionInfo(false);
      }
    }
  };

  return (
    <div className={`settings-panel-overlay ${isClosing ? "settings-panel-overlay--closing" : ""}`}>
      <div
        ref={panelRef}
        className={`settings-side-panel ${isClosing ? "settings-side-panel--closing" : ""}`}
        role="region"
        aria-label={dict.settings.title}
        inert={isClosing}
      >
        <div className="settings-side-panel__nav">
          <h2 className="settings-side-panel__nav-title" data-tauri-drag-region>
            <SlidersHorizontal size={19} color="var(--accent)" />
            {dict.settings.title}
          </h2>

          <div className="settings-side-panel__nav-sep" />

          {SECTION_DEFS.map(({ id, Icon, labelKey }) => (
            <button
              key={id}
              type="button"
              className={`settings-side-panel__nav-btn ${activeSection === id ? "settings-side-panel__nav-btn--active" : ""}`}
              onClick={() => scrollToSection(id)}
              title={dict.settings.tabs[labelKey as keyof typeof dict.settings.tabs]}
              aria-label={dict.settings.tabs[labelKey as keyof typeof dict.settings.tabs]}
              aria-current={activeSection === id ? "true" : undefined}
            >
              <Icon size={17} />
            </button>
          ))}

          <button
            type="button"
            className="settings-side-panel__close"
            onClick={handleClose}
            title={dict.settings.close}
            aria-label={dict.settings.close}
          >
            <X size={18} />
          </button>
        </div>

        <div className="settings-side-panel__scroll" ref={scrollRef}>
          <SectionBlock
            id="section-general"
            Icon={SlidersHorizontal}
            label={dict.settings.tabs.general}
            isMounted={mountedSections.has("section-general")}
          >
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
          </SectionBlock>

          <SectionBlock
            id="section-appearance"
            Icon={Palette}
            label={dict.settings.tabs.appearance}
            isMounted={mountedSections.has("section-appearance")}
          >
            <MemoizedAppearanceSettingsTab
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
          </SectionBlock>

          <SectionBlock
            id="section-presets"
            Icon={Layers}
            label={dict.settings.tabs.presets}
            isMounted={mountedSections.has("section-presets")}
          >
            <div className="modal__section" style={{ display: "flex", flexDirection: "column" }}>
              <MemoizedPresetsSection onPresetApplied={handlePresetApplied} />
            </div>
          </SectionBlock>

          <SectionBlock
            id="section-upscaling"
            Icon={Sparkles}
            label={dict.settings.tabs.upscaling}
            isMounted={mountedSections.has("section-upscaling")}
          >
            <div className="modal__section" style={{ display: "flex", flexDirection: "column" }}>
              <MemoizedUpscalingSettingsSection onRecordingChange={setIsRecordingHotkey} />
            </div>
          </SectionBlock>

          <SectionBlock
            id="section-hotkeys"
            Icon={Keyboard}
            label={dict.settings.tabs.hotkeys}
            isMounted={mountedSections.has("section-hotkeys")}
          >
            <MemoizedHotkeysSettingsTab
              openSections={openSections}
              onToggleSection={toggleSection}
              onRecordingChange={setIsRecordingHotkey}
            />
          </SectionBlock>

          <SectionBlock
            id="section-integration"
            Icon={Link}
            label={dict.settings.tabs.integration}
            isMounted={mountedSections.has("section-integration")}
          >
            <MemoizedIntegrationSettingsTab />
          </SectionBlock>
        </div>

        <div className="settings-footer">
          <div className="settings-footer__left">
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
          <span className="settings-footer__edition">{dict.settings.integration.portableEdition}</span>
        </div>
      </div>
    </div>
  );
}
