import { SelectionRail } from "../motion/SelectionRail";
import React, {
  useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerState, usePlayerProgress, PlaylistItem } from "../../contexts/PlayerStateContext";
import { useTranslation } from "../../i18n/LanguageContext";
import { showOsd } from "../../hooks/useOsd";
import { AnimatePresence } from "motion/react";
import { MotionSurface } from "../motion/MotionSurface";
import { getActiveUiScale } from "../../utils/uiThemeUtils";
import { X, Search, Play, Clapperboard, RotateCw, CheckCircle2, Pin, GripVertical } from "lucide-react";
import { EmptyState } from "../settings/components/SettingBlocks";
import { ExplorerPanel } from "./ExplorerPanel";
import { SavedPlaylistPanel } from "./SavedPlaylistPanel";
import { savedPlaylistSource } from "../../utils/savedPlaylists";
import { usePinnedNavigationPanel } from "../../hooks/usePinnedNavigationPanel";
import "../../styles/navigation-panel-position.css";
import { DEFAULT_NAVIGATION_WIDTH, MIN_NAVIGATION_WIDTH, savedNavigationWidth, savedNavigationTab, saveNavigationTab, type NavigationPanelTab } from "../../utils/explorerPanel";
import {
  type ControlBarStyle,
  getSavedControlBarStyle,
} from "../../utils/controlBarStyleUtils";

/** Данные прогресса просмотра для одного файла плейлиста. */
interface WatchProgressInfo {
  position: number;
  duration: number;
  progress_percent: number;
}

interface PlaylistItemRowProps {
  item: PlaylistItem;
  isCurrent: boolean;
  onPlay: (index: number) => void;
  itemRef?: (el: HTMLButtonElement | null) => void;
  /** Процент просмотра от 0 до 100. 0 = неизвестно или не смотрелся. */
  watchProgress?: number;
}

/**
 * Мемоизированный компонент строки элемента плейлиста с индикатором просмотра.
 * Тонкая полоска Watch Progress Bar в стиле Netflix/YouTube отображается
 * в низу карточки, если файл был просмотрен от 2% до 90%.
 * При досмотре ≥ 90% показывается значок «Просмотрено».
 */
const PlaylistItemRow = React.memo(function PlaylistItemRow({
  item,
  isCurrent,
  onPlay,
  itemRef,
  watchProgress = 0,
}: PlaylistItemRowProps) {
  const isWatched = watchProgress >= 90;
  // Показываем полоску, если просмотр начат (от 0.5% прогресса)
  const showProgress = watchProgress >= 0.5;

  return (
    <button
      type="button"
      ref={itemRef}
      className={`playlist-item ${
        isCurrent ? "playlist-item--current" : ""
      } ${isWatched ? "playlist-item--watched" : ""}`}
      aria-current={isCurrent ? "true" : undefined}
      onClick={() => onPlay(item.index)}
      title={item.filename}
      >
      <div className="playlist-item__num">{item.index + 1}</div>
      <div className="playlist-item__icon">
        {isCurrent ? (
          <Play size={14} fill="currentColor" />
        ) : isWatched ? (
          <CheckCircle2 size={14} className="playlist-item__watched-icon" />
        ) : (
          <Clapperboard size={14} />
        )}
      </div>
      <div className="playlist-item__title">{item.title}</div>
      {/* Watch Progress Bar: полоска прогресса в стиле Netflix */}
      {showProgress && (
        <div className="playlist-item__progress-track">
          <div
            className={`playlist-item__progress-fill ${
              isWatched ? "playlist-item__progress-fill--watched" : ""
            }`}
            style={{ width: `${isWatched ? 100 : Math.min(100, Math.max(0, watchProgress))}%` }}
          />
        </div>
      )}
    </button>
  );
});

/** Hidden drawers do not subscribe to frequent playback progress. */
function PlaylistProgressObserver({ onChange }: { onChange: (value: { duration: number; percent: number }) => void }) {
  const { position, duration } = usePlayerProgress();
  useEffect(() => {
    onChange({ duration, percent: duration > 0 ? Math.min(100, Math.max(0, position / duration * 100)) : 0 });
  }, [position, duration, onChange]);
  return null;
}

const DEFAULT_PLAYLIST_WIDTH = DEFAULT_NAVIGATION_WIDTH;
const PLAYLIST_WIDTH_STORAGE_KEY = "l-mpv-playlist-width";

/**
 * Безопасное получение сохранённой ширины окна плейлиста из localStorage.
 * При отсутствии или некорректном значении возвращает дефолтные 480px.
 */
