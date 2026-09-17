import { useState, useEffect, useRef, useCallback } from "react";
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
  FolderOpen,
  Camera,
  Keyboard,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Palette,
  Monitor,
  Link,
  Link2,
  Loader2,
  Download,
  AudioLines,
  ExternalLink,
  Trash2,
  Sparkles,
  Layers,
  RefreshCw,
  Play,
  X,
  ChevronDown,
  FileText,
  Zap,
  Film,
  Square,
  Maximize2,
  Type,
  MousePointer2,
} from "lucide-react";
import {
  HOTKEY_ACTIONS,
  getCustomHotkeys,
  saveCustomHotkeys,
  resetCustomHotkeys,
  resetSingleHotkey,
  getKeyDisplay,
} from "../utils/hotkeyUtils";
import { UpdateInfo } from "./UpdateModal";
import { ColorSchemeSection } from "./ColorSchemeSection";
import { getEffectiveAccentColor } from "../utils/colorUtils";
import { VisualizerSettingsSection } from "./VisualizerSettingsSection";
import { PresetsSection } from "./PresetsSection";
import { UpscalingSettingsSection } from "./UpscalingSettingsSection";
import { ControlButtonsPreviewCard } from "./ControlButtonsPreviewCard";
import { SettingsPreset } from "../utils/presetsUtils";
import {
  UiRadiusLevel,
  UI_RADIUS_PRESETS,
  getSavedUiRadius,
  saveUiRadius,
  UiScaleMode,
  UI_SCALE_PRESETS,
  getSavedUiScale,
  saveUiScale,
  getSavedUiOpacity,
  saveUiOpacity,
  UiFontId,
  UI_FONT_PRESETS,
  getSavedUiFont,
  saveUiFont,
} from "../utils/uiThemeUtils";

interface AmbientSettings {
  mode: "off" | "blur" | "color";
  blur_radius: number;
  color: string;
}

interface SettingsModalProps {
  onClose: () => void;
  onShowUpdate?: (info: UpdateInfo) => void;
}

export interface AccordionSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

