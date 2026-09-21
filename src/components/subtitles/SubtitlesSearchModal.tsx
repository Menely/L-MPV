import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Radio } from "lucide-react";
import {
  usePlayerState,
  usePlayerProgress,
} from "../../contexts/PlayerStateContext";
import { SubtitleLineRow } from "./SubtitleLineRow";
import { TrackPicker } from "./TrackPicker";
import { SubtitlesModalHeader } from "./SubtitlesModalHeader";
import { SubtitleSearchBar } from "./SubtitleSearchBar";
import { SubtitleEmptyState } from "./SubtitleEmptyState";
import { useSubtitlesAnalysis } from "./useSubtitlesAnalysis";
import { useModalGeometry } from "./useModalGeometry";
import { useActiveLineIndex } from "./useActiveLineIndex";
import { useFollowPlayback } from "./useFollowPlayback";
import { useSearchNavigation } from "./useSearchNavigation";
import { usePersistentState } from "./usePersistentState";
import {
  MIN_MODAL_WIDTH,
  TECH_MODAL_MIN_WIDTH,
  VIRTUAL_WINDOW_SIZE,
  ESTIMATED_ROW_HEIGHT_NORMAL,
  ESTIMATED_ROW_HEIGHT_TECH,
  SUBTITLE_VIEW_MODE_KEY,
  getInitialViewMode,
  SUBTITLE_RAW_FORMAT_KEY,
  getInitialRawFormat,
  SUBTITLE_OPAQUE_KEY,
  getInitialSubtitlesOpaque,
  type SubtitleRawFormat,
  type SubtitleViewMode,
  type SubtitlesSearchModalProps,
} from "./subtitleTypes";

/**
 * Интерактивный браузер и поиск по субтитрам (Searchable Subtitles Browser).
 * Поддерживает авто-анализ дорожек, изменение ширины, сдвиг вбок и подъем
 * на полную высоту плеера.
 *
 * Оркестратор: данные дорожек — `useSubtitlesAnalysis`, геометрия окна —
 * `useModalGeometry`, алгоритм активной строки — `useActiveLineIndex`,
 * следование — `useFollowPlayback`, навигация — `useSearchNavigation`,
 * строка поиска — `SubtitleSearchBar`, шапка — `SubtitlesModalHeader`,
 * заглушки — `SubtitleEmptyState`, строка списка — `SubtitleLineRow`.
 */
