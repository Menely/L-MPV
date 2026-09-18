import { useEffect, useLayoutEffect, useCallback, useRef, useState, useMemo } from "react";
import { usePlayerState, type TrackInfo } from "../contexts/PlayerStateContext";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSavedLayout, LAYOUT_CHANGED_EVENT, type LayoutEntry } from "../utils/contextMenuLayout";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  AudioLines,
  Subtitles,
  BookOpen,
  Monitor,
  RotateCw,
  Zap,
  Pin,
  Info,
  Check,
  ChevronRight,
  Settings,
  Camera,
  Repeat,
  Shuffle,
  Download,
  Loader2,
  Sparkles,
  FileText,
  Clock,
  Film,
  Trash2,
  LayoutTemplate,
  Timer,
} from "lucide-react";
import {
  type TimeDisplayPosition,
  getSavedTimePosition,
  saveTimePosition,
  TIME_POSITION_OPTIONS,
} from "../utils/timePositionUtils";
import {
  type RecentFile,
  getRecentFiles,
  clearRecentFiles,
} from "../utils/recentFilesUtils";
import {
  type TimeFormatMode,
  getSavedTimeFormat,
  saveTimeFormat,
  TIME_FORMAT_OPTIONS,
} from "../utils/timeFormatUtils";
import {
  type ControlBarStyle,
  getSavedControlBarStyle,
  saveControlBarStyle,
  CONTROL_BAR_STYLE_OPTIONS,
} from "../utils/controlBarStyleUtils";

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
  /** Открытие модального окна настроек. */
  onShowSettings: () => void;
}

interface MenuItem {
  type: "item" | "divider" | "submenu" | "track";
  icon?: React.ReactNode;
  label?: string;
  shortcut?: string;
  action?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children?: MenuItem[];
  submenuClassName?: string;
  track?: TrackInfo;
  onDownload?: () => void;
  isDownloading?: boolean;
  downloadTitle?: string;
}

/** Вспомогательная функция безопасного получения коэффициента масштабирования интерфейса. */
function getUiScale(): number {
  if (typeof window === "undefined") return 1;
  const zoomStr = getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim();
  const zoom = zoomStr ? parseFloat(zoomStr) : 1;
  return Number.isNaN(zoom) || zoom <= 0 ? 1 : zoom;
}

/** Статические узлы иконок для предотвращения лишних пересозданий VNode при рендере. */
const STATIC_ICONS = {
  openFile: <FolderOpen size={15} />,
  openFileSub: <FolderOpen size={14} />,
  film: <Film size={14} />,
  trash: <Trash2 size={14} />,
  audioTrack: <AudioLines size={15} />,
  subtitleTrack: <Subtitles size={15} />,
  chapters: <BookOpen size={15} />,
  aspectRatio: <Monitor size={15} />,
  rotation: <RotateCw size={15} />,
  ambient: <Sparkles size={15} />,
  speed: <Zap size={15} />,
  repeatMode: <Repeat size={15} />,
  shuffle: <Shuffle size={15} />,
  alwaysOnTop: <Pin size={15} />,
  screenshot: <Camera size={15} />,
  mediaInfo: <Info size={15} />,
  detailedMediaInfo: <FileText size={15} />,
  timePosition: <Clock size={15} />,
  timeFormat: <Timer size={15} />,
  controlBarStyle: <LayoutTemplate size={15} />,
  settings: <Settings size={15} />,
};