export function AccordionSection({
  isOpen,
  onToggle,
  icon,
  title,
  badge,
  children,
}: AccordionSectionProps) {
  return (
    <div className={`settings-accordion ${isOpen ? "settings-accordion--open" : ""}`}>
      <button
        type="button"
        className="settings-accordion__header"
        onClick={onToggle}
      >
        <div className="settings-accordion__title">
          <span className="settings-accordion__icon">{icon}</span>
          <span>{title}</span>
          {badge}
        </div>
        <ChevronDown size={18} className="settings-accordion__chevron" />
      </button>
      <div className="settings-accordion__collapse">
        <div className="settings-accordion__inner">
          <div className="settings-accordion__body">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('l-mpv-animations-enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [multiInstance, setMultiInstance] = useState<boolean>(false);
  const [saveTracksToVideoDir, setSaveTracksToVideoDir] = useState<boolean>(true);
  const [autoLoadTracks, setAutoLoadTracks] = useState<boolean>(false);
  const [autoSelectExternalAudio, setAutoSelectExternalAudio] = useState<boolean>(false);
  const [playNextOnEnd, setPlayNextOnEnd] = useState<boolean>(true);
  const [appVersion, setAppVersion] = useState<string>("2.0.2");
  const [visibleButtons, setVisibleButtons] = useState<Record<string, boolean>>({});
  const [skipOpeningSeconds, setSkipOpeningSeconds] = useState<number>(() => Number(localStorage.getItem('l-mpv-skip-opening-seconds') || 90));
  const [hotloadEnabled, setHotloadEnabled] = useState<boolean>(() => localStorage.getItem('l-mpv-hotload-enabled') === 'true');
  const [hideControlsInUpperHalf, setHideControlsInUpperHalf] = useState<boolean>(() => localStorage.getItem('l-mpv-hide-controls-upper-half') === 'true');
  const [customHotkeys, setCustomHotkeys] = useState<Record<string, string[]>>(getCustomHotkeys());
  const [recordingAction, setRecordingAction] = useState<{ id: string, index: number } | null>(null);
  const ignoreClickUntilRef = useRef<number>(0);
  const [uiRadius, setUiRadius] = useState<{ level: UiRadiusLevel; value: number }>(() => getSavedUiRadius());
  const [uiScale, setUiScale] = useState<{ mode: UiScaleMode; value: number }>(() => getSavedUiScale());
  const [uiFont, setUiFont] = useState<UiFontId>(() => getSavedUiFont());
  const [activeTab, setActiveTab] = useState<"general" | "appearance" | "presets" | "upscaling" | "hotkeys" | "integration">("general");

  const [isClosing, setIsClosing] = useState<boolean>(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    const isNoAnim = typeof document !== "undefined" && document.documentElement.classList.contains("no-animations");
    if (isNoAnim) {
      onClose();
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, 140);
  }, [isClosing, onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // Навигация стрелками влево и вправо для переключения категорий настроек
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем переключение, если идет запись горячей клавиши
      if (recordingAction !== null) return;

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

      const tabs: ("general" | "appearance" | "presets" | "upscaling" | "hotkeys" | "integration")[] = [
        "general",
        "appearance",
        "presets",
        "upscaling",
        "hotkeys",
        "integration",
      ];
      const currentIndex = tabs.indexOf(activeTab);

      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const nextIndex = (currentIndex + 1) % tabs.length;
        setActiveTab(tabs[nextIndex]);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        setActiveTab(tabs[prevIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [activeTab, recordingAction, handleClose]);

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
    if (typeof data.animationsEnabled === "boolean") setAnimationsEnabled(data.animationsEnabled);
    if (typeof data.showTrackNames === "boolean") setShowTrackNames(data.showTrackNames);
    if (data.visibleButtons) setVisibleButtons(data.visibleButtons);
    if (data.ambient) setAmbientSettings(data.ambient);
    if (typeof data.saveTracksToVideoDir === "boolean") setSaveTracksToVideoDir(data.saveTracksToVideoDir);
    if (typeof data.hotloadEnabled === "boolean") setHotloadEnabled(data.hotloadEnabled);
    if (typeof data.skipOpeningSeconds === "number") setSkipOpeningSeconds(data.skipOpeningSeconds);
    if (data.customHotkeys) setCustomHotkeys(data.customHotkeys);
  }, []);

  const [integrationLogs, setIntegrationLogs] = useState<string[]>([]);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isUnregistering, setIsUnregistering] = useState<boolean>(false);
  const [isContextMenuRegistered, setIsContextMenuRegistered] = useState<boolean | null>(null);
  const [isContextMenuLoading, setIsContextMenuLoading] = useState<boolean>(false);

  const checkContextMenuStatus = useCallback(async () => {
    try {
      const reg = await invoke<boolean>("is_explorer_context_menu_registered");
      setIsContextMenuRegistered(reg);
    } catch {
      setIsContextMenuRegistered(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "integration") {
      checkContextMenuStatus();
    }
  }, [activeTab, checkContextMenuStatus]);
  const [ambientSettings, setAmbientSettings] = useState<AmbientSettings>({
    mode: "off",
    blur_radius: 100,
    color: "#7fc7ff",
  });

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
    window.addEventListener("l-mpv-ui-radius-changed", handleRadiusChanged);
    window.addEventListener("l-mpv-ui-scale-changed", handleScaleChanged);
    window.addEventListener("l-mpv-ui-opacity-changed", handleOpacityChanged);
    window.addEventListener("l-mpv-ui-font-changed", handleFontChanged);
    return () => {
      window.removeEventListener("l-mpv-ui-radius-changed", handleRadiusChanged);
      window.removeEventListener("l-mpv-ui-scale-changed", handleScaleChanged);
      window.removeEventListener("l-mpv-ui-opacity-changed", handleOpacityChanged);
      window.removeEventListener("l-mpv-ui-font-changed", handleFontChanged);
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
  const updateStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ambientSettingsRef = useRef<AmbientSettings>(ambientSettings);
  ambientSettingsRef.current = ambientSettings;
  const isAmbientDirtyRef = useRef<boolean>(false);
  const ambientSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const loadDir = async () => {
      try {
        const dir = await invoke<string>("get_screenshot_dir");
        setScreenshotDir(dir);
      } catch (e) {
        console.error("Ошибка загрузки папки скриншотов:", e);
      }
    };
    loadDir();

    const savedAccent = localStorage.getItem('l-mpv-accent-color');
    if (savedAccent) {
      setActiveColor(savedAccent);
    }

    const savedShowTracks = localStorage.getItem('l-mpv-show-track-names');
    if (savedShowTracks !== null) {
      setShowTrackNames(savedShowTracks === 'true');
    }

    const savedBtns = localStorage.getItem('l-mpv-visible-buttons');
    if (savedBtns) {
      setVisibleButtons(JSON.parse(savedBtns));
    }

    const savedTrackDirSetting = localStorage.getItem('l-mpv-save-tracks-to-video-dir');
    if (savedTrackDirSetting !== null) {
      setSaveTracksToVideoDir(savedTrackDirSetting === 'true');
    }

    const loadMultiInstance = async () => {
      try {
        const val = await invoke<boolean>("get_multi_instance");
        setMultiInstance(val);
      } catch (e) {
        console.error("Ошибка загрузки multi_instance:", e);
      }
    };
    loadMultiInstance();

    const loadAutoLoadTracks = async () => {
      try {
        const val = await invoke<boolean>("get_auto_load_tracks");
        setAutoLoadTracks(val);
      } catch (e) {
        console.error("Ошибка загрузки настройки auto_load_tracks:", e);
      }
    };
    loadAutoLoadTracks();

    const loadAutoSelectAudio = async () => {
      try {
        const val = await invoke<boolean>("get_auto_select_external_audio");
        setAutoSelectExternalAudio(val);
      } catch (e) {
        console.error("Ошибка загрузки настройки auto_select_external_audio:", e);
      }
    };
    loadAutoSelectAudio();

    const loadPlayNextOnEnd = async () => {
      try {
        const val = await invoke<boolean>("get_play_next_on_end");
        setPlayNextOnEnd(val);
      } catch (e) {
        console.error("Ошибка загрузки настройки play_next_on_end:", e);
      }
    };
    loadPlayNextOnEnd();

    const loadVersion = async () => {
      try {
        const ver = await invoke<string>("get_app_version");
        setAppVersion(ver);
      } catch (e) {
        console.error("Ошибка загрузки версии приложения:", e);
      }
    };
    loadVersion();

    const loadAmbient = async () => {
      try {
        const val = await invoke<AmbientSettings>("get_ambient_settings");
        setAmbientSettings(val);
      } catch (e) {
        console.error("Ошибка загрузки настроек Ambient Light:", e);
      }
    };
    loadAmbient();

    const handleAmbientChanged = () => {
      loadAmbient();
    };
    window.addEventListener("l-mpv-ambient-changed", handleAmbientChanged);

    return () => {
      window.removeEventListener("l-mpv-ambient-changed", handleAmbientChanged);
    };
  }, []);

  // Оптимизированное применение: мгновенный шейдерный preview на GPU + отложенное сохранение на диск (Debounce 400ms)
  const updateAmbient = async (newSettings: Partial<AmbientSettings>, immediateSave: boolean = false) => {
    const updated = { ...ambientSettingsRef.current, ...newSettings };
    ambientSettingsRef.current = updated;
    setAmbientSettings(updated);

    // 1. Мгновенное применение шейдеров в mpv без блокирующего дискового ввода-вывода
    try {
      await invoke("apply_ambient_preview", { settings: updated });
    } catch (err) {
      console.error("Ошибка предпросмотра Ambient Light:", err);
    }

    // 2. Дебаунсинг сохранения настроек в файл config/settings.json
    if (ambientSaveTimeoutRef.current) {
      clearTimeout(ambientSaveTimeoutRef.current);
      ambientSaveTimeoutRef.current = null;
    }

    if (immediateSave) {
      isAmbientDirtyRef.current = false;
      try {
        await invoke("set_ambient_settings", { settings: updated });
        window.dispatchEvent(new Event('l-mpv-ambient-changed'));
      } catch (err) {
        console.error("Ошибка сохранения настроек Ambient Light:", err);
      }
    } else {
      isAmbientDirtyRef.current = true;
      ambientSaveTimeoutRef.current = setTimeout(async () => {
        isAmbientDirtyRef.current = false;
        try {
          await invoke("set_ambient_settings", { settings: updated });
          window.dispatchEvent(new Event('l-mpv-ambient-changed'));
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
        title: "Выберите папку для сохранения скриншотов",
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
    if (updateStatusTimerRef.current) {
      clearTimeout(updateStatusTimerRef.current);
      updateStatusTimerRef.current = null;
    }

    try {
      const info = await invoke<UpdateInfo>("check_for_updates");
      if (info.has_update) {
        setUpdateStatus(`Найдено обновление v${info.latest_version.replace(/^[vV]/, "")}`);
        if (onShowUpdate) {
          onShowUpdate(info);
        }
      } else {
        setUpdateStatus("У вас последняя версия");
        updateStatusTimerRef.current = setTimeout(() => setUpdateStatus(null), 4000);
      }
    } catch (err) {
      console.error("Ошибка проверки обновлений:", err);
      setUpdateStatus("Не удалось проверить");
      updateStatusTimerRef.current = setTimeout(() => setUpdateStatus(null), 4000);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <div className={`modal-overlay ${isClosing ? "modal-overlay--closing" : ""}`} onClick={handleClose}>
      <div
        className={`modal modal--settings ${isClosing ? "modal--closing" : ""}`}
        style={{
          width: 720,
          maxWidth: "95vw",
          maxHeight: "78vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка модального окна */}
        <div className="modal__header" style={{ padding: "14px 18px", flexShrink: 0 }}>
          <h2 className="modal__title" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "1.15rem" }}>
            <SlidersHorizontal size={20} color="var(--accent)" /> Настройки
          </h2>

          <button
            className="modal__close"
            onClick={handleClose}
            id="btn-settings-close"
            title="Закрыть (Esc)"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        {/* Навигация по вкладкам */}
        <div className="settings-tabs">
          {[
            { id: "general", label: "Общие", icon: SlidersHorizontal },
            { id: "appearance", label: "Кастом", icon: Palette },
            { id: "presets", label: "Пресеты", icon: Layers },
            { id: "upscaling", label: "Апскейлинг", icon: Sparkles },
            { id: "hotkeys", label: "Хоткей", icon: Keyboard },
            { id: "integration", label: "Интеграция", icon: Link },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`settings-tab-btn ${isActive ? "settings-tab-btn--active" : ""}`}
              >
                <Icon size={16} className="settings-tab-icon" />
                <span className="settings-tab-label">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Тело модального окна */}
        <div className="modal__body" style={{ padding: "20px" }}>
          <div key={activeTab} className="settings-tab-content">
            {activeTab === "general" && (
              <div className="modal__section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* 1. Папка сохранения скриншотов */}
              <AccordionSection
                isOpen={!!openSections["gen_screenshots"]}
                onToggle={() => toggleSection("gen_screenshots")}
                icon={<Camera size={16} />}
                title="Папка сохранения скриншотов"
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
                  <input
                    type="text"
                    readOnly
                    value={screenshotDir || "Загрузка..."}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      background: "rgba(0, 0, 0, 0.45)",
                      border: "1px solid var(--border-pill)",
                      borderRadius: "var(--radius-md)",
                      color: "var(--text-primary)",
                      fontSize: "0.88rem",
                      fontFamily: "monospace",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handlePickFolder}
                    className="btn btn--secondary btn--sm"
                    style={{
                      height: 38,
                      padding: "0 16px",
                      borderRadius: "var(--radius-md)",
                      fontSize: "0.88rem",
                      fontWeight: 600,
                      gap: 8,
                    }}
                  >
                    <FolderOpen size={16} /> Обзор...
                  </button>
                  <button
                    onClick={handleResetDefault}
                    className="btn btn--secondary btn--icon"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              </AccordionSection>

              {/* 2. Режим нескольких окон (Multi-instance) */}
              <AccordionSection
                isOpen={!!openSections["gen_multi_instance"]}
                onToggle={() => toggleSection("gen_multi_instance")}
                icon={<Monitor size={16} />}
                title="Режим нескольких окон (Multi-instance)"
              >
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={multiInstance}
                    onChange={async (e) => {
                      const val = e.target.checked;
                      setMultiInstance(val);
                      try {
                        await invoke("set_multi_instance", { allow: val });
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Разрешить открытие нескольких копий плеера одновременно
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      (Изменение вступит в силу после полного перезапуска приложения)
                    </span>
                  </div>
                </label>
              </AccordionSection>

              {/* 3. Извлечение аудио и субтитров */}
              <AccordionSection
                isOpen={!!openSections["gen_track_extraction"]}
                onToggle={() => toggleSection("gen_track_extraction")}
                icon={<Download size={16} />}
                title="Извлечение аудио и субтитров"
              >
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={saveTracksToVideoDir}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setSaveTracksToVideoDir(val);
                      localStorage.setItem('l-mpv-save-tracks-to-video-dir', val ? 'true' : 'false');
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Скачивать дорожки в ту же папку, где находится видео
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      Если отключено, при нажатии «Скачать» будет открываться диалоговое окно Проводника с выбором папки
                    </span>
                  </div>
                </label>
              </AccordionSection>

              {/* 4. Автоматическое подключение дорожек */}
              <AccordionSection
                isOpen={!!openSections["gen_auto_tracks"]}
                onToggle={() => toggleSection("gen_auto_tracks")}
                icon={<AudioLines size={16} />}
                title="Автоматическое подключение дорожек"
              >
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={autoLoadTracks}
                    onChange={async (e) => {
                      const val = e.target.checked;
                      setAutoLoadTracks(val);
                      try {
                        await invoke("set_auto_load_tracks", { enabled: val });
                      } catch (err) {
                        console.error("Ошибка сохранения настройки auto_load_tracks:", err);
                      }
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Автоматически подхватывать внешние аудиодорожки и субтитры
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      Подключает файлы для текущей серии из папки с видео и её подпапок первого уровня (Audio, Subs и др.)
                    </span>
                  </div>
                </label>

                {autoLoadTracks && (
                  <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, marginLeft: 28, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      className="ui-checkbox"
                      checked={autoSelectExternalAudio}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        setAutoSelectExternalAudio(val);
                        try {
                          await invoke("set_auto_select_external_audio", { enabled: val });
                        } catch (err) {
                          console.error("Ошибка сохранения настройки auto_select_external_audio:", err);
                        }
                      }}
                    />
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: "0.86rem", color: "var(--text-primary)", fontWeight: 500 }}>
                        Автоматически переключать звук на подхваченную внешнюю аудиодорожку
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Если выключено (по умолчанию), внешнее аудио добавляется в список, но воспроизводится оригинальный звук видео
                      </span>
                    </div>
                  </label>
                )}
              </AccordionSection>

              {/* 5. Хотлоад дорожек (Drag & Drop) */}
              <AccordionSection
                isOpen={!!openSections["gen_hotload"]}
                onToggle={() => toggleSection("gen_hotload")}
                icon={<Sparkles size={16} />}
                title="Хотлоад дорожек (Drag & Drop)"
              >
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={hotloadEnabled}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setHotloadEnabled(val);
                      localStorage.setItem('l-mpv-hotload-enabled', val ? 'true' : 'false');
                      window.dispatchEvent(new Event('l-mpv-settings-changed'));
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Подключать перетаскиваемые файлы к видео на лету (Хотлоад)
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      Если включено, перетаскивание аудиофайла или субтитров в окно плеера во время воспроизведения подключит их к текущему видео вместо открытия нового файла
                    </span>
                  </div>
                </label>
              </AccordionSection>

              {/* 6. Поведение по окончании видео */}
              <AccordionSection
                isOpen={!!openSections["gen_end_action"]}
                onToggle={() => toggleSection("gen_end_action")}
                icon={<Film size={16} />}
                title="Поведение по окончании видео"
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="radio"
                      name="playNextOnEnd"
                      checked={playNextOnEnd}
                      onChange={async () => {
                        setPlayNextOnEnd(true);
                        try {
                          await invoke("set_play_next_on_end", { enabled: true });
                        } catch (err) {
                          console.error("Ошибка сохранения настройки play_next_on_end:", err);
                        }
                      }}
                      style={{
                        width: 18,
                        height: 18,
                        accentColor: "var(--accent)",
                        cursor: "pointer"
                      }}
                    />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                        Переключать на следующее видео (по умолчанию)
                      </span>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Автоматически воспроизводить следующий файл в плейлисте после завершения текущего
                      </span>
                    </div>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="radio"
                      name="playNextOnEnd"
                      checked={!playNextOnEnd}
                      onChange={async () => {
                        setPlayNextOnEnd(false);
                        try {
                          await invoke("set_play_next_on_end", { enabled: false });
                        } catch (err) {
                          console.error("Ошибка сохранения настройки play_next_on_end:", err);
                        }
                      }}
                      style={{
                        width: 18,
                        height: 18,
                        accentColor: "var(--accent)",
                        cursor: "pointer"
                      }}
                    />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                        Ничего не делать
                      </span>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Останавливать воспроизведение на последнем кадре (нажатие на пуск перезапустит видео с начала)
                      </span>
                    </div>
                  </label>
                </div>
              </AccordionSection>

              {/* 7. Автоматическое скрытие интерфейса */}
              <AccordionSection
                isOpen={!!openSections["gen_hide_controls_upper"]}
                onToggle={() => toggleSection("gen_hide_controls_upper")}
                icon={<MousePointer2 size={16} />}
                title="Скрытие интерфейса в полноэкранном режиме"
              >
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={hideControlsInUpperHalf}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setHideControlsInUpperHalf(val);
                      localStorage.setItem('l-mpv-hide-controls-upper-half', val ? 'true' : 'false');
                      window.dispatchEvent(new Event('l-mpv-settings-changed'));
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Скрывать весь интерфейс при наведении мыши на самый верх в полноэкранном режиме
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      В режиме во весь экран, когда курсор подводится к верхнему краю, весь интерфейс (верхняя шапка и нижняя панель управления) моментально скрывается
                    </span>
                  </div>
                </label>
              </AccordionSection>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="modal__section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* 1. Цветовое оформление (Единая категория: цвет плеера, акценты, свечение) */}
              <AccordionSection
                isOpen={!!openSections["app_color_scheme"]}
                onToggle={() => toggleSection("app_color_scheme")}
                icon={<Palette size={16} />}
                title="Цветовое оформление"
              >
                <ColorSchemeSection onAccentChange={(color) => setActiveColor(color)} />
              </AccordionSection>

              {/* 2.1 Настройки интерфейса (Единая категория: скругление, масштаб, прозрачность) */}
              <AccordionSection
                isOpen={!!openSections["app_interface"]}
                onToggle={() => toggleSection("app_interface")}
                icon={<SlidersHorizontal size={16} />}
                title="Настройки интерфейса"
              >
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 8, marginBottom: 10, lineHeight: 1.35 }}>
                  Настройка внешнего вида элементов плеера: степень скругления углов, масштаб и прозрачность панелей управления и окон.
                </div>

                {/* Компактный интерактивный предпросмотр */}
                <div className="settings-preview-card">
                  <div className="settings-preview-card__info">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        Предпросмотр:
                      </span>
                      <span
                        style={{
                          fontSize: "0.80rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                        }}
                      >
                        {uiRadius.level === "custom"
                          ? `Кастомное (${uiRadius.value} px)`
                          : `${UI_RADIUS_PRESETS[uiRadius.level as Exclude<UiRadiusLevel, "custom">]?.label || "Стандартный"} (${uiRadius.value} px)`}
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>•</span>
                      <span
                        style={{
                          fontSize: "0.80rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                        }}
                      >
                        Масштаб: {uiScale.mode === "auto" ? "Авто (100%)" : `${Math.round(uiScale.value * 100)}%`}
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>•</span>
                      <span
                        style={{
                          fontSize: "0.80rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                        }}
                      >
                        Прозрачность: {Math.round(uiOpacity * 100)}%
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>•</span>
                      <span
                        style={{
                          fontSize: "0.80rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                        }}
                      >
                        Шрифт: {UI_FONT_PRESETS.find((f) => f.id === uiFont)?.label || "Inter"}
                      </span>
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.25 }}>
                      Живой отклик нижней панели управления, кнопок плеера, диалогов и контекстных меню
                    </span>
                  </div>

                  {/* Миниатюрная аутентичная панель управления с живым скруглением и прозрачностью */}
                  <div
                    className="settings-preview-card__mini-player"
                    style={{
                      background: `rgba(var(--bg-pill-rgb, 10, 12, 18), ${uiOpacity})`,
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      border: "1px solid var(--border-pill)",
                      borderRadius: `${uiRadius.value}px`,
                      padding: "6px 14px 8px",
                      boxShadow: "var(--shadow-pill, 0 4px 20px rgba(0, 0, 0, 0.45))",
                      transition: "border-radius var(--t-spring) var(--ease-spring-smooth), background 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                      <RotateCcw size={14} style={{ color: "var(--text-secondary)", opacity: 0.85, cursor: "default" }} />
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--accent)",
                          cursor: "default",
                          filter: "var(--play-icon-glow)",
                          transition: "filter var(--t-fast) var(--ease-smooth)",
                        }}
                      >
                        <Play size={20} fill="currentColor" />
                      </div>
                      <RotateCw size={14} style={{ color: "var(--text-secondary)", opacity: 0.85, cursor: "default" }} />
                    </div>
                    {/* Полоска таймлайна */}
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        height: 3,
                        background: "rgba(255, 255, 255, 0.15)",
                        borderRadius: `${Math.max(1, Math.round(uiRadius.value * 0.25))}px`,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: "55%",
                          background: "var(--accent)",
                          borderRadius: `${Math.max(1, Math.round(uiRadius.value * 0.25))}px`,
                          boxShadow: "var(--timeline-glow)",
                          transition: "box-shadow var(--t-fast) var(--ease-smooth)",
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Вспомогательные стили для подблоков настроек интерфейса ── */}
                {(() => {
                  const cardStyle: React.CSSProperties = {
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "10px 12px",
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border)",
                    marginBottom: 10,
                  };
                  const resetBtnStyle: React.CSSProperties = {
                    height: 22,
                    padding: "0 8px",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: "0.70rem",
                    cursor: "pointer",
                  };
                  const btnStyle = (isSel: boolean, padding = "6px 4px"): React.CSSProperties => ({
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                    padding,
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    cursor: "pointer",
                    background: isSel ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)" : "rgba(255, 255, 255, 0.03)",
                    color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                    boxShadow: isSel
                      ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px var(--accent)"
                      : "none",
                    transition: "all var(--t-fast) var(--ease-smooth)",
                  });

                  return (
                    <>
                      {/* ── Блок 1: Скругление углов ── */}
                      <div style={cardStyle}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Square size={14} style={{ color: "var(--accent)" }} />
                            <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              Скругление углов интерфейса
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "var(--accent)" }}>
                              {uiRadius.value} px
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setUiRadius({ level: "default", value: 16 });
                                saveUiRadius("default", 16);
                              }}
                              className="btn btn--secondary btn--sm"
                              style={resetBtnStyle}
                            >
                              <RotateCcw size={11} />
                              <span>16 px (Стандарт)</span>
                            </button>
                          </div>
                        </div>

                        {/* 5 кнопок пресетов скругления в адаптивной сетке */}
                        <div className="radius-presets-grid">
                          {(Object.keys(UI_RADIUS_PRESETS) as (Exclude<UiRadiusLevel, "custom">)[]).map((level) => {
                            const preset = UI_RADIUS_PRESETS[level];
                            const isSel = uiRadius.value === preset.controlsRadius;
                            const visualRadius = level === "none" ? "0px" : level === "minimal" ? "3px" : level === "default" ? "6px" : level === "smooth" ? "9px" : "14px";
                            return (
                              <button
                                key={level}
                                type="button"
                                onClick={() => {
                                  setUiRadius({ level, value: preset.controlsRadius });
                                  saveUiRadius(level, preset.controlsRadius);
                                }}
                                style={btnStyle(isSel)}
                              >
                                <div
                                  style={{
                                    width: 22,
                                    height: 13,
                                    border: `1.5px solid ${isSel ? "var(--accent)" : "rgba(255, 255, 255, 0.35)"}`,
                                    borderRadius: visualRadius,
                                    background: isSel ? "var(--accent-glass)" : "transparent",
                                    transition: "all var(--t-fast) var(--ease-smooth)",
                                  }}
                                />
                                <span style={{ fontSize: "0.76rem", fontWeight: 600 }}>{preset.label}</span>
                                <span style={{ fontSize: "0.68rem", color: isSel ? "var(--accent-hover)" : "var(--text-muted)" }}>
                                  {preset.badge}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Ползунок точной настройки кастомного скругления */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", width: 65, flexShrink: 0 }}>
                            Кастомное:
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="34"
                            step="1"
                            value={uiRadius.value}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              const matched = (Object.keys(UI_RADIUS_PRESETS) as (Exclude<UiRadiusLevel, "custom">)[]).find(
                                (k) => UI_RADIUS_PRESETS[k].controlsRadius === val
                              );
                              const nextLevel: UiRadiusLevel = matched || "custom";
                              setUiRadius({ level: nextLevel, value: val });
                              saveUiRadius(nextLevel, val);
                            }}
                            style={{ flex: 1, cursor: "pointer", accentColor: "var(--accent)" }}
                          />
                          <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text-secondary)", width: 42, textAlign: "right" }}>
                            {uiRadius.value} px
                          </span>
                        </div>
                      </div>

                      {/* ── Блок 2: Масштаб и размеры ── */}
                      <div style={cardStyle}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Maximize2 size={14} style={{ color: "var(--accent)" }} />
                            <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              Масштаб и размеры интерфейса (UI Scale)
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "var(--accent)" }}>
                              {uiScale.mode === "auto" ? "Авто (100%)" : `${Math.round(uiScale.value * 100)}%`}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setUiScale({ mode: "auto", value: 1.0 });
                                saveUiScale("auto", 1.0);
                              }}
                              className="btn btn--secondary btn--sm"
                              style={resetBtnStyle}
                            >
                              <RotateCcw size={11} />
                              <span>Авто (Стандарт)</span>
                            </button>
                          </div>
                        </div>

                        {/* 6 кнопок пресетов масштаба в адаптивной сетке */}
                        <div className="scale-presets-grid">
                          {UI_SCALE_PRESETS.map((preset) => {
                            const isSel =
                              uiScale.mode === preset.id ||
                              (uiScale.mode !== "auto" &&
                                preset.value !== null &&
                                Math.abs(uiScale.value - preset.value) < 0.01);
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => {
                                  const nextVal = preset.value !== null ? preset.value : 1.0;
                                  setUiScale({ mode: preset.id, value: nextVal });
                                  saveUiScale(preset.id, nextVal);
                                }}
                                style={btnStyle(isSel, "6px 3px")}
                              >
                                <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{preset.label}</span>
                                <span style={{ fontSize: "0.68rem", color: isSel ? "var(--accent-hover)" : "var(--text-muted)" }}>
                                  {preset.badge}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Ползунок точной настройки масштаба */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", width: 65, flexShrink: 0 }}>
                            Точная:
                          </span>
                          <input
                            type="range"
                            min="0.75"
                            max="1.60"
                            step="0.05"
                            value={uiScale.value}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setUiScale({ mode: "custom", value: val });
                              saveUiScale("custom", val);
                            }}
                            style={{ flex: 1, cursor: "pointer", accentColor: "var(--accent)" }}
                          />
                          <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text-secondary)", width: 42, textAlign: "right" }}>
                            {Math.round(uiScale.value * 100)}%
                          </span>
                        </div>
                      </div>

                      {/* ── Блок 3: Прозрачность интерфейса ── */}
                      <div style={{ ...cardStyle, marginBottom: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <SlidersHorizontal size={14} style={{ color: "var(--accent)" }} />
                            <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              Прозрачность интерфейса
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "var(--accent)" }}>
                              {Math.round(uiOpacity * 100)}%
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setUiOpacity(0.88);
                                saveUiOpacity(0.88);
                              }}
                              className="btn btn--secondary btn--sm"
                              style={resetBtnStyle}
                            >
                              <RotateCcw size={11} />
                              <span>88% (Стандарт)</span>
                            </button>
                          </div>
                        </div>

                        {/* Ползунок прозрачности */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", width: 65, flexShrink: 0 }}>
                            Уровень:
                          </span>
                          <input
                            type="range"
                            min="0.10"
                            max="1.00"
                            step="0.01"
                            value={uiOpacity}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setUiOpacity(val);
                              saveUiOpacity(val);
                            }}
                            style={{ flex: 1, cursor: "pointer", accentColor: "var(--accent)" }}
                          />
                          <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text-secondary)", width: 42, textAlign: "right" }}>
                            {Math.round(uiOpacity * 100)}%
                          </span>
                        </div>
                      </div>

                      {/* ── Блок 4: Шрифт интерфейса (UI Font) ── */}
                      <div style={{ ...cardStyle, marginBottom: 0, marginTop: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Type size={14} style={{ color: "var(--accent)" }} />
                            <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              Шрифт интерфейса (UI Font)
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "var(--accent)" }}>
                              {UI_FONT_PRESETS.find((f) => f.id === uiFont)?.label || "Inter"}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setUiFont("inter");
                                saveUiFont("inter");
                              }}
                              className="btn btn--secondary btn--sm"
                              style={resetBtnStyle}
                            >
                              <RotateCcw size={11} />
                              <span>Inter (Стандарт)</span>
                            </button>
                          </div>
                        </div>

                        {/* 6 кнопок пресетов шрифтов в адаптивной сетке */}
                        <div className="font-presets-grid">
                          {UI_FONT_PRESETS.map((fontPreset) => {
                            const isSel = uiFont === fontPreset.id;
                            return (
                              <button
                                key={fontPreset.id}
                                type="button"
                                onClick={() => {
                                  setUiFont(fontPreset.id);
                                  saveUiFont(fontPreset.id);
                                }}
                                style={{
                                  ...btnStyle(isSel, "10px 4px"),
                                  fontFamily: `var(--font-${fontPreset.id})`,
                                }}
                                title={`${fontPreset.label} — ${fontPreset.desc}`}
                              >
                                <span
                                  style={{
                                    fontSize: "1.1rem",
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    marginBottom: 4,
                                    color: isSel ? "var(--accent)" : "var(--text-primary)",
                                  }}
                                >
                                  Aa
                                </span>
                                <span style={{ fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap" }}>
                                  {fontPreset.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </AccordionSection>

              {/* 4. Плавные анимации интерфейса */}
              <AccordionSection
                isOpen={!!openSections["app_animations"]}
                onToggle={() => toggleSection("app_animations")}
                icon={<Zap size={16} />}
                title="Анимации интерфейса (Spring Physics)"
              >
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      className="ui-checkbox"
                      checked={animationsEnabled}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setAnimationsEnabled(val);
                        localStorage.setItem('l-mpv-animations-enabled', val ? 'true' : 'false');
                        if (val) {
                          document.documentElement.classList.remove('no-animations');
                        } else {
                          document.documentElement.classList.add('no-animations');
                        }
                        window.dispatchEvent(new Event('l-mpv-settings-changed'));
                      }}
                    />
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Включить плавные spring-микроанимации переключения, раскрытия меню и физического отклика
                    </span>
                  </label>
                  <p style={{ margin: "2px 0 0 30px", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                    Эластичные переходы кнопок Play/Pause, Mute, слайдера громкости, боковой панели плейлиста, меню дорожек и окон. При отключении интерфейс реагирует мгновенно.
                  </p>
                </div>
              </AccordionSection>

              {/* 5. Названия дорожек на панели */}
              <AccordionSection
                isOpen={!!openSections["app_track_names"]}
                onToggle={() => toggleSection("app_track_names")}
                icon={<AudioLines size={16} />}
                title="Названия дорожек на панели"
              >
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={showTrackNames}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setShowTrackNames(val);
                      localStorage.setItem('l-mpv-show-track-names', val ? 'true' : 'false');
                      window.dispatchEvent(new Event('l-mpv-settings-changed'));
                    }}
                  />
                  <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                    Отображать короткое название выбранной аудиодорожки и субтитров рядом с иконками
                  </span>
                </label>
              </AccordionSection>

              {/* 5. Аудио-визуалайзер на панели управления */}
              <VisualizerSettingsSection
                isOpen={!!openSections["app_visualizer"]}
                onToggle={() => toggleSection("app_visualizer")}
              />

              {/* 6. Видимость кнопок панели управления */}
              <AccordionSection
                isOpen={!!openSections["app_control_buttons"]}
                onToggle={() => toggleSection("app_control_buttons")}
                icon={<SlidersHorizontal size={16} />}
                title="Видимость кнопок панели управления"
              >
                <div style={{ marginTop: 12 }}>
                  <ControlButtonsPreviewCard
                    visibleButtons={visibleButtons}
                    skipOpeningSeconds={skipOpeningSeconds}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", columnGap: 20, rowGap: 8, marginTop: 12 }}>
                  {[
                    { id: 'repeat', label: 'Повтор', defaultChecked: true },
                    { id: 'shuffle', label: 'Случайный порядок', defaultChecked: true },
                    { id: 'alwaysOnTop', label: 'Поверх всех окон', defaultChecked: true },
                    { id: 'info', label: 'Информация о файле', defaultChecked: true },
                    { id: 'mediaInfo', label: 'Свойства MediaInfo (Shift+F10)', defaultChecked: true },
                    { id: 'visualizer', label: 'Аудио-визуалайзер', defaultChecked: true },
                    { id: 'screenshot', label: 'Сделать скриншот', defaultChecked: true },
                    { id: 'playlist', label: 'Плейлист', defaultChecked: true },
                    { id: 'fullscreen', label: 'Полный экран', defaultChecked: true },
                    { id: 'skipOpening', label: 'Перемотка опенинга', defaultChecked: false }
                  ].map(btn => {
                    const isChecked = visibleButtons[btn.id] !== undefined 
                      ? visibleButtons[btn.id] 
                      : btn.defaultChecked;
                    return (
                      <label key={btn.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 24, height: 24, cursor: "pointer", userSelect: "none", boxSizing: "border-box" }}>
                        <input
                          type="checkbox"
                          className="ui-checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const val = e.target.checked;
                            const updated = { ...visibleButtons, [btn.id]: val };
                            setVisibleButtons(updated);
                            localStorage.setItem('l-mpv-visible-buttons', JSON.stringify(updated));
                            window.dispatchEvent(new Event('l-mpv-settings-changed'));
                          }}
                        />
                        <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500, lineHeight: 1 }}>
                          {btn.label}
                        </span>
                        {btn.id === 'skipOpening' && isChecked && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4, height: 20 }}
                          >
                            <input
                              type="text"
                              inputMode="numeric"
                              className="no-spin-input"
                              value={skipOpeningSeconds}
                              onChange={(e) => {
                                const rawVal = e.target.value.replace(/\D/g, "");
                                const num = rawVal === "" ? 0 : Number(rawVal);
                                const val = num > 600 ? 600 : num;
                                setSkipOpeningSeconds(val);
                                if (val > 0) {
                                  localStorage.setItem('l-mpv-skip-opening-seconds', val.toString());
                                  window.dispatchEvent(new Event('l-mpv-settings-changed'));
                                }
                              }}
                              onBlur={() => {
                                if (skipOpeningSeconds <= 0) {
                                  setSkipOpeningSeconds(90);
                                  localStorage.setItem('l-mpv-skip-opening-seconds', '90');
                                  window.dispatchEvent(new Event('l-mpv-settings-changed'));
                                }
                              }}
                              style={{
                                width: 44,
                                height: 20,
                                padding: "0 4px",
                                background: "rgba(0, 0, 0, 0.4)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius-sm)",
                                color: "var(--text-primary)",
                                fontSize: "0.78rem",
                                textAlign: "center",
                                fontWeight: 600,
                                boxSizing: "border-box",
                                outline: "none"
                              }}
                            />
                            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1 }}>сек</span>
                          </div>
                        )}
                      </label>
                    );
                  })}
                </div>
              </AccordionSection>

              {/* 6. Подсветка черных полос (Ambient Light) */}
              <AccordionSection
                isOpen={!!openSections["app_ambient"]}
                onToggle={() => toggleSection("app_ambient")}
                icon={<Sparkles size={16} />}
                title="Подсветка черных полос (Ambient Light)"
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                  <span style={{ fontSize: "0.80rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    Заполняет пустые области экрана (letterbox/pillarbox) при просмотре широкоформатных видео или в полноэкранном режиме.
                  </span>

                  {/* Переключатель режимов */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 8,
                      padding: 4,
                      background: "rgba(255, 255, 255, 0.03)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {[
                      { id: "off", label: "Выключено", desc: "Черные полосы" },
                      { id: "blur", label: "Размытие (GPU)", desc: "Шейдерный Blur" },
                      { id: "color", label: "Цветной фон", desc: "Свечение цветом" },
                    ].map((item) => {
                      const isSel = ambientSettings.mode === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => updateAmbient({ mode: item.id as "off" | "blur" | "color" }, true)}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                            padding: "8px 6px",
                            borderRadius: "var(--radius-sm)",
                            border: "none",
                            cursor: "pointer",
                            background: isSel ? "var(--accent-glow)" : "transparent",
                            color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                            boxShadow: isSel
                              ? "0 0 12px var(--accent-glow), inset 0 0 0 1px var(--accent)"
                              : "none",
                            transition: "all var(--t-fast) var(--ease-smooth)",
                          }}
                        >
                          <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{item.label}</span>
                          <span style={{ fontSize: "0.70rem", color: isSel ? "var(--accent-hover)" : "var(--text-muted)" }}>
                            {item.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Настройка радиуса размытия (только для режима blur) */}
                  {ambientSettings.mode === "blur" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                          Радиус аппаратного размытия (Blur Radius)
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: "0.85rem", color: "var(--accent)", fontWeight: 600 }}>
                            {ambientSettings.blur_radius} px
                          </span>
                          <button
                            onClick={() => updateAmbient({ blur_radius: 100 }, true)}
                            className="btn btn--secondary btn--icon btn--sm"
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "var(--radius-sm)",
                            }}
                          >
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="150"
                        step="5"
                        value={ambientSettings.blur_radius}
                        onChange={(e) => updateAmbient({ blur_radius: parseInt(e.target.value, 10) }, false)}
                        style={{ width: "100%", cursor: "pointer", accentColor: "var(--accent)" }}
                      />
                    </div>
                  )}

                  {/* Настройка цвета (только для режима color) */}
                  {ambientSettings.mode === "color" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                        Цвет подсветки черных полос
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <button
                          onClick={() => updateAmbient({ color: getEffectiveAccentColor() }, true)}
                          title="Использовать текущий акцент плеера"
                          style={{
                            padding: "6px 12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                            background: "var(--accent-glass)",
                            color: "var(--accent)",
                            fontSize: "0.78rem",
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          Как в теме ({activeColor === "windows" ? "Windows" : activeColor})
                        </button>

                        {["#141923", "#1f2937", "#241e38", "#2d1c24", "#132a24", "#0a192f"].map((hex) => (
                          <button
                            key={hex}
                            onClick={() => updateAmbient({ color: hex }, true)}
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: "50%",
                              backgroundColor: hex,
                              border: ambientSettings.color === hex ? "2px solid white" : "1px solid var(--border)",
                              cursor: "pointer",
                              boxShadow: ambientSettings.color === hex ? `0 0 10px ${hex}` : "none",
                              transition: "all var(--t-fast) var(--ease-smooth)",
                            }}
                          />
                        ))}

                        <input
                          type="color"
                          value={ambientSettings.color.startsWith("#") ? ambientSettings.color : "#7fc7ff"}
                          onChange={(e) => updateAmbient({ color: e.target.value }, false)}
                          title="Выбрать произвольный цвет"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            border: "none",
                            cursor: "pointer",
                            background: "none",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </AccordionSection>
            </div>
          )}

          {activeTab === "presets" && (
            <div className="modal__section" style={{ display: "flex", flexDirection: "column" }}>
              <PresetsSection onPresetApplied={handlePresetApplied} />
            </div>
          )}

          {activeTab === "upscaling" && (
            <div className="modal__section" style={{ display: "flex", flexDirection: "column" }}>
              <UpscalingSettingsSection />
            </div>
          )}

          {activeTab === "hotkeys" && (
            <div className="modal__section">
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--accent-glass)",
                  border: "1px solid var(--border-pill)",
                  color: "var(--accent)",
                  fontSize: "0.86rem",
                  lineHeight: "1.4",
                  marginBottom: 16,
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>💡 Нажмите на любую клавишу в списке ниже, чтобы назначить свою комбинацию!</span>
                <button
                  onClick={() => {
                    resetCustomHotkeys();
                    setCustomHotkeys(getCustomHotkeys());
                  }}
                  style={{
                    background: "rgba(255, 255, 255, 0.1)",
                    border: "1px solid var(--border)",
                    color: "white",
                    borderRadius: "var(--radius-sm)",
                    padding: "4px 8px",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <RotateCcw size={12} /> Сбросить
                </button>
              </div>

              <div
                className="modal__section-title"
                style={{ fontSize: "0.92rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "none", letterSpacing: "normal", marginBottom: 10 }}
              >
                Назначения горячих клавиш
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(() => {
                  const categorizedHotkeys = HOTKEY_ACTIONS.reduce((acc, item) => {
                    if (!acc[item.category]) acc[item.category] = [];
                    acc[item.category].push(item);
                    return acc;
                  }, {} as Record<string, typeof HOTKEY_ACTIONS>);

                  return Object.entries(categorizedHotkeys).map(([category, items]) => {
                    const secKey = `hk_${category}`;
                    const isOpen = !!openSections[secKey];

                    return (
                      <AccordionSection
                        key={category}
                        isOpen={isOpen}
                        onToggle={() => toggleSection(secKey)}
                        icon={<Keyboard size={16} />}
                        title={category}
                        badge={
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 500, marginLeft: 4 }}>
                            ({items.length})
                          </span>
                        }
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 }}>
                          {items.map((item) => {
                                const currentCodes = customHotkeys[item.id] || [];

                                return (
                                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div
                                      className="modal__row"
                                      style={{
                                        flex: 1,
                                        padding: "10px 14px",
                                        background: "rgba(255, 255, 255, 0.03)",
                                        border: "1px solid rgba(255, 255, 255, 0.04)",
                                        borderRadius: "var(--radius-md)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        flexWrap: "wrap",
                                        gap: 10,
                                      }}
                                    >
                                      <span style={{ color: "var(--text-primary)", fontSize: "0.9rem", fontWeight: 500, flex: 1, minWidth: 200 }}>
                                        {item.label}
                                      </span>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                        {currentCodes.map((code, idx) => {
                                          const isRecording = recordingAction?.id === item.id && recordingAction.index === idx;
                                          return (
                                            <div key={idx} style={{ display: "flex", alignItems: "center" }}>
                                              <button
                                                onClick={(e) => {
                                                  if (Date.now() < ignoreClickUntilRef.current) {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    return;
                                                  }
                                                  if (!isRecording) {
                                                    setRecordingAction({ id: item.id, index: idx });
                                                  } else {
                                                    e.preventDefault();
                                                  }
                                                }}
                                                onKeyDown={(e) => {
                                                  if (isRecording) {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (
                                                      e.key === "Control" ||
                                                      e.key === "Shift" ||
                                                      e.key === "Alt" ||
                                                      e.key === "Meta"
                                                    ) {
                                                      return;
                                                    }
                                                    const parts: string[] = [];
                                                    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
                                                    if (e.shiftKey) parts.push("Shift");
                                                    if (e.altKey) parts.push("Alt");
                                                    parts.push(e.code || e.key);
                                                    const newCode = parts.join("+");

                                                    const newCodes = [...currentCodes];
                                                    newCodes[idx] = newCode;
                                                    const updated = { ...customHotkeys, [item.id]: newCodes };
                                                    setCustomHotkeys(updated);
                                                    saveCustomHotkeys(updated);
                                                    setRecordingAction(null);
                                                  }
                                                }}
                                                onMouseDown={(e) => {
                                                  if (isRecording) {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    ignoreClickUntilRef.current = Date.now() + 400;
                                                    const btnMap: Record<number, string> = { 0: "MouseLeft", 1: "MouseMiddle", 2: "MouseRight" };
                                                    const newCode = btnMap[e.button] || `MouseButton${e.button}`;
                                                    const newCodes = [...currentCodes];
                                                    newCodes[idx] = newCode;
                                                    const updated = { ...customHotkeys, [item.id]: newCodes };
                                                    setCustomHotkeys(updated);
                                                    saveCustomHotkeys(updated);
                                                    setRecordingAction(null);
                                                  }
                                                }}
                                                onContextMenu={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                }}
                                                style={{
                                                  padding: "4px 10px",
                                                  background: isRecording ? "var(--accent)" : "rgba(127, 199, 255, 0.12)",
                                                  border: isRecording ? "1px solid white" : "1px solid rgba(127, 199, 255, 0.2)",
                                                  borderRadius: "var(--radius-sm)",
                                                  fontFamily: "monospace",
                                                  fontSize: "0.84rem",
                                                  fontWeight: 600,
                                                  color: isRecording ? "#000" : "var(--accent)",
                                                  cursor: "pointer",
                                                  outline: "none",
                                                  borderTopRightRadius: 0,
                                                  borderBottomRightRadius: 0,
                                                }}
                                              >
                                                {isRecording ? "Нажмите..." : getKeyDisplay(code)}
                                              </button>
                                              <button
                                                onClick={() => {
                                                  const newCodes = currentCodes.filter((_, i) => i !== idx);
                                                  const updated = { ...customHotkeys, [item.id]: newCodes };
                                                  setCustomHotkeys(updated);
                                                  saveCustomHotkeys(updated);
                                                }}
                                                title="Удалить"
                                                style={{
                                                  padding: "4px 6px",
                                                  background: "rgba(255, 50, 50, 0.15)",
                                                  border: "1px solid rgba(255, 50, 50, 0.3)",
                                                  borderLeft: "none",
                                                  borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                                                  color: "#ff8888",
                                                  cursor: "pointer",
                                                  display: "flex",
                                                  alignItems: "center",
                                                  justifyContent: "center",
                                                }}
                                              >
                                                <Trash2 size={13} />
                                              </button>
                                            </div>
                                          );
                                        })}
                                        
                                        {/* Кнопка добавления нового бинда */}
                                        {(() => {
                                          const isRecordingNew = recordingAction?.id === item.id && recordingAction.index === currentCodes.length;
                                          if (isRecordingNew) {
                                            return (
                                              <button
                                                  onKeyDown={(e) => {
                                                    if (isRecordingNew) {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      if (
                                                        e.key === "Control" ||
                                                        e.key === "Shift" ||
                                                        e.key === "Alt" ||
                                                        e.key === "Meta"
                                                      ) {
                                                        return;
                                                      }
                                                      const parts: string[] = [];
                                                      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
                                                      if (e.shiftKey) parts.push("Shift");
                                                      if (e.altKey) parts.push("Alt");
                                                      parts.push(e.code || e.key);
                                                      const newCode = parts.join("+");

                                                      const updatedCodes = [...currentCodes, newCode];
                                                      const updated = { ...customHotkeys, [item.id]: updatedCodes };
                                                      setCustomHotkeys(updated);
                                                      saveCustomHotkeys(updated);
                                                      setRecordingAction(null);
                                                    }
                                                  }}
                                                  onMouseDown={(e) => {
                                                    if (isRecordingNew) {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      ignoreClickUntilRef.current = Date.now() + 400;
                                                    const btnMap: Record<number, string> = { 0: "MouseLeft", 1: "MouseMiddle", 2: "MouseRight" };
                                                      const newCode = btnMap[e.button] || `MouseButton${e.button}`;
                                                      const updatedCodes = [...currentCodes, newCode];
                                                      const updated = { ...customHotkeys, [item.id]: updatedCodes };
                                                      setCustomHotkeys(updated);
                                                      saveCustomHotkeys(updated);
                                                      setRecordingAction(null);
                                                    }
                                                  }}
                                                  onContextMenu={(e) => {
                                                    e.preventDefault();
                                                   e.stopPropagation();
                                                  }}
                                                  style={{
                                                    padding: "4px 10px",
                                                    background: "var(--accent)",
                                                    border: "1px solid white",
                                                    borderRadius: "var(--radius-sm)",
                                                    fontFamily: "monospace",
                                                    fontSize: "0.84rem",
                                                    fontWeight: 600,
                                                    color: "#000",
                                                    cursor: "pointer",
                                                    outline: "none",
                                                  }}
                                              >
                                                Нажмите...
                                              </button>
                                            );
                                          }
                                          
                                          return (
                                            <button
                                              onClick={(e) => {
                                                if (Date.now() < ignoreClickUntilRef.current) {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  return;
                                                }
                                                setRecordingAction({ id: item.id, index: currentCodes.length });
                                              }}
                                              title="Добавить клавишу"
                                              style={{
                                                padding: "4px 8px",
                                                background: "rgba(255, 255, 255, 0.05)",
                                                border: "1px dashed rgba(255, 255, 255, 0.2)",
                                                borderRadius: "var(--radius-sm)",
                                                color: "var(--text-secondary)",
                                                cursor: "pointer",
                                                fontSize: "1rem",
                                                lineHeight: 1,
                                              }}
                                            >
                                              +
                                            </button>
                                          );
                                        })()}
                                      </div>
                                    </div>
                            
                            <button
                              onClick={() => {
                                const updated = resetSingleHotkey(item.id, customHotkeys);
                                setCustomHotkeys(updated);
                              }}
                              style={{
                                padding: "10px",
                                background: "rgba(255, 255, 255, 0.03)",
                                border: "1px solid rgba(255, 255, 255, 0.04)",
                                borderRadius: "var(--radius-md)",
                                color: "var(--text-muted)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = "var(--text-primary)";
                                e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = "var(--text-muted)";
                                e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                              }}
                            >
                              <RotateCcw size={16} />
                            </button>
                          </div>
                        );
                      })}
                        </div>
                      </AccordionSection>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {activeTab === "integration" && (
            <div className="modal__section">
              <div
                className="modal__section-title"
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", color: "var(--accent)", fontWeight: 600, textTransform: "none", letterSpacing: "normal" }}
              >
                <Link size={16} /> Ассоциации файлов (Windows)
              </div>
              <div style={{ fontSize: "0.86rem", color: "var(--text-secondary)", marginTop: 8, marginBottom: 16, lineHeight: 1.5 }}>
                Настройте ассоциации видео- и аудиофайлов с L-MPV. Это позволит открывать файлы напрямую по двойному клику в Проводнике Windows.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                <button
                  disabled={isRegistering || isUnregistering}
                  onClick={async () => {
                    setIsRegistering(true);
                    try {
                      const logs = await invoke<string[]>("register_file_associations");
                      setIntegrationLogs(logs);
                      await checkContextMenuStatus();
                    } catch (e) {
                      setIntegrationLogs([`[ERROR] Не удалось зарегистрировать: ${e}`]);
                    } finally {
                      setIsRegistering(false);
                    }
                  }}
                  className="settings-action-btn settings-action-btn--primary"
                  title="Зарегистрировать ассоциации всех поддерживаемых видео- и аудиоформатов с L-MPV"
                  style={{ width: "100%" }}
                >
                  {isRegistering ? (
                    <>
                      <Loader2 size={16} className="spin-animation" />
                      Связывание файлов...
                    </>
                  ) : (
                    <>
                      <Link2 size={16} />
                      Связать медиафайлы с L-MPV
                    </>
                  )}
                </button>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={async () => {
                      try {
                        await invoke("open_default_apps_settings");
                        setIntegrationLogs((prev) => [
                          ...prev,
                          "[INFO] Открыто системное окно Windows 'Приложения по умолчанию'",
                        ]);
                      } catch (e) {
                        setIntegrationLogs((prev) => [
                          ...prev,
                          `[ERROR] Не удалось открыть настройки: ${e}`,
                        ]);
                      }
                    }}
                    className="settings-action-btn settings-action-btn--secondary"
                    title="Открыть системные параметры Windows 'Приложения по умолчанию'"
                    style={{ flex: 1 }}
                  >
                    <ExternalLink size={15} /> Настройки Windows
                  </button>

                  <button
                    disabled={isRegistering || isUnregistering}
                    onClick={async () => {
                      setIsUnregistering(true);
                      try {
                        const logs = await invoke<string[]>("unregister_file_associations");
                        setIntegrationLogs(logs);
                        await checkContextMenuStatus();
                      } catch (e) {
                        setIntegrationLogs([`[ERROR] Не удалось удалить: ${e}`]);
                      } finally {
                        setIsUnregistering(false);
                      }
                    }}
                    className="settings-action-btn settings-action-btn--danger"
                    style={{ flex: 1 }}
                  >
                    {isUnregistering ? (
                      <>
                        <Loader2 size={15} className="spin-animation" />
                        Удаление...
                      </>
                    ) : (
                      <>
                        <Trash2 size={15} /> Удалить ассоциации
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Контекстное меню Windows Explorer (MediaInfo) */}
              <div style={{ marginTop: 24, marginBottom: 16 }}>
                <div
                  className="modal__section-title"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.95rem",
                    color: "var(--accent)",
                    fontWeight: 600,
                    textTransform: "none",
                    letterSpacing: "normal",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <FileText size={16} /> Контекстное меню Проводника
                  </div>
                  {isContextMenuRegistered !== null && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-sm)",
                        background: isContextMenuRegistered ? "rgba(34, 197, 94, 0.15)" : "rgba(148, 163, 184, 0.15)",
                        color: isContextMenuRegistered ? "#4ade80" : "var(--text-muted)",
                        fontWeight: 500,
                      }}
                    >
                      {isContextMenuRegistered ? "Активно" : "Не добавлено"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.86rem", color: "var(--text-secondary)", marginTop: 8, marginBottom: 16, lineHeight: 1.5 }}>
                  Добавляет пункт <strong>«L-MPV MediaInfo»</strong> в контекстное меню правой кнопки мыши Windows. Позволяет мгновенно посмотреть технический отчёт о любом медиафайле.
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    disabled={isContextMenuLoading || isRegistering || isUnregistering}
                    onClick={async () => {
                      setIsContextMenuLoading(true);
                      try {
                        const logs = await invoke<string[]>("register_explorer_context_menu");
                        setIntegrationLogs(logs);
                        await checkContextMenuStatus();
                      } catch (e) {
                        setIntegrationLogs([`[ERROR] Не удалось зарегистрировать меню: ${e}`]);
                      } finally {
                        setIsContextMenuLoading(false);
                      }
                    }}
                    className="settings-action-btn settings-action-btn--primary"
                    title="Добавить пункт 'L-MPV MediaInfo' в контекстное меню Windows"
                    style={{ flex: 1 }}
                  >
                    {isContextMenuLoading ? (
                      <>
                        <Loader2 size={15} className="spin-animation" />
                        Применение...
                      </>
                    ) : (
                      <>
                        <FileText size={15} />
                        Добавить в контекстное меню
                      </>
                    )}
                  </button>

                  <button
                    disabled={isContextMenuLoading || isRegistering || isUnregistering}
                    onClick={async () => {
                      setIsContextMenuLoading(true);
                      try {
                        const logs = await invoke<string[]>("unregister_explorer_context_menu");
                        setIntegrationLogs(logs);
                        await checkContextMenuStatus();
                      } catch (e) {
                        setIntegrationLogs([`[ERROR] Не удалось удалить меню: ${e}`]);
                      } finally {
                        setIsContextMenuLoading(false);
                      }
                    }}
                    className="settings-action-btn settings-action-btn--danger"
                    style={{ flex: 1 }}
                  >
                    <Trash2 size={15} />
                    Удалить из меню
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "#0c0c0c",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "12px",
                  height: "200px",
                  overflowY: "auto",
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  color: "#d4d4d4",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4
                }}
              >
                {integrationLogs.length === 0 ? (
                  <span style={{ color: "#808080" }}>Здесь появится вывод процесса...</span>
                ) : (
                  integrationLogs.map((log, i) => {
                    let color = "#d4d4d4";
                    if (log.startsWith("[OK]") || log.startsWith("[DONE]")) color = "#4caf50";
                    if (log.startsWith("[ERROR]")) color = "#f44336";
                    if (log.startsWith("[WARN]")) color = "#ff9800";
                    if (log.startsWith("[INFO]")) color = "#2196f3";
                    return (
                      <div key={i} style={{ color }}>{log}</div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Футер с версией приложения и проверкой обновлений */}
        <div className="settings-footer">
          <div className="settings-footer__left">
            {/* Иконки социальных сетей слева от названия L-MPV */}
            <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
              <button
                type="button"
                onClick={() => openUrl("https://github.com/Menely/L-MPV")}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "1px 2px",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
                className="hover-bright"
                title="Репозиторий L-MPV на GitHub"
              >
                <GithubIcon size={19} />
              </button>

              <button
                type="button"
                onClick={() => openUrl("https://t.me/+pI8qa9mSkINkYmFi")}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "1px 2px",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
                className="hover-bright"
                title="Telegram-канал L-MPV"
              >
                <TelegramIcon size={19} />
              </button>
            </div>

            <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>L-MPV</span>
            <span
              style={{
                color: "var(--accent)",
                fontWeight: 700,
                background: "var(--accent-glass)",
                padding: "2px 8px",
                borderRadius: "var(--radius-pill)",
                fontSize: "0.78rem",
                border: "1px solid var(--border-pill)",
              }}
            >
              v{appVersion}
            </span>

            <button
              onClick={handleCheckForUpdates}
              disabled={isCheckingUpdate}
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "var(--radius-pill, 9999px)",
                padding: "3px 10px",
                fontSize: "0.78rem",
                color: "var(--text-secondary, #d1d5db)",
                cursor: isCheckingUpdate ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
              className="hover-bright"
              title="Проверить наличие обновлений на GitHub"
            >
              {isCheckingUpdate ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>Проверка...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={12} />
                  <span>Проверить обновления</span>
                </>
              )}
            </button>

            {updateStatus && (
              <span
                style={{
                  fontSize: "0.78rem",
                  color: updateStatus.includes("Найдено") ? "var(--accent)" : "var(--text-muted)",
                  marginLeft: 4,
                }}
              >
                {updateStatus}
              </span>
            )}
          </div>
          <span style={{ fontSize: "0.76rem" }}>Портативная редакция</span>
        </div>
      </div>
    </div>
  );
}
