import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerState, PlaylistItem } from "../contexts/PlayerStateContext";
import { useTranslation } from "../i18n/LanguageContext";
import { getActiveUiScale } from "../utils/uiThemeUtils";
import { X, Search, Play, Clapperboard, RotateCw } from "lucide-react";
import { EmptyState } from "./settings/SettingBlocks";

interface PlaylistItemRowProps {
  item: PlaylistItem;
  isCurrent: boolean;
  onPlay: (index: number) => void;
  itemRef?: (el: HTMLButtonElement | null) => void;
}

/**
 * Мемоизированный компонент строки элемента плейлиста для быстрого рендеринга
 * больших списков без лишних перерисовок соседних элементов.
 */
const PlaylistItemRow = React.memo(function PlaylistItemRow({
  item,
  isCurrent,
  onPlay,
  itemRef,
}: PlaylistItemRowProps) {
  return (
    <button
      ref={itemRef}
      className={`playlist-item ${isCurrent ? "playlist-item--current" : ""}`}
      onClick={() => onPlay(item.index)}
      title={item.filename}
    >
      <div className="playlist-item__num">{item.index + 1}</div>
      <div className="playlist-item__icon">
        {isCurrent ? (
          <Play size={14} fill="currentColor" />
        ) : (
          <Clapperboard size={14} />
        )}
      </div>
      <div className="playlist-item__title">{item.title}</div>
    </button>
  );
});

const DEFAULT_PLAYLIST_WIDTH = 360;
const PLAYLIST_WIDTH_STORAGE_KEY = "l-mpv-playlist-width";

/**
 * Безопасное получение сохранённой ширины окна плейлиста из localStorage.
 * При отсутствии или некорректном значении возвращает дефолтные 360px.
 */
const getInitialPlaylistWidth = (): number => {
  try {
    const saved = localStorage.getItem(PLAYLIST_WIDTH_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= DEFAULT_PLAYLIST_WIDTH) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Ошибка чтения ширины плейлиста из localStorage:", e);
  }
  return DEFAULT_PLAYLIST_WIDTH;
};