export function SubtitlesSearchModal({ onClose }: SubtitlesSearchModalProps) {
  const { seekTo } = usePlayerState();
  const { position } = usePlayerProgress();

  const {
    lines,
    isAnalyzing,
    analyzeError,
    subTracks,
    activeTrack,
    currentDisplayedTrack,
    selectedTrackId,
    analyzedTrackTitle,
    mediaPath,
    subDelay,
    handleSelectTrack,
    handleDisableTracks,
    handleReanalyze,
    handleStepSubDelay,
    handleLoadExternalSubtitles,
  } = useSubtitlesAnalysis();

  // ── Режим просмотра (обычный / технический) ────────────────────────────────
  const [viewMode, setViewMode] = usePersistentState<SubtitleViewMode>(
    SUBTITLE_VIEW_MODE_KEY,
    getInitialViewMode
  );

  const {
    modalWidth,
    offsetX,
    isResizing,
    isDragging,
    isAutoAdapting,
    adaptWidthForMode,
    handleResizeStart,
    handleResetWidth,
    handleDragHeaderStart,
    handleResetPosition,
  } = useModalGeometry(viewMode);

  const handleToggleViewMode = useCallback(
    (mode: SubtitleViewMode) => {
      setViewMode(mode);
      adaptWidthForMode(mode);
    },
    [setViewMode, adaptWidthForMode]
  );

  // ── Формат исходной разметки (HTML / Aegisub) ──────────────────────────────
  const [rawFormat, setRawFormat] = usePersistentState<SubtitleRawFormat>(
    SUBTITLE_RAW_FORMAT_KEY,
    getInitialRawFormat
  );

  // ── Непрозрачность окна ────────────────────────────────────────────────────
  const [isOpaque, setIsOpaque] = usePersistentState<boolean>(
    SUBTITLE_OPAQUE_KEY,
    getInitialSubtitlesOpaque,
    String
  );
  const handleToggleOpaque = useCallback(
    () => setIsOpaque(!isOpaque),
    [isOpaque, setIsOpaque]
  );

  // ── Базовые UI-состояния ───────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [followPlayback, setFollowPlayback] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [clickedLineIndex, setClickedLineIndex] = useState<number | null>(
    null
  );
  const [isTrackPickerOpen, setIsTrackPickerOpen] = useState(false);

  // Смещение скролла для виртуализации
  const [scrollOffset, setScrollOffset] = useState(0);
  const scrollOffsetRef = useRef(0);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const activeLineElRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const trackPickerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClosingRef = useRef(false);
  const expectedScrollTopRef = useRef<number>(NaN);

  // ── Высота строки ──────────────────────────────────────────────────────────
  const estimatedRowHeight =
    viewMode === "technical"
      ? ESTIMATED_ROW_HEIGHT_TECH
      : ESTIMATED_ROW_HEIGHT_NORMAL;

  // ── Сброс при смене медиафайла ─────────────────────────────────────────────
  const prevPathRef = useRef(mediaPath);
  useEffect(() => {
    if (prevPathRef.current !== mediaPath) {
      prevPathRef.current = mediaPath;
      setSearchQuery("");
      setFollowPlayback(true);
    }
  }, [mediaPath]);

  // ── Закрытие по клику вне TrackPicker ─────────────────────────────────────
  useEffect(() => {
    if (!isTrackPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        trackPickerRef.current &&
        !trackPickerRef.current.contains(e.target as Node)
      ) {
        setIsTrackPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [isTrackPickerOpen]);

  // ── Фокус на строке поиска при открытии ───────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  // ── Гарантированная очистка таймеров при размонтировании ──────────────────
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (clickedTimerRef.current) clearTimeout(clickedTimerRef.current);
      isClosingRef.current = false;
    };
  }, []);

  // ── Фильтрация реплик ──────────────────────────────────────────────────────
  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return lines;
    const q = searchQuery.toLowerCase().trim();
    return lines.filter((l) => l.text.toLowerCase().includes(q));
  }, [lines, searchQuery]);

  // ── Активная реплика ───────────────────────────────────────────────────────
  const activeLineIndex = useActiveLineIndex({
    lines,
    position,
    clickedLineIndex,
  });

  // ── Навигация по совпадениям и стрелками ───────────────────────────────────
  const {
    navAnchor,
    navPos,
    jumpToMatch,
    resetNavAnchor,
    handleStepSubtitleRef,
  } = useSearchNavigation({
    filteredLines,
    lines,
    activeLineIndex,
    position,
    estimatedRowHeight,
    followPlayback,
    searchQuery,
    listContainerRef,
    scrollOffsetRef,
    expectedScrollTopRef,
    setFollowPlayback,
    setClickedLineIndex,
    clickedTimerRef,
    seekTo,
  });

  // ── rAF-следование за речью ────────────────────────────────────────────────
  useFollowPlayback({
    followPlayback,
    searchQuery,
    lines,
    activeLineIndex,
    filteredLines,
    estimatedRowHeight,
    listContainerRef,
    activeLineElRef,
    expectedScrollTopRef,
    scrollOffsetRef,
  });

  // ── Виртуализация списка (Phantom Spacer) ──────────────────────────────────
  // Для списков до 600 строк виртуализация не нужна: нативный рендеринг
  // полностью плавный и исключает скачки paddingTop при следовании.
  const { visibleLines, paddingTop, paddingBottom } = useMemo(() => {
    const total = filteredLines.length;
    if (total <= 600) {
      return { visibleLines: filteredLines, paddingTop: 0, paddingBottom: 0 };
    }

    const overscan = 30;
    let center: number;
    if (followPlayback && activeLineIndex >= 0) {
      const activePos = filteredLines.findIndex(
        (l) => l.index === activeLineIndex
      );
      center =
        activePos >= 0
          ? activePos
          : Math.floor(scrollOffset / estimatedRowHeight);
    } else {
      center = Math.floor(scrollOffset / estimatedRowHeight);
    }

    const start = Math.max(
      0,
      Math.min(center - overscan, total - VIRTUAL_WINDOW_SIZE)
    );
    const end = Math.min(total, start + VIRTUAL_WINDOW_SIZE);

    return {
      visibleLines: filteredLines.slice(start, end),
      paddingTop: start * estimatedRowHeight,
      paddingBottom: Math.max(0, (total - end) * estimatedRowHeight),
    };
  }, [
    filteredLines,
    scrollOffset,
    estimatedRowHeight,
    followPlayback,
    activeLineIndex,
  ]);

  // ── Плавное закрытие окна ──────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);

    const isNoAnim =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("no-animations");
    if (isNoAnim) {
      onClose();
      return;
    }
    closeTimerRef.current = setTimeout(onClose, 155);
  }, [onClose]);

  // ── Глобальные горячие клавиши (Escape, Ctrl+F, стрелки) ──────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (isTrackPickerOpen) {
          setIsTrackPickerOpen(false);
          return;
        }
        handleClose();
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "f" || e.key === "F" || e.code === "KeyF")
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (isTrackPickerOpen) return;
        e.preventDefault();
        e.stopPropagation();
        handleStepSubtitleRef.current(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleClose, isTrackPickerOpen, handleStepSubtitleRef]);

  // ── Обёртки выбора дорожки ─────────────────────────────────────────────────
  const handlePickTrack = useCallback(
    (trackId: number) => {
      handleSelectTrack(trackId);
      setIsTrackPickerOpen(false);
    },
    [handleSelectTrack]
  );

  const handlePickerDisable = useCallback(() => {
    handleDisableTracks();
    setIsTrackPickerOpen(false);
  }, [handleDisableTracks]);

  // ── Ручной скролл (отключает следование) ──────────────────────────────────
  const handleListScroll = useCallback(() => {
    const container = listContainerRef.current;
    if (!container) return;
    const currentTop = container.scrollTop;
    if (Math.abs(currentTop - scrollOffsetRef.current) > 15) {
      scrollOffsetRef.current = currentTop;
      setScrollOffset(currentTop);
    }
    if (Math.abs(container.scrollTop - expectedScrollTopRef.current) <= 2) {
      return;
    }
    if (followPlayback) setFollowPlayback(false);
  }, [followPlayback]);

  // ── Копирование чистого текста реплики ────────────────────────────────────
  const handleCopyText = useCallback(
    (line: Parameters<typeof SubtitleLineRow>[0]["line"], e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard
        .writeText(line.text)
        .then(() => {
          setCopiedIndex(line.index);
          if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
          copyTimerRef.current = setTimeout(
            () => setCopiedIndex(null),
            1500
          );
        })
        .catch((err) =>
          console.error("Не удалось скопировать реплику:", err)
        );
    },
    []
  );

  // ── Переход к реплике по клику ────────────────────────────────────
  const handleSeek = useCallback(
    (line: Parameters<typeof SubtitleLineRow>[0]["line"]) => {
      // Сбрасываем якорь поиска, чтобы снять синюю подсветку «совпадение»
      resetNavAnchor();
      setClickedLineIndex(line.index);
      if (clickedTimerRef.current) clearTimeout(clickedTimerRef.current);
      clickedTimerRef.current = setTimeout(
        () => setClickedLineIndex(null),
        800
      );
      seekTo(line.start);
    },
    [seekTo, resetNavAnchor]
  );

  // ── Рендер ────────────────────────────────────────────────────────────────
  return (
    <div
      className="subtitles-modal-overlay"
      style={{
        position: "fixed",
        bottom: "94px",
        right: `${offsetX}px`,
        height: "calc(100% - 154px)",
        maxHeight: "calc(100% - 154px)",
        width: `${modalWidth}px`,
        maxWidth: "calc(100vw - 28px)",
        minWidth: `min(${
          viewMode === "technical"
            ? TECH_MODAL_MIN_WIDTH
            : MIN_MODAL_WIDTH
        }px, calc(100vw - 28px))`,
        transition: isAutoAdapting
          ? "width 0.22s cubic-bezier(0.16, 1, 0.3, 1), right 0.22s cubic-bezier(0.16, 1, 0.3, 1)"
          : "none",
        pointerEvents: "none",
        zIndex: 500,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        className={`media-info__section subtitles-search-card ${
          isClosing ? "subtitles-search-card--closing" : ""
        } ${
          isResizing || isDragging ? "subtitles-search-card--resizing" : ""
        }`}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          maxHeight: "100%",
          overflow: "hidden",
          background: isOpaque ? "#0b0f15" : "var(--bg-pill)",
          backdropFilter: isOpaque ? "none" : "var(--ui-backdrop)",
          WebkitBackdropFilter: isOpaque ? "none" : "var(--ui-backdrop)",
          border: isOpaque
            ? "1px solid rgba(255, 255, 255, 0.15)"
            : "1px solid var(--border-pill)",
          borderRadius: "var(--radius-lg)",
          padding: "16px",
          boxShadow: isOpaque
            ? "0 10px 40px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)"
            : "var(--shadow-lg), 0 0 35px rgba(0, 0, 0, 0.5)",
          pointerEvents: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ручка изменения ширины слева */}
        <div
          className="subtitles-search-card__resize-handle"
          onMouseDown={handleResizeStart}
          onDoubleClick={handleResetWidth}
          title="Потяните для изменения ширины окна (двойной клик — сброс)"
        />

        {/* Шапка */}
        <SubtitlesModalHeader
          viewMode={viewMode}
          isOpaque={isOpaque}
          isAnalyzing={isAnalyzing}
          onToggleViewMode={handleToggleViewMode}
          onToggleOpaque={handleToggleOpaque}
          onReanalyze={handleReanalyze}
          onClose={handleClose}
          onDragStart={handleDragHeaderStart}
          onResetPosition={handleResetPosition}
        />

        {/* Панель дорожек */}
        {subTracks.length > 0 ? (
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              marginBottom: "10px",
              flexShrink: 0,
            }}
          >
            <TrackPicker
              subTracks={subTracks}
              activeTrack={activeTrack}
              currentDisplayedTrack={currentDisplayedTrack}
              selectedTrackId={selectedTrackId}
              isOpen={isTrackPickerOpen}
              onToggle={() => setIsTrackPickerOpen((prev) => !prev)}
              onSelect={handlePickTrack}
              onDisable={handlePickerDisable}
              pickerRef={trackPickerRef}
            />

            <button
              type="button"
              onClick={() => setFollowPlayback((prev) => !prev)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "7px 12px",
                background: followPlayback
                  ? "rgba(59, 130, 246, 0.18)"
                  : "rgba(255, 255, 255, 0.05)",
                border: "1px solid",
                borderColor: followPlayback
                  ? "var(--accent)"
                  : "var(--border-pill)",
                borderRadius: "var(--radius-xs)",
                color: followPlayback
                  ? "var(--accent)"
                  : "var(--text-secondary)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
                transition: "all 0.15s ease",
              }}
              className="hover-bright"
              title="Автоматически центрировать список на звучащей фразе"
            >
              <Radio
                size={13}
                className={followPlayback ? "pulse-subtle" : ""}
              />
              <span>
                {followPlayback ? "Следовать за речью" : "Следование выкл."}
              </span>
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: "8px 12px",
              background: "rgba(255, 255, 255, 0.03)",
              borderRadius: "var(--radius-xs)",
              color: "var(--text-muted)",
              fontSize: "0.8rem",
              marginBottom: "10px",
              textAlign: "center",
            }}
          >
            Дорожки субтитров не обнаружены
          </div>
        )}

        {/* Строка поиска */}
        <SubtitleSearchBar
          searchQuery={searchQuery}
          totalLines={lines.length}
          filteredCount={filteredLines.length}
          navAnchor={navAnchor}
          navPos={navPos}
          analyzedTrackTitle={analyzedTrackTitle}
          subDelay={subDelay}
          isAnalyzing={isAnalyzing}
          inputRef={inputRef}
          onSearchChange={setSearchQuery}
          onSearchKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              jumpToMatch(e.shiftKey ? -1 : 1);
            }
          }}
          onJumpPrev={() => jumpToMatch(-1)}
          onJumpNext={() => jumpToMatch(1)}
          onClearSearch={() => setSearchQuery("")}
          onStepDelay={(base, shift) =>
            handleStepSubDelay(shift ? base * 5 : base)
          }
        />

        {/* Список строк субтитров */}
        <div
          ref={listContainerRef}
          onScroll={handleListScroll}
          onWheel={(e) => {
            // Гасим следование только при выраженном вертикальном скролле;
            // горизонтальный трекпад и нулевая дельта режим не трогают.
            if (
              followPlayback &&
              e.deltaY !== 0 &&
              Math.abs(e.deltaY) > Math.abs(e.deltaX)
            ) {
              setFollowPlayback(false);
            }
          }}
          className="custom-scrollbar"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            paddingRight: "4px",
          }}
        >
          {/* Пустые состояния */}
          {(isAnalyzing && lines.length === 0) ||
          lines.length === 0 ||
          filteredLines.length === 0 ? (
            <SubtitleEmptyState
              isAnalyzing={isAnalyzing && lines.length === 0}
              isLinesEmpty={lines.length === 0}
              analyzeError={analyzeError}
              searchQuery={searchQuery}
              onLoadExternal={handleLoadExternalSubtitles}
            />
          ) : (
            <div
              style={{
                paddingTop: `${paddingTop}px`,
                paddingBottom: `${paddingBottom}px`,
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              {visibleLines.map((line) => {
                const isActive = line.index === activeLineIndex;
                return (
                  <div
                    key={line.index}
                    ref={isActive ? activeLineElRef : null}
                    data-sub-idx={line.index}
                  >
                    <SubtitleLineRow
                      line={line}
                      isActive={isActive}
                      isNavTarget={line.index === navAnchor}
                      searchQuery={searchQuery}
                      isCopied={copiedIndex === line.index}
                      viewMode={viewMode}
                      rawFormat={rawFormat}
                      onToggleRawFormat={setRawFormat}
                      onSeek={handleSeek}
                      onCopy={handleCopyText}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
