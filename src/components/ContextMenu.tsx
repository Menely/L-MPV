import { useEffect, useCallback, useRef, useState, useMemo } from "react";
import { usePlayerState, TrackInfo } from "../contexts/PlayerStateContext";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
} from "lucide-react";

interface ContextMenuProps {
  /** Координата X для отображения меню. */
  x: number;
  /** Координата Y для отображения меню. */
  y: number;
  /** Обработчик закрытия меню. */
  onClose: () => void;
  /** Открытие файла. */
  onOpenFile?: () => void;
  /** Открытие модального окна информации о файле. */
  onShowMediaInfo: () => void;
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
  children?: MenuItem[];
  submenuClassName?: string;
  track?: TrackInfo;
  onDownload?: () => void;
  isDownloading?: boolean;
  downloadTitle?: string;
}

export function ContextMenu({
  x,
  y,
  onClose,
  onOpenFile,
  onShowMediaInfo,
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

  // Позиционирование меню с учётом границ экрана
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  useEffect(() => {
    if (menuRef.current) {
      const zoomStr = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim();
      const zoom = zoomStr ? parseFloat(zoomStr) : 1;

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

  // Закрытие по клику вне меню или по Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // ─── Обработчики команд ───────────────────────────
  const handleSelectAudio = async (id: number) => {
    await selectAudioTrack(id);
    onClose();
  };

  const handleSelectSub = async (id: number) => {
    await selectSubTrack(id);
    onClose();
  };

  const handleDisableSubs = async () => {
    await disableSubtitles();
    onClose();
  };

  const handleLoadSubFile = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [{ name: "Subtitles", extensions: ["srt", "ass", "vtt", "sub"] }],
      });
      if (file) {
        await invoke("load_subtitle_file", { path: file });
      }
    } catch (e) { console.error(e); }
    onClose();
  };

  const handleSetSpeed = async (speed: number) => {
    try {
      await invoke("set_speed", { speed });
      setCurrentSpeed(speed);
    } catch (e) { console.error(e); }
    onClose();
  };

  const handleSetAspect = async (ratio: string) => {
    try {
      await invoke("set_aspect_ratio", { ratio });
    } catch (e) { console.error(e); }
    onClose();
  };

  const handleSetRotation = async (degrees: number) => {
    try {
      await invoke("set_rotation", { degrees });
    } catch (e) { console.error(e); }
    onClose();
  };

  const audioTracks = tracks.filter((t) => t.type === "audio");
  const subTracks = tracks.filter((t) => t.type === "sub");


  // ─── Определение пунктов меню ─────────────────────
  const menuItems: MenuItem[] = [
    {
      type: "item",
      icon: <FolderOpen size={15} />,
      label: "Открыть файл...",
      shortcut: "Ctrl+O",
      action: () => {
        if (onOpenFile) onOpenFile();
        onClose();
      },
    },
    { type: "divider" },
    {
      type: "submenu",
      icon: <AudioLines size={15} />,
      label: "Аудиодорожка",
      submenuClassName: "context-menu__submenu--tracks",
      children: audioTracks.length > 0 ? (
        audioTracks.map((t) => ({
          type: "track" as const,
          track: t,
          label: `${t.title || `Дорожка ${t.id}`} ${t.lang ? `(${t.lang})` : ""}`,
          active: t.selected,
          action: () => handleSelectAudio(t.id),
          onDownload: () => handleDownloadTrack(t),
          isDownloading: downloadingTrackKey === `audio-${t.id}`,
          downloadTitle: "Скачать аудиодорожку",
        }))
      ) : (
        [{ type: "item", label: "Нет доступных аудиодорожек" }]
      ),
    },
    {
      type: "submenu",
      icon: <Subtitles size={15} />,
      label: "Субтитры",
      submenuClassName: "context-menu__submenu--tracks",
      children: [
        {
          type: "track" as const,
          label: "Выключить субтитры",
          active: !subTracks.some((t) => t.selected),
          action: handleDisableSubs,
        },
        ...subTracks.map((t) => ({
          type: "track" as const,
          track: t,
          label: `${t.title || `Субтитры ${t.id}`} ${t.lang ? `(${t.lang})` : ""}`,
          active: t.selected,
          action: () => handleSelectSub(t.id),
          onDownload: () => handleDownloadTrack(t),
          isDownloading: downloadingTrackKey === `sub-${t.id}`,
          downloadTitle: "Скачать субтитры",
        })),
        { type: "divider" },
        {
          type: "item",
          icon: <FolderOpen size={14} />,
          label: "Загрузить субтитры...",
          action: handleLoadSubFile,
        },
      ],
    },
    { type: "divider" },
    {
      type: "item",
      icon: <BookOpen size={15} />,
      label: "Главы",
      action: () => {
        onShowChapters();
        onClose();
      },
    },
    { type: "divider" },
    {
      type: "submenu",
      icon: <Monitor size={15} />,
      label: "Соотношение сторон",
      children: [
        { type: "item", label: "Оригинальное", action: () => handleSetAspect("no") },
        { type: "item", label: "16:9", action: () => handleSetAspect("16:9") },
        { type: "item", label: "21:9 (CinemaScope)", action: () => handleSetAspect("21:9") },
        { type: "item", label: "4:3", action: () => handleSetAspect("4:3") },
      ],
    },
    {
      type: "submenu",
      icon: <RotateCw size={15} />,
      label: "Поворот видео",
      children: [
        { type: "item", label: "0° (исходное)", action: () => handleSetRotation(0) },
        { type: "item", label: "90° по часовой", action: () => handleSetRotation(90) },
        { type: "item", label: "180°", action: () => handleSetRotation(180) },
        { type: "item", label: "270° по часовой", action: () => handleSetRotation(270) },
      ],
    },
    {
      type: "submenu",
      icon: <Zap size={15} />,
      label: "Скорость воспроизведения",
      children: [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => ({
        type: "item",
        label: `${s}x${s === 1.0 ? " (Нормальная)" : ""}`,
        active: currentSpeed === s,
        action: () => handleSetSpeed(s),
      })),
    },
    { type: "divider" },
    {
      type: "submenu",
      icon: <Repeat size={15} />,
      label: "Режим повтора",
      children: [
        { type: "item", label: "Без повтора", action: () => { invoke("set_repeat_mode", { mode: 0 }); onClose(); } },
        { type: "item", label: "Повтор одного файла", action: () => { invoke("set_repeat_mode", { mode: 1 }); onClose(); } },
        { type: "item", label: "Повтор всего плейлиста", action: () => { invoke("set_repeat_mode", { mode: 2 }); onClose(); } },
      ],
    },
    {
      type: "item",
      icon: <Shuffle size={15} />,
      label: "Случайный порядок (Shuffle)",
      action: () => { invoke("toggle_shuffle"); onClose(); },
    },
    { type: "divider" },
    {
      type: "item",
      icon: <Pin size={15} />,
      label: "Поверх всех окон",
      action: async () => {
        try {
          const appWindow = getCurrentWindow();
          const isTop = await appWindow.isAlwaysOnTop();
          await appWindow.setAlwaysOnTop(!isTop);
        } catch (e) { console.error(e); }
        onClose();
      },
    },
    {
      type: "item",
      icon: <Camera size={15} />,
      label: "Сохранить кадр",
      shortcut: "S",
      action: async () => {
        try {
          await invoke("take_screenshot");
          window.dispatchEvent(new CustomEvent("show-osd", { detail: "Кадр сохранён" }));
        } catch (e) {
          console.error("Ошибка при сохранении кадра:", e);
          window.dispatchEvent(new CustomEvent("show-osd", { detail: "Ошибка сохранения кадра" }));
        }
        onClose();
      },
    },
    {
      type: "item",
      icon: <Info size={15} />,
      label: "Информация о файле...",
      shortcut: "I",
      action: () => {
        onShowMediaInfo();
        onClose();
      },
    },
    {
      type: "item",
      icon: <Settings size={15} />,
      label: "Настройки...",
      action: () => {
        onShowSettings();
        onClose();
      },
    },
  ];

  // Проверка близости к правому краю для открытия подменю влево
  const isRightScreenEdge = useMemo(() => {
    if (typeof window === "undefined") return false;
    const zoomStr = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim();
    const zoom = zoomStr ? parseFloat(zoomStr) : 1;
    return adjustedPos.x + 220 + 380 > (window.innerWidth / (zoom || 1));
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
              closeTimerRef.current = window.setTimeout(() => {
                setActiveSubmenu(null);
              }, 300); // 300ms delay to prevent accidental closing
            }}
          >
            <button className="context-menu__item">
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
                } ${isRightScreenEdge ? "context-menu__submenu--left" : ""}`}
              >
                {item.children.map((child, ci) => renderItem(child, ci))}
              </div>
            )}
          </div>
        );
      }

      return (
        <button
          key={`item-${index}`}
          className={`context-menu__item ${
            item.active ? "context-menu__item--active" : ""
          }`}
          onClick={item.action}
        >
          {item.icon && (
            <span className="context-menu__item-icon">
              {item.icon}
            </span>
          )}
          <span className="context-menu__item-label">
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
    [activeSubmenu, isRightScreenEdge]
  );

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: adjustedPos.x,
        top: adjustedPos.y,
      }}
    >
      {menuItems.map((item, index) => renderItem(item, index))}
    </div>
  );
}
