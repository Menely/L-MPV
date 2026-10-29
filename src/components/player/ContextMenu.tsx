import { useEffect, useLayoutEffect, useCallback, useRef, useState, useMemo } from "react";
import { usePlayerState } from "../../contexts/PlayerStateContext";
import { useTranslation } from "../../i18n/LanguageContext";
import { showOsd } from "../../hooks/useOsd";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSavedLayout, LAYOUT_CHANGED_EVENT, type LayoutEntry } from "../../utils/contextMenuLayout";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronRight, Download, Loader2 } from "lucide-react";
import { getCustomHotkeys } from "../../utils/hotkeyUtils";
import {
  type TimeDisplayPosition,
  getSavedTimePosition,
  saveTimePosition,
} from "../../utils/timePositionUtils";
import {
  type RecentFile,
  getRecentFiles,
  clearRecentFiles,
} from "../../utils/recentFilesUtils";
import {
  type TimeFormatMode,
  getSavedTimeFormat,
  saveTimeFormat,
} from "../../utils/timeFormatUtils";
import {
  type ControlBarStyle,
  getSavedControlBarStyle,
  saveControlBarStyle,
} from "../../utils/controlBarStyleUtils";
import {
  loadUserPresets,
  applySettingsPreset,
  getSavedActivePresetId,
  type SettingsPreset,
} from "../../utils/presetsUtils";
import { useOverlayDismiss } from "../../hooks/useOverlayDismiss";
import type { ModelFileItem, UpscaleStatus, UpscaleSettings } from "../upscale/types";
import type { AmbientMode } from "../../utils/ambientSettingsUtils";
import { normalizeAmbientSettings } from "../../utils/ambientSettingsUtils";
import {
  getHeatmapConfig,
  saveHeatmapConfig,
  HEATMAP_CONFIG_CHANGED_EVENT,
  type HeatmapConfig,
  type HeatmapDataSource,
  type HeatmapStyle,
} from "./heatmap";
import {
  type MenuItem,
  buildContextMenuItems,
} from "./contextMenu/contextMenuBuilder";
import { groupSubmenuChildren } from "./contextMenu/contextMenuGrouping";

interface ContextMenuProps {
  /** Координата X для отображения меню. */
  x: number;
  /** Координата Y для отображения меню. */
  y: number;
  /** Обработчик закрытия меню. */
  onClose: () => void;
  /** Открытие файла. */
  onOpenFile?: (filePath?: string) => void;
  /** Открытие модального окна информации о файле. */
  onShowMediaInfo: () => void;
  /** Открытие окна детальных свойств MediaInfo. */
  onShowDetailedMediaInfo?: () => void;
  /** Открытие панели глав. */
  onShowChapters: () => void;
  /** Открытие окна поиска по субтитрам. */
  onShowSubtitlesSearch?: () => void;
  /** Открытие модального окна настроек. */
  onShowSettings: () => void;
}

/** Вспомогательная функция безопасного получения коэффициента масштабирования интерфейса. */
function getUiScale(): number {
  if (typeof window === "undefined") return 1;
  const zoomStr = getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim();
  const zoom = zoomStr ? parseFloat(zoomStr) : 1;
  return Number.isNaN(zoom) || zoom <= 0 ? 1 : zoom;
}