export function ContextMenu({
  x,
  y,
  onClose,
  onOpenFile,
  onShowMediaInfo,
  onShowDetailedMediaInfo,
  onShowChapters,
  onShowSettings,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

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
  const [ambientMode, setAmbientMode] = useState<string>("off");
  const [currentTimePos, setCurrentTimePos] = useState<TimeDisplayPosition>(() => getSavedTimePosition());
  const [timeFormat, setTimeFormat] = useState<TimeFormatMode>(() => getSavedTimeFormat());
  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() => getSavedControlBarStyle());
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => getRecentFiles());
  const [menuLayout, setMenuLayout] = useState<LayoutEntry[]>(() => getSavedLayout());

  useEffect(() => {
    invoke<{ mode: string }>("get_ambient_settings")
      .then((cfg) => setAmbientMode(cfg.mode))
      .catch(console.error);

    const handleSettingsChanged = () => {
      setCurrentTimePos(getSavedTimePosition());
      setTimeFormat(getSavedTimeFormat());
      setControlBarStyle(getSavedControlBarStyle());
      setRecentFiles(getRecentFiles());
    };
    const handleRecentChanged = () => {
      setRecentFiles(getRecentFiles());
    };
    const handleLayoutChanged = () => {
      setMenuLayout(getSavedLayout());
    };

    window.addEventListener("l-mpv-settings-changed", handleSettingsChanged);
    window.addEventListener("l-mpv-time-format-changed", handleSettingsChanged);
    window.addEventListener("l-mpv-control-bar-style-changed", handleSettingsChanged);
    window.addEventListener("l-mpv-recent-files-changed", handleRecentChanged);
    window.addEventListener(LAYOUT_CHANGED_EVENT, handleLayoutChanged);

    return () => {
      window.removeEventListener("l-mpv-settings-changed", handleSettingsChanged);
      window.removeEventListener("l-mpv-time-format-changed", handleSettingsChanged);
      window.removeEventListener("l-mpv-control-bar-style-changed", handleSettingsChanged);
      window.removeEventListener("l-mpv-recent-files-changed", handleRecentChanged);
      window.removeEventListener(LAYOUT_CHANGED_EVENT, handleLayoutChanged);
    };
  }, []);

  // Позиционирование меню с учётом масштаба интерфейса и границ экрана
  const [adjustedPos, setAdjustedPos] = useState(() => {
    if (typeof window === "undefined") return { x, y };
    const zoom = getUiScale();
    const cssX = x / zoom;
    const cssY = y / zoom;
    const cssInnerWidth = window.innerWidth / zoom;
    const cssInnerHeight = window.innerHeight / zoom;

    const estWidth = 220;
    const estHeight = 440;

    const newX = cssX + estWidth > cssInnerWidth ? cssX - estWidth : cssX;
    const newY = cssY + estHeight > cssInnerHeight ? cssY - estHeight : cssY;

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

      const newX = cssX + cssWidth > cssInnerWidth ? cssX - cssWidth : cssX;
      const newY = cssY + cssHeight > cssInnerHeight ? cssY - cssHeight : cssY;

      setAdjustedPos({
        x: Math.max(0, newX),
        y: Math.max(0, newY),
      });
    }
  }, [x, y]);

  // Инициализация скорости из стейта
  useEffect(() => {
    if (mediaInfo) {
      setCurrentSpeed(mediaInfo.speed || 1.0);
    }
  }, [mediaInfo?.speed]);

  const [isClosing, setIsClosing] = useState(false);
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    const isNoAnim = typeof document !== "undefined" && document.documentElement.classList.contains("no-animations");
    if (isNoAnim) {
      onClose();
      return;
    }
    setIsClosing(true);
    closingTimerRef.current = setTimeout(() => {
      onClose();
    }, 120);
  }, [isClosing, onClose]);

  useEffect(() => {
    return () => {
      if (closingTimerRef.current) {
        clearTimeout(closingTimerRef.current);
        closingTimerRef.current = null;
      }
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  // Закрытие по клику вне меню или по Escape с анимацией
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [handleClose]);

  // ─── Обработчики команд (мемоизированы для стабильности ссылок) ───
  const handleSelectAudio = useCallback(async (id: number) => {
    await selectAudioTrack(id);
    handleClose();
  }, [selectAudioTrack, handleClose]);

  const handleSelectSub = useCallback(async (id: number) => {
    await selectSubTrack(id);
    handleClose();
  }, [selectSubTrack, handleClose]);

  const handleDisableSubs = useCallback(async () => {
    await disableSubtitles();
    handleClose();
  }, [disableSubtitles, handleClose]);

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
    }
    handleClose();
  }, [handleClose]);

  const handleSetSpeed = useCallback(async (speed: number) => {
    try {
      await invoke("set_speed", { speed });
      setCurrentSpeed(speed);
    } catch (e) {
      console.error("Ошибка установки скорости воспроизведения:", e);
    }
    handleClose();
  }, [handleClose]);

  const handleSetAspect = useCallback(async (ratio: string) => {
    try {
      await invoke("set_aspect_ratio", { ratio });
    } catch (e) {
      console.error("Ошибка установки соотношения сторон:", e);
    }
    handleClose();
  }, [handleClose]);

  const handleSetRotation = useCallback(async (degrees: number) => {
    try {
      await invoke("set_rotation", { degrees });
    } catch (e) {
      console.error("Ошибка установки поворота видео:", e);
    }
    handleClose();
  }, [handleClose]);

  const handleSetAmbientMode = useCallback(async (mode: "off" | "blur" | "color") => {
    try {
      const cfg = await invoke<{ mode: string; blur_radius: number; color: string }>("get_ambient_settings");
      const updated = { ...cfg, mode };
      await invoke("set_ambient_settings", { settings: updated });
      setAmbientMode(mode);
      const labels: Record<string, string> = {
        off: "Выкл",
        blur: "Размытие (GPU)",
        color: "Цветной Ambient",
      };
      window.dispatchEvent(new CustomEvent("show-osd", { detail: `Подсветка полос: ${labels[mode] || mode}` }));
      window.dispatchEvent(new Event("l-mpv-ambient-changed"));
    } catch (e) {
      console.error("Ошибка смены режима подсветки полос:", e);
    }
    handleClose();
  }, [handleClose]);

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
      window.dispatchEvent(new CustomEvent("show-osd", { detail: "Кадр сохранён" }));
    } catch (e) {
      console.error("Ошибка при сохранении кадра:", e);
      window.dispatchEvent(new CustomEvent("show-osd", { detail: "Ошибка сохранения кадра" }));
    }
    handleClose();
  }, [handleClose]);

  const handleSetRepeatMode = useCallback((mode: number) => {
    invoke("set_repeat_mode", { mode }).catch(console.error);
    handleClose();
  }, [handleClose]);

  const handleToggleShuffle = useCallback(() => {
    invoke("toggle_shuffle").catch(console.error);
    handleClose();
  }, [handleClose]);

  const handleClearRecent = useCallback(() => {
    clearRecentFiles();
    setRecentFiles([]);
  }, []);

  const audioTracks = useMemo(() => tracks.filter((t) => t.type === "audio"), [tracks]);
  const subTracks = useMemo(() => tracks.filter((t) => t.type === "sub"), [tracks]);

  // ─── Динамическая сборка пунктов меню из пользовательской раскладки ─────
  const menuItems: MenuItem[] = useMemo(() => {
    const rawItems: MenuItem[] = [];
    const factories: Record<string, (() => MenuItem) | undefined> = {
      open_file: () => ({
        type: "submenu",
        icon: STATIC_ICONS.openFile,
        label: "Открыть файл...",
        action: () => { onOpenFile?.(); handleClose(); },
        submenuClassName: "context-menu__submenu--recent",
        children: [
          { type: "item", icon: STATIC_ICONS.openFileSub, label: "Выбрать на диске...", shortcut: "Ctrl+O", action: () => { onOpenFile?.(); handleClose(); } },
          { type: "divider" },
          ...(recentFiles.length > 0
            ? [
                ...recentFiles.map((rf) => ({ type: "item" as const, icon: STATIC_ICONS.film, label: rf.title, title: rf.path, action: () => { onOpenFile?.(rf.path); handleClose(); } })),
                { type: "divider" as const },
                { type: "item" as const, icon: STATIC_ICONS.trash, label: "Очистить историю", action: handleClearRecent },
              ]
            : [{ type: "item" as const, label: "История файлов пуста", disabled: true }]),
        ],
      }),
      audio_track: () => ({
        type: "submenu", icon: STATIC_ICONS.audioTrack, label: "Аудиодорожка",
        submenuClassName: "context-menu__submenu--tracks",
        children: audioTracks.length > 0
          ? audioTracks.map((t) => ({ type: "track" as const, track: t, label: `${t.title || `Дорожка ${t.id}`} ${t.lang ? `(${t.lang})` : ""}`, active: t.selected, action: () => handleSelectAudio(t.id), onDownload: () => handleDownloadTrack(t), isDownloading: downloadingTrackKey === `audio-${t.id}`, downloadTitle: "Скачать аудиодорожку" }))
          : [{ type: "item" as const, label: "Нет доступных аудиодорожек" }],
      }),
      subtitle_track: () => ({
        type: "submenu", icon: STATIC_ICONS.subtitleTrack, label: "Субтитры",
        submenuClassName: "context-menu__submenu--tracks",
        children: [
          { type: "track" as const, label: "Выключить субтитры", active: !subTracks.some((t) => t.selected), action: handleDisableSubs },
          ...subTracks.map((t) => ({ type: "track" as const, track: t, label: `${t.title || `Субтитры ${t.id}`} ${t.lang ? `(${t.lang})` : ""}`, active: t.selected, action: () => handleSelectSub(t.id), onDownload: () => handleDownloadTrack(t), isDownloading: downloadingTrackKey === `sub-${t.id}`, downloadTitle: "Скачать субтитры" })),
          { type: "divider" },
          { type: "item" as const, icon: STATIC_ICONS.openFileSub, label: "Загрузить субтитры...", action: handleLoadSubFile },
        ],
      }),
      chapters: () => ({ type: "item", icon: STATIC_ICONS.chapters, label: "Главы", action: () => { onShowChapters(); handleClose(); } }),
      aspect_ratio: () => ({
        type: "submenu", icon: STATIC_ICONS.aspectRatio, label: "Соотношение сторон",
        children: [
          { type: "item", label: "Оригинальное", action: () => handleSetAspect("no") },
          { type: "item", label: "16:9", action: () => handleSetAspect("16:9") },
          { type: "item", label: "21:9 (CinemaScope)", action: () => handleSetAspect("21:9") },
          { type: "item", label: "4:3", action: () => handleSetAspect("4:3") },
        ],
      }),
      rotation: () => ({
        type: "submenu", icon: STATIC_ICONS.rotation, label: "Поворот видео",
        children: [
          { type: "item", label: "0° (исходное)", action: () => handleSetRotation(0) },
          { type: "item", label: "90° по часовой", action: () => handleSetRotation(90) },
          { type: "item", label: "180°", action: () => handleSetRotation(180) },
          { type: "item", label: "270° по часовой", action: () => handleSetRotation(270) },
        ],
      }),
      ambient: () => ({
        type: "submenu", icon: STATIC_ICONS.ambient, label: "Подсветка полос",
        children: [
          { type: "item", label: "Выключено", active: ambientMode === "off", action: () => handleSetAmbientMode("off") },
          { type: "item", label: "Размытие видео", active: ambientMode === "blur", action: () => handleSetAmbientMode("blur") },
          { type: "item", label: "Подсветка под цвет", active: ambientMode === "color", action: () => handleSetAmbientMode("color") },
        ],
      }),
      speed: () => ({
        type: "submenu", icon: STATIC_ICONS.speed, label: "Скорость воспроизведения",
        children: [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => ({ type: "item" as const, label: `${s}x${s === 1.0 ? " (Нормальная)" : ""}`, active: currentSpeed === s, action: () => handleSetSpeed(s) })),
      }),
      repeat_mode: () => ({
        type: "submenu", icon: STATIC_ICONS.repeatMode, label: "Режим повтора",
        children: [
          { type: "item", label: "Без повтора", action: () => handleSetRepeatMode(0) },
          { type: "item", label: "Повтор одного файла", action: () => handleSetRepeatMode(1) },
          { type: "item", label: "Повтор всего плейлиста", action: () => handleSetRepeatMode(2) },
        ],
      }),
      shuffle: () => ({ type: "item", icon: STATIC_ICONS.shuffle, label: "Случайный порядок", action: handleToggleShuffle }),
      always_on_top: () => ({
        type: "item", icon: STATIC_ICONS.alwaysOnTop, label: "Поверх всех окон",
        action: handleToggleAlwaysOnTop,
      }),
      screenshot: () => ({
        type: "item", icon: STATIC_ICONS.screenshot, label: "Сохранить кадр", shortcut: "S",
        action: handleTakeScreenshot,
      }),
      media_info: () => ({ type: "item", icon: STATIC_ICONS.mediaInfo, label: "Информация о файле", shortcut: "I", action: () => { onShowMediaInfo(); handleClose(); } }),
      detailed_media_info: () => ({ type: "item", icon: STATIC_ICONS.detailedMediaInfo, label: "L-MPV MediaInfo", shortcut: "Shift+F10", action: () => { onShowDetailedMediaInfo?.(); handleClose(); } }),
      time_position: () => ({
        type: "submenu", icon: STATIC_ICONS.timePosition, label: "Расположение времени",
        children: TIME_POSITION_OPTIONS.map((posOption) => ({ type: "item" as const, label: posOption.label, active: currentTimePos === posOption.id, action: () => { saveTimePosition(posOption.id); setCurrentTimePos(posOption.id); window.dispatchEvent(new CustomEvent("show-osd", { detail: `Время: ${posOption.label}` })); handleClose(); } })),
      }),
      time_format: () => ({
        type: "submenu", icon: STATIC_ICONS.timeFormat, label: "Формат времени",
        children: TIME_FORMAT_OPTIONS.map((fmtOption) => ({ type: "item" as const, label: fmtOption.label, active: timeFormat === fmtOption.id, action: () => { saveTimeFormat(fmtOption.id); setTimeFormat(fmtOption.id); window.dispatchEvent(new CustomEvent("show-osd", { detail: `Формат: ${fmtOption.label}` })); handleClose(); } })),
      }),
      control_bar_style: () => ({
        type: "submenu", icon: STATIC_ICONS.controlBarStyle, label: "Стиль панели",
        children: CONTROL_BAR_STYLE_OPTIONS.map((barOption) => ({ type: "item" as const, label: barOption.label, active: controlBarStyle === barOption.id, action: () => { saveControlBarStyle(barOption.id); setControlBarStyle(barOption.id); window.dispatchEvent(new CustomEvent("show-osd", { detail: `Стиль панели: ${barOption.label}` })); handleClose(); } })),
      }),
      settings: () => ({ type: "item", icon: STATIC_ICONS.settings, label: "Настройки", shortcut: "F2", action: () => { onShowSettings(); handleClose(); } }),
    };

    for (const entry of menuLayout) {
      if (entry.type === "divider") {
        rawItems.push({ type: "divider" });
      } else {
        const factory = factories[entry.id];
        if (factory) rawItems.push(factory());
      }
    }

    // Нормализация разделителей: удаление краевых и смежных дубликатов
    const normalized: MenuItem[] = [];
    for (const item of rawItems) {
      if (item.type === "divider") {
        if (normalized.length === 0 || normalized[normalized.length - 1].type === "divider") {
          continue;
        }
      }
      normalized.push(item);
    }
    if (normalized.length > 0 && normalized[normalized.length - 1].type === "divider") {
      normalized.pop();
    }

    return normalized;
  }, [
    menuLayout, recentFiles, audioTracks, subTracks,
    downloadingTrackKey, ambientMode, currentSpeed,
    currentTimePos, timeFormat, controlBarStyle,
    onOpenFile, onShowChapters, onShowMediaInfo,
    onShowDetailedMediaInfo, onShowSettings, handleClose,
    handleSelectAudio, handleSelectSub, handleDisableSubs,
    handleLoadSubFile, handleSetSpeed, handleSetAspect,
    handleSetRotation, handleSetAmbientMode, handleDownloadTrack,
    handleToggleAlwaysOnTop, handleTakeScreenshot, handleSetRepeatMode,
    handleToggleShuffle, handleClearRecent,
  ]);

  // Проверка близости к правому краю для открытия подменю влево
  const isRightScreenEdge = useMemo(() => {
    if (typeof window === "undefined") return false;
    const zoom = getUiScale();
    return adjustedPos.x + 220 + 220 > (window.innerWidth / zoom);
  }, [adjustedPos.x]);

  // ─── Рендеринг пункта меню ────────────────────────
  const renderItem = useCallback(
    (item: MenuItem, index: number) => {
      if (item.type === "divider") {
        return (
          <div
            key={`divider-${index}`}
            className="context-menu__divider"
          />
        );
      }

      if (item.type === "track") {
        return (
          <div key={`track-${index}`} className="context-menu__track-row">
            <button
              type="button"
              className={`context-menu__track-btn ${
                item.active ? "context-menu__track-btn--active" : ""
              }`}
              onClick={item.action}
              title={item.label}
            >
              <span className="context-menu__track-title">{item.label}</span>
              <span className="context-menu__track-check">
                {item.active && <Check size={14} />}
              </span>
            </button>
            {item.onDownload && (
              <button
                type="button"
                className="track-download-btn"
                title={item.downloadTitle || "Скачать"}
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
        return (
          <div
            key={submenuId}
            style={{ position: "relative" }}
            onMouseEnter={() => {
              if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
              }
              setActiveSubmenu(submenuId);
            }}
            onMouseLeave={() => {
              if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
              }
              closeTimerRef.current = window.setTimeout(() => {
                setActiveSubmenu(null);
              }, 300);
            }}
          >
            <button
              type="button"
              className="context-menu__item"
              onClick={item.action}
              title={item.title || (typeof item.label === "string" ? item.label : undefined)}
            >
              <span className="context-menu__item-icon">
                {item.icon}
              </span>
              <span className="context-menu__item-label">
                {item.label}
              </span>
              <ChevronRight size={14} style={{ opacity: 0.5 }} />
            </button>

            {activeSubmenu === submenuId && item.children && (
              <div
                className={`context-menu context-menu__submenu ${
                  item.submenuClassName || ""
                } ${isRightScreenEdge ? "context-menu__submenu--left" : ""} ${
                  isBottomHalf ? "context-menu__submenu--bottom" : ""
                }`}
              >
                {item.children.map((child, ci) => renderItem(child, ci))}
              </div>
            )}
          </div>
        );
      }

      return (
        <button
          type="button"
          key={`item-${index}`}
          className={`context-menu__item ${
            item.active ? "context-menu__item--active" : ""
          } ${item.disabled ? "context-menu__item--disabled" : ""}`}
          onClick={item.action}
          disabled={item.disabled}
          title={item.title || (typeof item.label === "string" ? item.label : undefined)}
        >
          {item.icon && (
            <span className="context-menu__item-icon">
              {item.icon}
            </span>
          )}
          <span className="context-menu__item-label context-menu__item-label--truncate">
            {item.label}
          </span>
          {item.active && <Check size={14} style={{ marginLeft: 6 }} />}
          {item.shortcut && (
            <span className="context-menu__item-shortcut">
              {item.shortcut}
            </span>
          )}
        </button>
      );
    },
    [activeSubmenu, isRightScreenEdge, menuItems.length]
  );

  return (
    <div
      ref={menuRef}
      className={`context-menu ${isClosing ? "context-menu--closing" : ""}`}
      style={{
        left: adjustedPos.x,
        top: adjustedPos.y,
      }}
    >
      {menuItems.map((item, index) => renderItem(item, index))}
    </div>
  );
}