export function PlaylistDrawer() {
  const { isPlaylistOpen, setIsPlaylistOpen, playlist, setPlaylist, refreshPlaylist } = usePlayerState();
  const { dict } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState<number>(getInitialPlaylistWidth);
  const [isResizing, setIsResizing] = useState(false);

  const drawerWidthRef = useRef(drawerWidth);
  drawerWidthRef.current = drawerWidth;

  const isResizingRef = useRef(false);
  const isClosingRef = useRef(false);
  const activeResizeCleanupRef = useRef<(() => void) | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const currentItemElRef = useRef<HTMLButtonElement | null>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);

  // Очистка всех активных таймеров, глобальных стилей и слушателей при размонтировании
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      activeResizeCleanupRef.current?.();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  // Синхронизация и гарантированный сброс состояния закрытия при изменении видимости
  useEffect(() => {
    isClosingRef.current = false;
    setIsClosing(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [isPlaylistOpen]);

  /**
   * Плавное перетаскивание левой границы плейлиста с rAF-синхронизацией кадров,
   * дельта-расчётом и компенсацией CSS-масштабирования --ui-scale.
   */
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // Завершаем предыдущее перетаскивание, если оно не было закрыто
    activeResizeCleanupRef.current?.();

    const startX = e.clientX;
    const startWidth = drawerWidthRef.current;
    const zoom = getActiveUiScale();

    isResizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    let latestWidth = startWidth;
    let rafId: number | null = null;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      // Дельта от стартовой позиции мыши: влево увеличивает, вправо уменьшает
      const deltaX = (startX - moveEvent.clientX) / zoom;
      const effectiveMaxWidth = Math.max(
        DEFAULT_PLAYLIST_WIDTH,
        (window.innerWidth / zoom) - 28
      );
      const clampedWidth = Math.min(
        effectiveMaxWidth,
        Math.max(DEFAULT_PLAYLIST_WIDTH, Math.round(startWidth + deltaX))
      );
      latestWidth = clampedWidth;

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          setDrawerWidth(latestWidth);
        });
      }
    };

    const cleanupResize = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setIsResizing(false);

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", cleanupResize);
      activeResizeCleanupRef.current = null;

      // Фиксируем финальную ширину и персистируем в хранилище
      setDrawerWidth(latestWidth);
      try {
        localStorage.setItem(PLAYLIST_WIDTH_STORAGE_KEY, latestWidth.toString());
        window.dispatchEvent(new Event("l-mpv-settings-changed"));
      } catch (err) {
        console.error("Ошибка сохранения ширины плейлиста:", err);
      }
    };

    activeResizeCleanupRef.current = cleanupResize;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", cleanupResize);
  }, []);

  /**
   * Сброс ширины плейлиста к заводским 360px при двойном клике по ручке изменения размера.
   */
  const handleResetWidth = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrawerWidth(DEFAULT_PLAYLIST_WIDTH);
    try {
      localStorage.setItem(PLAYLIST_WIDTH_STORAGE_KEY, DEFAULT_PLAYLIST_WIDTH.toString());
    } catch (err) {
      console.error("Ошибка сброса ширины плейлиста:", err);
    }
  }, []);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    const isNoAnim =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("no-animations");
    if (isNoAnim) {
      setIsPlaylistOpen(false);
      return;
    }
    isClosingRef.current = true;
    setIsClosing(true);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setIsPlaylistOpen(false);
      setIsClosing(false);
      isClosingRef.current = false;
      closeTimerRef.current = null;
    }, 120);
  }, [setIsPlaylistOpen]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await invoke("reload_folder_playlist");
      await refreshPlaylist();
    } catch (e) {
      console.error("Ошибка обновления плейлиста:", e);
    } finally {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  }, [isRefreshing, refreshPlaylist]);

  const currentItemIndex = useMemo(() => {
    return playlist.find((i) => i.current)?.index ?? -1;
  }, [playlist]);

  // Мгновенный автоскролл к текущему воспроизводимому элементу при открытии панели или смене трека
  useEffect(() => {
    if (isPlaylistOpen && currentItemIndex >= 0 && currentItemElRef.current) {
      currentItemElRef.current.scrollIntoView({
        block: "nearest",
        behavior: "auto",
      });
    }
  }, [isPlaylistOpen, currentItemIndex]);

  // Закрытие по Escape и клику вне панели
  useEffect(() => {
    if (!isPlaylistOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (searchQuery) {
          setSearchQuery("");
        } else {
          handleClose();
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (isResizingRef.current) {
        return;
      }
      const target = e.target as Element | null;
      if (
        target &&
        typeof target.closest === "function" &&
        target.closest("#btn-playlist-drawer")
      ) {
        return;
      }
      if (drawerRef.current && target && !drawerRef.current.contains(target)) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPlaylistOpen, handleClose, searchQuery]);

  const handlePlayItem = useCallback(
    async (index: number) => {
      const target = playlist.find((p) => p.index === index);
      if (target?.current) {
        // Уже воспроизводится данный элемент
        return;
      }
      // Оптимистичное обновление активного элемента для мгновенного отклика UI
      setPlaylist((prev) =>
        prev.map((item) => ({
          ...item,
          current: item.index === index,
        }))
      );
      try {
        await invoke("play_playlist_item", { index });
      } catch (e) {
        console.error("Ошибка воспроизведения файла из плейлиста", e);
        refreshPlaylist();
      }
    },
    [playlist, setPlaylist, refreshPlaylist]
  );

  // Мемоизированная фильтрация для производительности на больших плейлистах
  const filteredPlaylist = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return playlist;
    return playlist.filter(
      (item) =>
        item.title.toLowerCase().includes(trimmed) ||
        item.filename.toLowerCase().includes(trimmed)
    );
  }, [playlist, searchQuery]);

  // Мемоизированный счётчик треков
  const countBadge = useMemo(() => {
    const total = playlist.length;
    if (total === 0) return "";
    const curIdx = playlist.findIndex((item) => item.current);
    return curIdx >= 0 ? `${curIdx + 1} / ${total}` : `${total}`;
  }, [playlist]);

  if (!isPlaylistOpen) return null;

  return (
    <div
      ref={drawerRef}
      className={`playlist-drawer ${isClosing ? "playlist-drawer--closing" : ""} ${
        isResizing ? "playlist-drawer--resizing" : ""
      }`}
      style={{
        width: `${drawerWidth}px`,
        maxWidth: "calc(100% - 28px)",
        minWidth: `min(${DEFAULT_PLAYLIST_WIDTH}px, calc(100% - 28px))`,
      }}
    >
      <div
        className="playlist-drawer__resize-handle"
        onMouseDown={handleResizeStart}
        onDoubleClick={handleResetWidth}
        title={dict.playlist.resizeHandle}
      />
      <div className="playlist-drawer__header">
        <div className="playlist-drawer__header-left">
          <h2 className="playlist-drawer__title">{dict.playlist.title}</h2>
          {countBadge && (
            <span
              className="playlist-drawer__badge"
              title={dict.playlist.trackBadge(
                playlist.findIndex((i) => i.current) + 1,
                playlist.length
              )}
            >
              {countBadge}
            </span>
          )}
        </div>
        <div className="playlist-drawer__header-actions">
          <button
            className={`playlist-drawer__action-btn ${isRefreshing ? "playlist-drawer__action-btn--spinning" : ""}`}
            onClick={handleRefresh}
            title={dict.playlist.refresh}
          >
            <RotateCw size={15} />
          </button>
          <button
            className="playlist-drawer__close"
            onClick={handleClose}
            title={dict.playlist.close}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="playlist-drawer__search">
        <Search size={15} className="playlist-drawer__search-icon" />
        <input
          type="text"
          placeholder={dict.playlist.search}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && contentContainerRef.current) {
              e.preventDefault();
              const firstBtn = contentContainerRef.current.querySelector<HTMLButtonElement>("button.playlist-item");
              firstBtn?.focus();
            }
          }}
          className="playlist-drawer__search-input"
        />
        {searchQuery && (
          <button
            className="playlist-drawer__search-clear"
            onClick={() => setSearchQuery("")}
            title={dict.playlist.clearSearch}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div ref={contentContainerRef} className="playlist-drawer__content">
        {filteredPlaylist.length === 0 ? (
          <EmptyState
            icon={<Clapperboard size={24} />}
          title={searchQuery ? dict.playlist.nothingFound : dict.playlist.empty}
            desc={
              searchQuery
                ? dict.playlist.nothingFoundDesc
                : dict.playlist.emptyDesc
            }
          />
        ) : (
          filteredPlaylist.map((item) => (
            <PlaylistItemRow
              key={item.index}
              item={item}
              isCurrent={item.current}
              onPlay={handlePlayItem}
              itemRef={item.current ? (el) => { currentItemElRef.current = el; } : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