export function ContextMenu({
  x,
  y,
  onClose,
  onOpenFile,
  onShowMediaInfo,
  onShowDetailedMediaInfo,
  onShowChapters,
  onShowSubtitlesSearch,
  onShowSettings,
}: ContextMenuProps) {
  const { dict } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);

  const {
    mediaInfo,
    tracks,
    selectAudioTrack,
    selectSubTrack,
    disableSubtitles,
    downloadingTrackKey,
    handleDownloadTrack,
  } = usePlayerState();

  const [currentSpeed, setCurrentSpeed] = useState<number>(1.0);
  const [currentRotation, setCurrentRotation] = useState<number>(0);
  const [frameMode, setFrameMode] = useState<"stretch" | "fit" | "fill">("fit");
  const [repeatMode, setRepeatMode] = useState<0 | 1 | 2>(0);
  const [ambientMode, setAmbientMode] = useState<AmbientMode>("off");
  const [currentTimePos, setCurrentTimePos] = useState<TimeDisplayPosition>(() => getSavedTimePosition());
  const [timeFormat, setTimeFormat] = useState<TimeFormatMode>(() => getSavedTimeFormat());
  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() => getSavedControlBarStyle());
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => getRecentFiles());
  const [menuLayout, setMenuLayout] = useState<LayoutEntry[]>(() => getSavedLayout());

  // Стейты пресетов пользователя
  const [userPresets, setUserPresets] = useState<SettingsPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(() => getSavedActivePresetId());

  // Стейты моделей апскейлинга
  const [upscaleModels, setUpscaleModels] = useState<ModelFileItem[]>([]);
  const [upscaleMode, setUpscaleMode] = useState<"off" | "ai">(() =>
    (localStorage.getItem("l-mpv-upscale-mode") as "off" | "ai") || "off"
  );
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    localStorage.getItem("l-mpv-upscale-selected-model") || ""
  );
  const [selectedSlot, setSelectedSlot] = useState<number>(() =>
    Number(localStorage.getItem("l-mpv-upscale-slot") || 1001)
  );
  const [upscaleBackend, setUpscaleBackend] = useState<"DirectML" | "TensorRT">(() =>
    (localStorage.getItem("l-mpv-upscale-backend") as "DirectML" | "TensorRT") || "DirectML"
  );

  // Стейт видимости кнопок нижней панели
  const [visibleButtons, setVisibleButtons] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem("l-mpv-visible-buttons");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Стейт пользовательских горячих клавиш для динамических шорткатов
  const [hotkeys, setHotkeys] = useState<Record<string, string[]>>(() => getCustomHotkeys());

  // Стейт конфигурации тепловой карты (Activity Heatmap)
  const [heatmapConfig, setHeatmapConfig] = useState<HeatmapConfig>(() => getHeatmapConfig());

  useEffect(() => {
    const handleHeatmapChanged = (event: Event) => {
      const detail = (event as CustomEvent<HeatmapConfig>).detail;
      if (detail) {
        setHeatmapConfig(detail);
      } else {
        setHeatmapConfig(getHeatmapConfig());
      }
    };
    window.addEventListener(HEATMAP_CONFIG_CHANGED_EVENT, handleHeatmapChanged);
    return () => window.removeEventListener(HEATMAP_CONFIG_CHANGED_EVENT, handleHeatmapChanged);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let ambientRevision = 0;
    const requestRevision = ambientRevision;
    invoke<unknown>("get_ambient_settings")
      .then((cfg) => {
        if (isMounted && requestRevision === ambientRevision) {
          setAmbientMode(normalizeAmbientSettings(cfg).mode);
        }
      })
      .catch((err) => {
        if (isMounted) console.error(err);
      });

    const handleAmbientChanged = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (detail) {
        ambientRevision += 1;
        if (isMounted) {
          setAmbientMode(normalizeAmbientSettings(detail).mode);
        }
        return;
      }
      const currentRevision = ambientRevision;
      invoke<unknown>("get_ambient_settings")
        .then((cfg) => {
          if (isMounted && currentRevision === ambientRevision) {
            setAmbientMode(normalizeAmbientSettings(cfg).mode);
          }
        })
        .catch((err) => {
          if (isMounted) console.error(err);
        });
    };

    // Загрузка пресетов
    loadUserPresets()
      .then((presets) => {
        if (isMounted) setUserPresets(presets);
      })
      .catch((err) => {
        if (isMounted) console.error(err);
      });

    // Загрузка моделей апскейлинга
    invoke<UpscaleStatus>("get_upscale_status")
      .then((st) => {
        if (isMounted && st && Array.isArray(st.models)) {
          setUpscaleModels(st.models);
        }
      })
      .catch((err) => {
        if (isMounted) console.error(err);
      });

    const handleSettingsChanged = () => {
      setHotkeys(getCustomHotkeys());
      setHeatmapConfig(getHeatmapConfig());
      setCurrentTimePos(getSavedTimePosition());
      setTimeFormat(getSavedTimeFormat());
      setControlBarStyle(getSavedControlBarStyle());
      setRecentFiles(getRecentFiles());
      setActivePresetId(getSavedActivePresetId());
      setUpscaleMode((localStorage.getItem("l-mpv-upscale-mode") as "off" | "ai") || "off");
      setSelectedModel(localStorage.getItem("l-mpv-upscale-selected-model") || "");
      setSelectedSlot(Number(localStorage.getItem("l-mpv-upscale-slot") || 1001));
      setUpscaleBackend((localStorage.getItem("l-mpv-upscale-backend") as "DirectML" | "TensorRT") || "DirectML");
      try {
        const raw = localStorage.getItem("l-mpv-visible-buttons");
        if (raw) setVisibleButtons(JSON.parse(raw));
      } catch (e) {
        console.error(e);
      }
    };

    const handleRecentChanged = () => {
      setRecentFiles(getRecentFiles());
    };

    const handleLayoutChanged = () => {
      setMenuLayout(getSavedLayout());
    };

    const handlePresetsUpdated = () => {
      loadUserPresets().then(setUserPresets).catch(console.error);
    };

    const handlePresetApplied = (e: Event) => {
      const customEvent = e as CustomEvent<SettingsPreset>;
      if (customEvent.detail?.id) {
        setActivePresetId(customEvent.detail.id);
      } else {
        setActivePresetId(getSavedActivePresetId());
      }
    };

    window.addEventListener("l-mpv-settings-changed", handleSettingsChanged);
    window.addEventListener("l-mpv-ambient-changed", handleAmbientChanged);
    window.addEventListener("l-mpv-time-format-changed", handleSettingsChanged);
    window.addEventListener("l-mpv-control-bar-style-changed", handleSettingsChanged);
    window.addEventListener("l-mpv-recent-files-changed", handleRecentChanged);
    window.addEventListener(LAYOUT_CHANGED_EVENT, handleLayoutChanged);
    window.addEventListener("l-mpv-presets-updated", handlePresetsUpdated);
    window.addEventListener("l-mpv-preset-applied", handlePresetApplied);

    return () => {
      isMounted = false;
      window.removeEventListener("l-mpv-settings-changed", handleSettingsChanged);
      window.removeEventListener("l-mpv-ambient-changed", handleAmbientChanged);
      window.removeEventListener("l-mpv-time-format-changed", handleSettingsChanged);
      window.removeEventListener("l-mpv-control-bar-style-changed", handleSettingsChanged);
      window.removeEventListener("l-mpv-recent-files-changed", handleRecentChanged);
      window.removeEventListener(LAYOUT_CHANGED_EVENT, handleLayoutChanged);
      window.removeEventListener("l-mpv-presets-updated", handlePresetsUpdated);
      window.removeEventListener("l-mpv-preset-applied", handlePresetApplied);
    };
  }, []);

  // Позиционирование меню с учётом масштаба интерфейса и границ экрана.
  // Первый кадр скрыт (visibility), пока useLayoutEffect не замерит реальный
  // размер: иначе меню сначала рисуется по грубой оценке 220x440, а затем
  // видимо прыгает в измеренную позицию у краёв экрана.
  const [positioned, setPositioned] = useState(false);
  const [menuWidth, setMenuWidth] = useState(220);
  const [adjustedPos, setAdjustedPos] = useState(() => {
    if (typeof window === "undefined") return { x, y };
    const zoom = getUiScale();
    const cssX = x / zoom;
    const cssY = y / zoom;
    const cssInnerWidth = window.innerWidth / zoom;
    const cssInnerHeight = window.innerHeight / zoom;

    const estWidth = 220;
    const estHeight = 440;

    const newX = cssX + estWidth> cssInnerWidth ? cssX - estWidth : cssX;
    const newY = cssY + estHeight> cssInnerHeight ? cssY - estHeight : cssY;

    return {
      x: Math.max(0, newX),
      y: Math.max(0, newY),
    };
  });

  useLayoutEffect(() => {
    if (menuRef.current) {
      const zoom = getUiScale();
      const rect = menuRef.current.getBoundingClientRect();
      const cssWidth = rect.width / zoom;
      const cssHeight = rect.height / zoom;
      const cssX = x / zoom;
      const cssY = y / zoom;
      const cssInnerWidth = window.innerWidth / zoom;
      const cssInnerHeight = window.innerHeight / zoom;

      const newX = cssX + cssWidth> cssInnerWidth ? cssX - cssWidth : cssX;
      const newY = cssY + cssHeight> cssInnerHeight ? cssY - cssHeight : cssY;

      setAdjustedPos({
        x: Math.max(0, newX),
        y: Math.max(0, newY),
      });
      setMenuWidth(cssWidth);
      setPositioned(true);
    }
  }, [x, y]);

  // Инициализация скорости из стейта
  useEffect(() => {
    if (mediaInfo) {
      setCurrentSpeed(mediaInfo.speed || 1.0);
    }
  }, [mediaInfo?.speed]);

  // Активный режим масштабирования кадра в окне (растянуть / вписать / заполнить)
  useEffect(() => {
    invoke<string>("get_frame_mode")
      .then((mode) => {
        if (mode === "stretch" || mode === "fit" || mode === "fill") {
          setFrameMode(mode);
        }
      })
      .catch(console.error);
  }, []);

  // Активный режим повтора, чтобы подменю сразу показывало отметку
  useEffect(() => {
    invoke<number>("get_repeat_mode")
      .then((mode) => {
        if (mode === 0 || mode === 1 || mode === 2) {
          setRepeatMode(mode);
        }
      })
      .catch(console.error);
  }, []);

  const clearSubmenuTimers = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const { isClosing, handleClose } = useOverlayDismiss({
    onClose,
    kind: "pop",
    closeOnEscape: true,
    onBeforeClose: clearSubmenuTimers,
  });

  useEffect(() => {
    return () => {
      clearSubmenuTimers();
    };
  }, [clearSubmenuTimers]);

  // Закрытие по клику вне меню
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [handleClose]);

  // ─── Обработчики команд (мемоизированы для стабильности ссылок) ───
  const handleSelectAudio = useCallback(async (id: number) => {
    await selectAudioTrack(id);
  }, [selectAudioTrack]);

  const handleSelectSub = useCallback(async (id: number) => {
    await selectSubTrack(id);
  }, [selectSubTrack]);

  const handleDisableSubs = useCallback(async () => {
    await disableSubtitles();
  }, [disableSubtitles]);

  const handleLoadSubFile = useCallback(async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [{ name: "Subtitles", extensions: ["srt", "ass", "vtt", "sub"] }],
      });
      if (file) {
        await invoke("load_subtitle_file", { path: file });
      }
    } catch (e) {
      console.error("Ошибка загрузки внешних субтитров:", e);
      showOsd(dict.osd.subtitlesLoadErr, { isError: true });
    }
    handleClose();
  }, [dict.osd.subtitlesLoadErr, handleClose]);

  const handleSetSpeed = useCallback(async (speed: number) => {
    try {
      await invoke("set_speed", { speed });
      setCurrentSpeed(speed);
    } catch (e) {
      console.error("Ошибка установки скорости воспроизведения:", e);
    }
  }, []);

  const handleSetFrameMode = useCallback(async (mode: "stretch" | "fit" | "fill") => {
    try {
      await invoke("set_frame_mode", { mode });
      setFrameMode(mode);
      const labels = {
        stretch: dict.settings.cmenuUI.frameStretch,
        fit: dict.settings.cmenuUI.frameFit,
        fill: dict.settings.cmenuUI.frameFill,
      };
      showOsd(dict.settings.cmenuUI.osdFrame(labels[mode]));
    } catch (e) {
      console.error("Ошибка смены режима видеокадра:", e);
      showOsd(dict.settings.cmenuUI.errFrame(String(e)), { isError: true });
    }
  }, [dict.settings.cmenuUI]);

  const handleSetRotation = useCallback(async (degrees: number) => {
    try {
      await invoke("set_rotation", { degrees });
      setCurrentRotation(degrees);
    } catch (e) {
      console.error("Ошибка установки поворота видео:", e);
    }
  }, []);

  const handleSetAmbientMode = useCallback(async (mode: AmbientMode) => {
    try {
      const cfg = await invoke<unknown>("get_ambient_settings");
      const updated = normalizeAmbientSettings({ ...normalizeAmbientSettings(cfg), mode });
      await invoke("set_ambient_settings", { settings: updated });
      setAmbientMode(updated.mode);
      const labels: Record<AmbientMode, string> = {
        off: dict.settings.cmenuUI.ambientOff,
        blur: dict.settings.cmenuUI.ambientBlur,
        color: dict.settings.cmenuUI.ambientColor,
      };
      showOsd(dict.settings.cmenuUI.osdAmbient(labels[updated.mode] || updated.mode));
      window.dispatchEvent(new CustomEvent("l-mpv-ambient-changed", { detail: updated }));
      window.dispatchEvent(new Event("l-mpv-settings-changed"));
    } catch (e) {
      console.error("Ошибка смены режима подсветки полос:", e);
    }
  }, [dict.settings.cmenuUI]);

  const handleToggleAlwaysOnTop = useCallback(async () => {
    try {
      const appWindow = getCurrentWindow();
      const isTop = await appWindow.isAlwaysOnTop();
      await appWindow.setAlwaysOnTop(!isTop);
    } catch (e) {
      console.error("Ошибка переключения режима поверх окон:", e);
    }
    handleClose();
  }, [handleClose]);

  const handleTakeScreenshot = useCallback(async () => {
    try {
      await invoke("take_screenshot");
      showOsd(dict.settings.cmenuUI.osdScreenshot);
    } catch (e) {
      console.error("Ошибка при сохранении кадра:", e);
      showOsd(dict.settings.cmenuUI.osdScreenshotErr, { isError: true });
    }
    handleClose();
  }, [handleClose, dict.settings.cmenuUI]);

  const handleSetRepeatMode = useCallback(async (mode: 0 | 1 | 2) => {
    try {
      await invoke("set_repeat_mode", { mode });
      setRepeatMode(mode);
      const labels = {
        0: dict.settings.cmenuUI.repeatOff,
        1: dict.settings.cmenuUI.repeatOne,
        2: dict.settings.cmenuUI.repeatAll,
      } as const;
      showOsd(dict.settings.cmenuUI.osdRepeat(labels[mode]));
    } catch (e) {
      console.error("Ошибка установки режима повтора:", e);
      showOsd(dict.settings.cmenuUI.errRepeat(String(e)), { isError: true });
    }
  }, [dict.settings.cmenuUI]);

  const handleToggleShuffle = useCallback(() => {
    invoke("toggle_shuffle").catch(console.error);
    handleClose();
  }, [handleClose]);

  const handleClearRecent = useCallback(() => {
    clearRecentFiles();
    setRecentFiles([]);
  }, []);

  // ── Обработчики пресетов ──────────────────────────
  const handleApplyPreset = useCallback(async (preset: SettingsPreset) => {
    try {
      await applySettingsPreset(preset);
      setActivePresetId(preset.id);
      showOsd(dict.settings.cmenuUI.osdPreset(preset.name));
    } catch (e) {
      console.error("Ошибка применения пресета:", e);
      showOsd(dict.settings.cmenuUI.osdPresetErr, { isError: true });
    }
  }, [dict.settings.cmenuUI]);

  // ── Обработчики апскейлинга ────────────────────────
  const handleSetUpscaleOff = useCallback(async () => {
    const updated: UpscaleSettings = {
      mode: "off",
      active_slot: selectedSlot,
      backend: upscaleBackend,
      selected_model: selectedModel,
    };
    try {
      await invoke("apply_upscale_settings", { settings: updated });
      setUpscaleMode("off");
      localStorage.setItem("l-mpv-upscale-mode", "off");
      showOsd(dict.settings.cmenuUI.osdUpscaleOff);
      window.dispatchEvent(new Event("l-mpv-settings-changed"));
    } catch (e) {
      console.error("Ошибка выключения апскейлинга:", e);
    }
  }, [selectedSlot, upscaleBackend, selectedModel, dict.settings.cmenuUI]);

  const handleSelectUpscaleModel = useCallback(async (model: ModelFileItem) => {
    const updated: UpscaleSettings = {
      mode: "ai",
      active_slot: model.slot,
      backend: upscaleBackend,
      selected_model: model.filename,
    };
    try {
      await invoke("apply_upscale_settings", { settings: updated });
      setUpscaleMode("ai");
      setSelectedModel(model.filename);
      setSelectedSlot(model.slot);
      localStorage.setItem("l-mpv-upscale-mode", "ai");
      localStorage.setItem("l-mpv-upscale-selected-model", model.filename);
      localStorage.setItem("l-mpv-upscale-slot", String(model.slot));
      showOsd(dict.settings.cmenuUI.osdUpscaleModel(model.display_name || model.filename));
      window.dispatchEvent(new Event("l-mpv-settings-changed"));
    } catch (e) {
      console.error("Ошибка включения модели апскейлинга:", e);
      showOsd(dict.settings.cmenuUI.osdUpscaleModelErr, { isError: true });
    }
  }, [upscaleBackend, dict.settings.cmenuUI]);

  // ── Обработчик переключения видимости кнопки панели ─
  const handleToggleControlButton = useCallback((buttonId: string, label: string, currentVal: boolean) => {
    const nextVal = !currentVal;
    const updated = { ...visibleButtons, [buttonId]: nextVal };
    setVisibleButtons(updated);
    localStorage.setItem("l-mpv-visible-buttons", JSON.stringify(updated));
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
    showOsd(dict.settings.cmenuUI.osdBtn(label, nextVal));
  }, [visibleButtons, dict.settings.cmenuUI]);

  const audioTracks = useMemo(() => tracks.filter((t) => t.type === "audio"), [tracks]);
  const subTracks = useMemo(() => tracks.filter((t) => t.type === "sub"), [tracks]);

  // ── Обработчики позиционирования времени, формата и стиля панели ──
  const handleSelectTimePosition = useCallback(
    (pos: TimeDisplayPosition, label: string) => {
      saveTimePosition(pos);
      setCurrentTimePos(pos);
      showOsd(dict.settings.cmenuUI.osdTime(label));
    },
    [dict.settings.cmenuUI]
  );

  const handleSelectTimeFormat = useCallback(
    (fmt: TimeFormatMode, label: string) => {
      saveTimeFormat(fmt);
      setTimeFormat(fmt);
      showOsd(dict.settings.cmenuUI.osdTimeFmt(label));
    },
    [dict.settings.cmenuUI]
  );

  const handleSelectControlBarStyle = useCallback(
    (style: ControlBarStyle, label: string) => {
      saveControlBarStyle(style);
      setControlBarStyle(style);
      showOsd(dict.settings.cmenuUI.osdBarStyle(label));
    },
    [dict.settings.cmenuUI]
  );

  // ── Обработчики тепловой карты (Activity Heatmap) ──
  const handleToggleHeatmap = useCallback(() => {
    const nextState = !heatmapConfig.enabled;
    const updated = saveHeatmapConfig({ enabled: nextState });
    setHeatmapConfig(updated);
    showOsd(
      nextState
        ? dict.settings.cmenuUI.osdHeatmapOn
        : dict.settings.cmenuUI.osdHeatmapOff
    );
  }, [heatmapConfig.enabled, dict.settings.cmenuUI]);

  const handleSetHeatmapSource = useCallback(
    (source: HeatmapDataSource) => {
      const updated = saveHeatmapConfig({ dataSource: source });
      setHeatmapConfig(updated);
      const sourceName =
        source === "audio"
          ? dict.settings.appearance.heatmap?.sources?.audio || "Громкость звука"
          : dict.settings.appearance.heatmap?.sources?.videoBitrate || "Битрейт видео";
      showOsd(`${dict.settings.cmenuUI.heatmap}: ${sourceName}`);
    },
    [dict.settings.cmenuUI, dict.settings.appearance.heatmap?.sources]
  );

  const handleSetHeatmapStyle = useCallback(
    (style: HeatmapStyle) => {
      const updated = saveHeatmapConfig({ style });
      setHeatmapConfig(updated);
      const styleName =
        style === "bars"
          ? dict.settings.appearance.heatmap?.styles?.bars || "Столбики"
          : style === "spline"
          ? dict.settings.appearance.heatmap?.styles?.spline || "Сплайн-рельеф"
          : dict.settings.appearance.heatmap?.styles?.blocks || "Ступенчатые блоки";
      showOsd(`${dict.settings.cmenuUI.heatmap}: ${styleName}`);
    },
    [dict.settings.cmenuUI, dict.settings.appearance.heatmap?.styles]
  );

  // ─── Динамическая сборка пунктов меню через модульную фабрику ─────
  const menuItems: MenuItem[] = useMemo(
    () =>
      buildContextMenuItems({
        dict,
        menuLayout,
        recentFiles,
        audioTracks,
        subTracks,
        downloadingTrackKey,
        ambientMode,
        currentSpeed,
        currentRotation,
        frameMode,
        repeatMode,
        currentTimePos,
        timeFormat,
        controlBarStyle,
        userPresets,
        activePresetId,
        upscaleModels,
        upscaleMode,
        selectedModel,
        selectedSlot,
        visibleButtons,
        hotkeys,
        onOpenFile,
        onShowChapters,
        onShowSubtitlesSearch,
        onShowMediaInfo,
        onShowDetailedMediaInfo,
        onShowSettings,
        handleClose,
        handleSelectAudio,
        handleSelectSub,
        handleDisableSubs,
        handleLoadSubFile,
        handleSetSpeed,
        handleSetFrameMode,
        handleSetRotation,
        handleSetAmbientMode,
        handleDownloadTrack,
        handleToggleAlwaysOnTop,
        handleTakeScreenshot,
        handleSetRepeatMode,
        handleToggleShuffle,
        handleClearRecent,
        handleApplyPreset,
        handleSetUpscaleOff,
        handleSelectUpscaleModel,
        handleToggleControlButton,
        handleSelectTimePosition,
        handleSelectTimeFormat,
        handleSelectControlBarStyle,
        heatmapConfig,
        handleToggleHeatmap,
        handleSetHeatmapSource,
        handleSetHeatmapStyle,
      }),
    [
      dict,
      menuLayout,
      recentFiles,
      audioTracks,
      subTracks,
      downloadingTrackKey,
      ambientMode,
      currentSpeed,
      currentRotation,
      frameMode,
      repeatMode,
      currentTimePos,
      timeFormat,
      controlBarStyle,
      userPresets,
      activePresetId,
      upscaleModels,
      upscaleMode,
      selectedModel,
      selectedSlot,
      visibleButtons,
      hotkeys,
      onOpenFile,
      onShowChapters,
      onShowSubtitlesSearch,
      onShowMediaInfo,
      onShowDetailedMediaInfo,
      onShowSettings,
      handleClose,
      handleSelectAudio,
      handleSelectSub,
      handleDisableSubs,
      handleLoadSubFile,
      handleSetSpeed,
      handleSetFrameMode,
      handleSetRotation,
      handleSetAmbientMode,
      handleDownloadTrack,
      handleToggleAlwaysOnTop,
      handleTakeScreenshot,
      handleSetRepeatMode,
      handleToggleShuffle,
      handleClearRecent,
      handleApplyPreset,
      handleSetUpscaleOff,
      handleSelectUpscaleModel,
      handleToggleControlButton,
      handleSelectTimePosition,
      handleSelectTimeFormat,
      handleSelectControlBarStyle,
      heatmapConfig,
      handleToggleHeatmap,
      handleSetHeatmapSource,
      handleSetHeatmapStyle,
    ]
  );

  // Проверка близости к правому краю для открытия подменю влево.
  // Ширина меню — измеренная (а не константа), ширина подменю — оценка 220.
  const isRightScreenEdge = useMemo(() => {
    if (typeof window === "undefined") return false;
    const zoom = getUiScale();
    return adjustedPos.x + menuWidth + 220> (window.innerWidth / zoom);
  }, [adjustedPos.x, menuWidth]);

  // Красивая точка роста меню: origin следует за реальным флипом по X/Y
  const menuOrigin = useMemo(() => {
    const zoom = getUiScale();
    const cssX = x / zoom;
    const cssY = y / zoom;
    const flippedX = adjustedPos.x < cssX - 1;
    const flippedY = adjustedPos.y < cssY - 1;
    const vertical = flippedY ? "bottom" : "top";
    const horizontal = flippedX ? "right" : "left";
    return `${vertical} ${horizontal}`;
  }, [adjustedPos.x, adjustedPos.y, x, y]);

  // ─── Рендеринг пункта меню ────────────────────────
  const renderItem = useCallback(
    (item: MenuItem, index: number, isSubmenuChild: boolean = false) => {
      if (item.type === "divider") {
        return (
          <div
            key={`divider-${index}`}
            role="separator"
            className="context-menu__divider"
            onMouseEnter={() => {
              if (openTimerRef.current !== null) {
                window.clearTimeout(openTimerRef.current);
                openTimerRef.current = null;
              }
              if (!isSubmenuChild) {
                if (closeTimerRef.current !== null) {
                  window.clearTimeout(closeTimerRef.current);
                }
                closeTimerRef.current = window.setTimeout(() => {
                  setActiveSubmenu(null);
                  closeTimerRef.current = null;
                }, 250);
              } else if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
              }
            }}
          />
        );
      }

      if (item.type === "track") {
        return (
          <div
            key={`track-${index}`}
            role="none"
            className="context-menu__track-row"
            onMouseEnter={() => {
              if (openTimerRef.current !== null) {
                window.clearTimeout(openTimerRef.current);
                openTimerRef.current = null;
              }
              if (!isSubmenuChild) {
                if (closeTimerRef.current !== null) {
                  window.clearTimeout(closeTimerRef.current);
                }
                closeTimerRef.current = window.setTimeout(() => {
                  setActiveSubmenu(null);
                  closeTimerRef.current = null;
                }, 250);
              } else if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
              }
            }}
            >
            <button
              type="button"
              role={item.indicator === "dot" ? "menuitemradio" : "menuitemcheckbox"}
              aria-checked={Boolean(item.active)}
              className={`context-menu__track-btn ${
                item.active ? "context-menu__track-btn--active" : ""
              }`}
              onClick={item.action}
              >
              <span className="context-menu__track-title">{item.label}</span>
              <span className="context-menu__track-check">
                {item.active && (
                  <span className="context-menu__radio-dot" aria-hidden="true" />
                )}
              </span>
            </button>
            {item.onDownload && (
              <button
                type="button"
                className="track-download-btn"
                aria-label={item.downloadTitle || dict.controls.downloadAudio}
                title={item.downloadTitle || dict.controls.downloadAudio}
                disabled={item.isDownloading}
                onClick={(e) => {
                  e.stopPropagation();
                  item.onDownload?.();
                }}
                >
                {item.isDownloading ? (
                  <Loader2 size={13} className="spin-animation" />
                ) : (
                  <Download size={13} />
                )}
              </button>
            )}
          </div>
        );
      }

      if (item.type === "submenu") {
        const submenuId = `submenu-${index}`;
        const isBottomHalf = index > menuItems.length / 2;
        const isSubmenuOpen = activeSubmenu === submenuId;
        return (
          <div
            key={submenuId}
            role="none"
            style={{
              position: "relative",
              zIndex: isSubmenuOpen ? 100 : 1,
            }}
            onMouseEnter={() => {
              if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
              }
              if (activeSubmenu === submenuId) {
                if (openTimerRef.current !== null) {
                  window.clearTimeout(openTimerRef.current);
                  openTimerRef.current = null;
                }
                return;
              }
              if (openTimerRef.current !== null) {
                window.clearTimeout(openTimerRef.current);
              }
              // Защита безопасного перехода: если другое подменю уже открыто,
              // переключаемся с небольшой задержкой (hover-intent 150мс),
              // чтобы диагональный транзит мыши не ломал текущее открытое подменю
              const delay = activeSubmenu ? 150 : 50;
              openTimerRef.current = window.setTimeout(() => {
                setActiveSubmenu(submenuId);
                openTimerRef.current = null;
              }, delay);
            }}
            onMouseLeave={() => {
              if (openTimerRef.current !== null) {
                window.clearTimeout(openTimerRef.current);
                openTimerRef.current = null;
              }
              if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
              }
              closeTimerRef.current = window.setTimeout(() => {
                setActiveSubmenu(null);
                closeTimerRef.current = null;
              }, 250);
            }}
            >
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={isSubmenuOpen}
              className={`context-menu__item ${isSubmenuOpen ? "context-menu__item--submenu-open" : ""} ${
                isRightScreenEdge ? "context-menu__item--submenu-left" : ""
              }`}
              onClick={item.action}
              >
              <span className="context-menu__item-icon">
                {item.icon}
              </span>
              <span className="context-menu__item-label">
                {item.label}
              </span>
              <ChevronRight size={15} style={{ opacity: 0.5 }} />
            </button>

            {isSubmenuOpen && item.children && (
              <div
                role="menu"
                aria-label={item.label}
                className={`context-menu__submenu ${
                  item.submenuClassName || ""
                } ${isRightScreenEdge ? "context-menu__submenu--left" : ""} ${
                  isBottomHalf ? "context-menu__submenu--bottom" : ""
                }`}
                onMouseEnter={() => {
                  if (closeTimerRef.current !== null) {
                    window.clearTimeout(closeTimerRef.current);
                    closeTimerRef.current = null;
                  }
                  if (openTimerRef.current !== null) {
                    window.clearTimeout(openTimerRef.current);
                    openTimerRef.current = null;
                  }
                }}
                >
                {groupSubmenuChildren(item.children).map((group, gi) => (
                  <div
                    key={`group-${gi}`}
                    role="group"
                    aria-label={group.header}
                    className="context-menu__group"
                  >
                    {group.header && (
                      <div className="context-menu__group-header" aria-hidden="true">
                        {group.header}
                      </div>
                    )}
                    {group.items.map((child, ci) => renderItem(child, ci, true))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      return (
        <button
          type="button"
          key={`item-${index}`}
          role={
            item.active !== undefined
              ? item.indicator === "dot"
                ? "menuitemradio"
                : "menuitemcheckbox"
              : "menuitem"
          }
          aria-checked={item.active !== undefined ? Boolean(item.active) : undefined}
          className={`context-menu__item ${
            item.active ? "context-menu__item--active" : ""
          } ${item.disabled ? "context-menu__item--disabled" : ""}`}
          onClick={item.action}
          disabled={item.disabled}
          onMouseEnter={() => {
            if (openTimerRef.current !== null) {
              window.clearTimeout(openTimerRef.current);
              openTimerRef.current = null;
            }
            if (!isSubmenuChild) {
              if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
              }
              closeTimerRef.current = window.setTimeout(() => {
                setActiveSubmenu(null);
                closeTimerRef.current = null;
              }, 250);
            } else if (closeTimerRef.current !== null) {
              window.clearTimeout(closeTimerRef.current);
              closeTimerRef.current = null;
            }
          }}
          >
          {item.icon && (
            <span className="context-menu__item-icon">
              {item.icon}
            </span>
          )}
          <span className="context-menu__item-label context-menu__item-label--truncate">
            {item.label}
          </span>
          {item.active && (
            <span
              className="context-menu__radio-dot"
              style={{ marginLeft: "var(--space-3)" }}
              aria-hidden="true"
            />
          )}
          {item.shortcut && (
            <span className="context-menu__item-shortcut">
              {item.shortcut}
            </span>
          )}
        </button>
      );
    },
    [activeSubmenu, isRightScreenEdge, menuItems.length, dict.controls.downloadAudio]
  );

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={dict.controls.contextMenu}
      className={`context-menu ${isClosing ? "context-menu--closing" : ""}`}
      style={{
        left: adjustedPos.x,
        top: adjustedPos.y,
        transformOrigin: menuOrigin,
        visibility: positioned ? "visible" : "hidden",
      }}
      >
      {menuItems.map((item, index) => renderItem(item, index, false))}
    </div>
  );
}