const getInitialPlaylistWidth = savedNavigationWidth;

export function PlaylistDrawer() {
  const { isPlaylistOpen, setIsPlaylistOpen, playlist, setPlaylist, refreshPlaylist, mediaInfo } = usePlayerState();
  const { dict } = useTranslation();
  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() => getSavedControlBarStyle());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<NavigationPanelTab>(savedNavigationTab);
  const [explorerSearch, setExplorerSearch] = useState("");
  const [explorerPath, setExplorerPath] = useState<string>();
  const [savedSource, setSavedSource] = useState(() => Boolean(savedPlaylistSource()));
  const folderPaths = useMemo(() => playlist.map(item => item.filename), [playlist]);
  const changeTab = (tab: NavigationPanelTab) => { setActiveTab(tab); saveNavigationTab(tab); };

  useEffect(() => {
    const handleStyleChanged = () => {
      setControlBarStyle(getSavedControlBarStyle());
    };
    window.addEventListener("l-mpv-settings-changed", handleStyleChanged);
    window.addEventListener("l-mpv-control-bar-style-changed", handleStyleChanged);
    return () => {
      window.removeEventListener("l-mpv-settings-changed", handleStyleChanged);
      window.removeEventListener("l-mpv-control-bar-style-changed", handleStyleChanged);
    };
  }, []);

  const isCapsule = controlBarStyle === "capsule";
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState<number>(getInitialPlaylistWidth);
  const [isResizing, setIsResizing] = useState(false);

  const drawerWidthRef = useRef(drawerWidth);
  drawerWidthRef.current = drawerWidth;

  const isResizingRef = useRef(false);
  const activeResizeCleanupRef = useRef<(() => void) | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const currentItemElRef = useRef<HTMLButtonElement | null>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);

  // Очистка всех активных таймеров, глобальных стилей и слушателей при размонтировании
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      activeResizeCleanupRef.current?.();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const [liveProgress, setLiveProgress] = useState({ duration: 0, percent: 0 });

  // Пакетная загрузка данных прогресса просмотра через IPC при открытии и обновлении плейлиста.
  const [watchProgressMap, setWatchProgressMap] = useState<
    Record<string, WatchProgressInfo>
  >({});

  const fetchWatchProgress = useCallback(async (items: PlaylistItem[]) => {
    if (items.length === 0) return;
    try {
      const paths = items.map((item) => item.filename);
      const result = await invoke<Record<string, WatchProgressInfo>>(
        "get_watch_history_batch",
        { paths }
      );
      setWatchProgressMap(result);
    } catch (err) {
      console.error("Ошибка загрузки данных просмотра:", err);
    }
  }, []);

  useEffect(() => {
    if (isPlaylistOpen && playlist.length > 0) {
      fetchWatchProgress(playlist);
    }
  }, [isPlaylistOpen, playlist, fetchWatchProgress]);


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
        MIN_NAVIGATION_WIDTH,
        (window.innerWidth / zoom) - 28
      );
      const clampedWidth = Math.min(
        effectiveMaxWidth,
        Math.max(MIN_NAVIGATION_WIDTH, Math.round(startWidth + deltaX))
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
   * Сброс ширины панели к заводским 480px при двойном клике по ручке изменения размера.
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
    setIsPlaylistOpen(false);
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

  // Виртуализация списка: рендерим только видимое окно + overscan.
  // Строка фиксирована CSS min-height 38px + padding, берём 44px с запасом.
  const ROW_H = 44;
  const OVERSCAN = 12;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(600);

  const handleListScroll = useCallback(() => {
    const el = contentContainerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setViewHeight(el.clientHeight || 600);
  }, []);

  useEffect(() => {
    const el = contentContainerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setViewHeight(el.clientHeight || 600);
    // Сброс скролла при новом поиске
    el.scrollTop = 0;
    setScrollTop(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Restore the virtual window's DOM scroll before paint when switching back.
  useLayoutEffect(() => {
    if (!isPlaylistOpen || activeTab !== "playlist") return;
    const el = contentContainerRef.current;
    if (el) {
      el.scrollTop = scrollTop;
      setScrollTop(el.scrollTop);
      setViewHeight(el.clientHeight || 600);
    }
    // Scroll events already synchronize scrollTop; this effect restores remounted DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaylistOpen, drawerWidth, activeTab, savedSource]);

  // Мгновенный автоскролл к текущему воспроизводимому элементу при открытии панели или смене трека
  // currentFilteredPos Atkinson — позиция именно в отфильтрованном списке
  // (item.index — индекс mpv, а не позиция в filteredPlaylist).
  useEffect(() => {
    if (!isPlaylistOpen) return;
    const el = contentContainerRef.current;
    if (el) {
      // Позицию считаем здесь, когда filteredPlaylist уже определён ниже
      // через data-атрибут: ищем кнопку текущего трека среди отрендеренных
      const cur = el.querySelector<HTMLElement>(".playlist-item--current");
      if (cur) {
        const top = cur.offsetTop;
        if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - ROW_H) {
          el.scrollTop = Math.max(0, top - el.clientHeight / 2);
          setScrollTop(el.scrollTop);
        }
      }
      return;
    }
    if (currentItemElRef.current) {
      currentItemElRef.current.scrollIntoView({
        block: "nearest",
        behavior: "auto",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaylistOpen, currentItemIndex, playlist, searchQuery, activeTab, savedSource]);

  // Закрытие по Escape и клику вне панели
  useEffect(() => {
    if (!isPlaylistOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (drawerRef.current?.querySelector("[data-saved-playlist-editor]") || document.querySelector("[data-navigation-popover]")) return;
        e.preventDefault();
        e.stopPropagation();
        const currentSearch = activeTab === "playlist" ? searchQuery : explorerSearch;
        if (currentSearch) {
          if (activeTab === "playlist") setSearchQuery("");
          else setExplorerSearch("");
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
      if (target?.closest("[data-navigation-popover]")) return;
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
  }, [isPlaylistOpen, handleClose, searchQuery, activeTab, explorerSearch]);

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
        // Актуализируем историю просмотра для покинутого трека
        fetchWatchProgress(playlist);
      } catch (e) {
        console.error("Ошибка воспроизведения файла из плейлиста", e);
        refreshPlaylist();
        showOsd(dict.osd.playlistPlayErr, { isError: true });
      }
    },
    [playlist, setPlaylist, refreshPlaylist, fetchWatchProgress, dict]
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
    return curIdx>= 0 ? `${curIdx + 1} / ${total}` : `${total}`;
  }, [playlist]);

  const pinnedPanel = usePinnedNavigationPanel(drawerRef, isPlaylistOpen);

  return (
    <AnimatePresence>
      {isPlaylistOpen && (
        <MotionSurface kind="panel" key="navigation"
          ref={drawerRef}
          className={`playlist-drawer ${isCapsule ? "playlist-drawer--capsule" : ""} ${pinnedPanel.pinned ? "playlist-drawer--pinned" : ""}  ${
            isResizing ? "playlist-drawer--resizing" : ""
          }`}
          style={{
            width: `${drawerWidth}px`,
            maxWidth: "calc(100% - 28px)",
            minWidth: `min(${MIN_NAVIGATION_WIDTH}px, calc(100% - 28px))`,
            ...(pinnedPanel.geometry ? {
              top: `${pinnedPanel.geometry.top}px`,
              bottom: "auto", maxHeight: `${pinnedPanel.geometry.height}px`,
            } : {}),
          }}
          >
          <div
            className="playlist-drawer__resize-handle"
            onMouseDown={handleResizeStart}
            onDoubleClick={handleResetWidth}
          />
          <div className="playlist-drawer__header">
          <SelectionRail activeKey={activeTab} className="playlist-drawer__header-left navigation-panel__tabs" role="tablist" aria-label={dict.playlist.tabsLabel}>
            {(["playlist", "explorer"] as const).map(tab => <button key={tab} type="button" role="tab"
              id={`navigation-tab-${tab}`} aria-selected={activeTab === tab} aria-controls={`navigation-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1} className="navigation-panel__tab"
              onClick={() => changeTab(tab)} onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault(); event.stopPropagation();
                const next = event.key === "Home" ? "playlist" : event.key === "End" ? "explorer" : tab === "playlist" ? "explorer" : "playlist";
                changeTab(next);
                event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#navigation-tab-${next}`)?.focus();
              }}><span>{tab === "playlist" ? dict.playlist.title : dict.explorer.title}</span>
                {tab === "playlist" && !savedSource && countBadge && <span className="playlist-drawer__badge" aria-hidden="true">{countBadge}</span>}
              </button>)}
          </SelectionRail>
            <div className="playlist-drawer__header-actions">
              <button
                type="button"
                hidden={activeTab !== "playlist" || savedSource}
                disabled={activeTab !== "playlist" || savedSource}
                className={`playlist-drawer__action-btn playlist-drawer__refresh ${isRefreshing ? "playlist-drawer__action-btn--spinning" : ""}`}
                onClick={handleRefresh}
                aria-label={dict.playlist.refresh}
                >
                <RotateCw size={15} />
              </button>
              {pinnedPanel.pinned && <button id="navigation-panel-drag" type="button" className="playlist-drawer__action-btn navigation-panel__grip"
                aria-label={dict.playlist.movePanel} title={dict.playlist.movePanel}
                onPointerDown={pinnedPanel.onGripPointerDown} onKeyDown={pinnedPanel.onGripKeyDown}>
                <GripVertical size={15} />
              </button>}
              <button id="navigation-panel-pin" type="button" className="playlist-drawer__action-btn navigation-panel__pin"
                aria-pressed={pinnedPanel.pinned} aria-label={pinnedPanel.pinned ? dict.playlist.unpin : dict.playlist.pin}
                title={pinnedPanel.pinned ? dict.playlist.unpin : dict.playlist.pin} onClick={pinnedPanel.togglePinned}>
                <Pin size={15} />
              </button>
              <button
                type="button"
                className="playlist-drawer__close"
                onClick={handleClose}

                aria-label={dict.playlist.close}
                >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="navigation-panel__explorer-host" hidden={activeTab !== "explorer"}
            style={activeTab !== "explorer" ? { display: "none" } : undefined} aria-hidden={activeTab !== "explorer"}>
            <ExplorerPanel active={isPlaylistOpen && activeTab === "explorer"} panelActive={isPlaylistOpen}
              onRequestActivate={() => changeTab("explorer")} search={explorerSearch} onSearch={setExplorerSearch}
              initialPath={explorerPath} onLocation={setExplorerPath} />
          </div>
          {activeTab === "playlist" && <SavedPlaylistPanel active={isPlaylistOpen} folderPaths={folderPaths}
            mediaPath={mediaInfo?.path ?? ""} refreshPlaylist={refreshPlaylist} onSourceChange={setSavedSource}
            onFolderRequested={async () => { await invoke("reload_folder_playlist"); await refreshPlaylist(); }}>
          <div className="playlist-drawer__search">
            <Search size={15} className="playlist-drawer__search-icon" />
            <input
              type="text"
              placeholder={dict.playlist.search}
              aria-label={dict.playlist.search}
              autoComplete="off"
              spellCheck={false}
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
                type="button"
                className="playlist-drawer__search-clear"
                onClick={() => setSearchQuery("")}

                aria-label={dict.playlist.clearSearch}
                >
                <X size={14} />
              </button>
            )}
          </div>

          {isPlaylistOpen && <PlaylistProgressObserver onChange={setLiveProgress} />}
          <div ref={contentContainerRef} className="playlist-drawer__content" onScroll={handleListScroll}>
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
            ) : (() => {
              // Маленькие списки рендерим целиком без оверхеда
              if (filteredPlaylist.length <= 80) {
                return filteredPlaylist.map((item) => {
                  const itemProgress = item.current && liveProgress.duration > 0
                    ? liveProgress.percent : watchProgressMap[item.filename]?.progress_percent ?? 0;
                  return (
                    <PlaylistItemRow
                      key={item.index}
                      item={item}
                      isCurrent={item.current}
                      onPlay={handlePlayItem}
                      itemRef={item.current ? (el) => { currentItemElRef.current = el; } : undefined}
                      watchProgress={itemProgress}
                    />
                  );
                });
              }
              const total = filteredPlaylist.length;
              const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
              const end = Math.min(total, Math.ceil((scrollTop + viewHeight) / ROW_H) + OVERSCAN);
              const slice = filteredPlaylist.slice(start, end);
              return (
                <>
                  {start > 0 && <div style={{ height: start * ROW_H, flexShrink: 0 }} aria-hidden="true" />}
                  {slice.map((item) => {
                    const itemProgress = item.current && liveProgress.duration > 0
                      ? liveProgress.percent : watchProgressMap[item.filename]?.progress_percent ?? 0;
                    return (
                      <PlaylistItemRow
                        key={item.index}
                        item={item}
                        isCurrent={item.current}
                        onPlay={handlePlayItem}
                        itemRef={item.current ? (el) => { currentItemElRef.current = el; } : undefined}
                        watchProgress={itemProgress}
                      />
                    );
                  })}
                  {end < total && <div style={{ height: (total - end) * ROW_H, flexShrink: 0 }} aria-hidden="true" />}
                </>
              );
            })()}
          </div>
          </SavedPlaylistPanel>}
        </MotionSurface>
      )}
    </AnimatePresence>
  );
}
