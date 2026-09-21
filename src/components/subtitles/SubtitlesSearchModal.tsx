import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search,
  X,
  Subtitles,
  Radio,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  FolderOpen,
  SlidersHorizontal,
} from "lucide-react";
import { usePlayerState, usePlayerProgress } from "../../contexts/PlayerStateContext";
import { SubtitleLineRow } from "./SubtitleLineRow";
import { TrackPicker } from "./TrackPicker";
import { useSubtitlesAnalysis } from "./useSubtitlesAnalysis";
import { useModalGeometry } from "./useModalGeometry";
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
  type SubtitleLine,
  type SubtitlesSearchModalProps,
} from "./subtitleTypes";

/**
 * Интерактивный браузер и поиск по субтитрам (Searchable Subtitles Browser).
 * Поддерживает авто-анализ дорожек, изменение ширины, сдвиг вбок и подъем
 * на полную высоту плеера.
 *
 * Оркестратор: данные дорожек — `useSubtitlesAnalysis`, геометрия окна —
 * `useModalGeometry`, селектор — `TrackPicker`, строка списка —
 * `SubtitleLineRow`. Здесь остаются только view-состояния (поиск,
 * следование, закрытие) и компоновка JSX.
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

  const [viewMode, setViewMode] = useState<SubtitleViewMode>(getInitialViewMode);

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
      try {
        localStorage.setItem(SUBTITLE_VIEW_MODE_KEY, mode);
      } catch (err) {
        console.error("Ошибка сохранения режима субтитров:", err);
      }
      adaptWidthForMode(mode);
    },
    [adaptWidthForMode]
  );

  const [rawFormat, setRawFormat] = useState<SubtitleRawFormat>(getInitialRawFormat);
  const handleToggleRawFormat = useCallback((fmt: SubtitleRawFormat) => {
    setRawFormat(fmt);
    try {
      localStorage.setItem(SUBTITLE_RAW_FORMAT_KEY, fmt);
    } catch (err) {
      console.error("Ошибка сохранения формата разметки субтитров:", err);
    }
  }, []);

  // Режим сплошного (непрозрачного) фона для максимального контраста окна
  const [isOpaque, setIsOpaque] = useState<boolean>(getInitialSubtitlesOpaque);
  const handleToggleOpaque = useCallback(() => {
    setIsOpaque((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SUBTITLE_OPAQUE_KEY, String(next));
      } catch (err) {
        console.error("Ошибка сохранения непрозрачности субтитров:", err);
      }
      return next;
    });
  }, []);

  // Ссылка на функцию листания списка стрелками для глобального слушателя клавиатуры
  const handleStepSubtitleRef = useRef<(dir: 1 | -1) => void>(() => {});

  const [searchQuery, setSearchQuery] = useState("");
  const [followPlayback, setFollowPlayback] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  // Фиксация строки при клике для мгновенного фокуса и устранения ложных перескоков
  const [clickedLineIndex, setClickedLineIndex] = useState<number | null>(null);
  const clickedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Якорь клавиатурной навигации по совпадениям (line.index) и позиция в выдаче.
  const [navAnchor, setNavAnchor] = useState<number | null>(null);
  const [navPos, setNavPos] = useState(0);
  const navPosRef = useRef(0);
  const [isTrackPickerOpen, setIsTrackPickerOpen] = useState(false);

  // Смещение скролла для виртуализации с фантомным спейсером
  const [scrollOffset, setScrollOffset] = useState(0);
  const scrollOffsetRef = useRef(0);

  const activeLineElRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const trackPickerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClosingRef = useRef(false);

  // Сброс view-состояния при смене медиафайла (строки сбрасывает сам хук анализа).
  const prevPathRef = useRef(mediaPath);
  useEffect(() => {
    if (prevPathRef.current !== mediaPath) {
      prevPathRef.current = mediaPath;
      setSearchQuery("");
      setFollowPlayback(true);
    }
  }, [mediaPath]);

  // Закрытие выпадающего списка дорожек при клике вне него
  useEffect(() => {
    if (!isTrackPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (trackPickerRef.current && !trackPickerRef.current.contains(e.target as Node)) {
        setIsTrackPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isTrackPickerOpen]);

  // Фокус на строке поиска при открытии
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Сброс якоря навигации при смене запроса или набора строк.
  useEffect(() => {
    navPosRef.current = 0;
    setNavPos(0);
    setNavAnchor(null);
  }, [searchQuery, lines]);

  /**
   * Плавное закрытие окна с гарантированным выполнением onClose.
   */
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

    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, 155);
  }, [onClose]);

  // Гарантированная очистка таймеров исключительно при полном размонтировании
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (clickedTimerRef.current) clearTimeout(clickedTimerRef.current);
      isClosingRef.current = false;
    };
  }, []);

  // Обработка закрытия по Escape и повторному нажатию Ctrl+F
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
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F" || e.code === "KeyF")) {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
        return;
      }

      // Листание списка субтитров клавишами со стрелками Вверх / Вниз
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (isTrackPickerOpen) return;
        e.preventDefault();
        e.stopPropagation();
        handleStepSubtitleRef.current(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [handleClose, isTrackPickerOpen]);

  // Обёртки селектора: хук переключает дорожку, модалка закрывает выпадашку.
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

  // Фильтрация реплик по поисковому запросу
  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) {
      return lines;
    }
    const q = searchQuery.toLowerCase().trim();
    return lines.filter((l) => l.text.toLowerCase().includes(q));
  }, [lines, searchQuery]);

  const estimatedRowHeight =
    viewMode === "technical"
      ? ESTIMATED_ROW_HEIGHT_TECH
      : ESTIMATED_ROW_HEIGHT_NORMAL;

  /**
   * Прыжок по совпадениям (Enter — вперёд, Shift+Enter — назад).
   * Только скролл, видео не трогаем; следование выключаем, чтобы
   * rAF-цикл не утащил список обратно к текущей реплике.
   */
  const jumpToMatch = useCallback(
    (dir: 1 | -1) => {
      if (filteredLines.length === 0) return;
      let next: number;
      if (navAnchor === null) {
        next = dir > 0 ? 0 : filteredLines.length - 1;
      } else {
        next =
          (navPosRef.current + dir + filteredLines.length) %
          filteredLines.length;
      }
      navPosRef.current = next;
      setNavPos(next);
      const targetLine = filteredLines[next];
      setNavAnchor(targetLine.index);
      setFollowPlayback(false);

      const container = listContainerRef.current;
      if (container) {
        const targetScrollTop = Math.max(
          0,
          next * estimatedRowHeight -
            container.clientHeight / 2 +
            estimatedRowHeight / 2
        );
        expectedScrollTopRef.current = targetScrollTop;
        scrollOffsetRef.current = targetScrollTop;
        setScrollOffset(targetScrollTop);
        container.scrollTo({
          top: targetScrollTop,
          behavior: "auto",
        });
      }
    },
    [filteredLines, navAnchor, estimatedRowHeight]
  );

  // Определение индекса текущей реплики:
  // 1. Недавний пользовательский клик (clickedLineIndex) имеет высший приоритет,
  //    чтобы мгновенно подсветить целевую реплику и сгладить микро-погрешность декодера mpv.
  // 2. Звучащая реплика (на стыке приоритет у начинающейся: position >= l.start && position < l.end).
  // 3. Точное совпадение с окончанием (position <= l.end).
  // 4. Опережение вот-вот начнётся (LEAD_IN = 0.3с).
  // 5. Ближайшая реплика при паузах.
  const activeLineIndex = useMemo(() => {
    if (lines.length === 0) return -1;

    // Пользовательский клик или навигация стрелками имеют наивысший приоритет
    // для моментального визуального отклика без ожидания асинхронного ответа плеера
    if (clickedLineIndex !== null) {
      const clicked = lines.find((l) => l.index === clickedLineIndex);
      if (clicked) {
        return clicked.index;
      }
    }

    const matching = lines.filter(
      (l) => position >= l.start && position < l.end
    );
    if (matching.length > 0) {
      const exact = matching.reduce((prev, curr) =>
        curr.start > prev.start ? curr : prev
      );
      return exact.index;
    }

    const exactAtEnd = lines.filter(
      (l) => position >= l.start && position <= l.end
    );
    if (exactAtEnd.length > 0) {
      const exact = exactAtEnd.reduce((prev, curr) =>
        curr.start > prev.start ? curr : prev
      );
      return exact.index;
    }

    const LEAD_IN = 0.3;
    const upcoming = lines.find(
      (l) => l.start > position && l.start - position <= LEAD_IN
    );
    if (upcoming) return upcoming.index;

    const getIntervalDist = (l: SubtitleLine) => {
      if (position < l.start) return l.start - position;
      if (position > l.end) return position - l.end;
      return 0;
    };

    let best = lines[0].index;
    let bestDist = getIntervalDist(lines[0]);
    for (let i = 1; i < lines.length; i++) {
      const dist = getIntervalDist(lines[i]);
      if (dist < bestDist) {
        bestDist = dist;
        best = lines[i].index;
      } else if (lines[i].start > position && lines[i].start - position > bestDist) {
        // Так как строки упорядочены по возрастанию времени, дальше дистанция будет только расти
        break;
      }
    }
    return best;
  }, [lines, position, clickedLineIndex]);

  // Виртуализация списка с фантомным спейсером (Phantom Spacer).
  // Нативный скроллбар браузера отображает полную высоту (все 2000+ строк),
  // но в DOM выводятся только VIRTUAL_WINDOW_SIZE строк вокруг позиции скролла.
  const { visibleLines, paddingTop, paddingBottom } = useMemo(() => {
    const total = filteredLines.length;
    // Для списков до 600 строк виртуализация не требуется:
    // нативный рендеринг работает идеально плавно, устраняя любые скачки paddingTop при следовании.
    if (total <= 600) {
      return {
        visibleLines: filteredLines,
        paddingTop: 0,
        paddingBottom: 0,
      };
    }

    const overscan = 30;
    // При следовании за речью центр окна виртуализации привязывается к позиции активной строки,
    // а не к пикселям скролла! Это полностью исключает паразитный резонанс и вибрацию.
    let center: number;
    if (followPlayback && activeLineIndex >= 0) {
      const activePos = filteredLines.findIndex((l) => l.index === activeLineIndex);
      center = activePos >= 0 ? activePos : Math.floor(scrollOffset / estimatedRowHeight);
    } else {
      center = Math.floor(scrollOffset / estimatedRowHeight);
    }

    const start = Math.max(
      0,
      Math.min(center - overscan, total - VIRTUAL_WINDOW_SIZE)
    );
    const end = Math.min(total, start + VIRTUAL_WINDOW_SIZE);

    const top = start * estimatedRowHeight;
    const bottom = Math.max(0, (total - end) * estimatedRowHeight);

    return {
      visibleLines: filteredLines.slice(start, end),
      paddingTop: top,
      paddingBottom: bottom,
    };
  }, [filteredLines, scrollOffset, estimatedRowHeight, followPlayback, activeLineIndex]);

  // Доводка до якоря навигации после смены окна рендера или переключения совпадения.
  useEffect(() => {
    if (navAnchor == null) return;
    const container = listContainerRef.current;
    if (!container) return;

    const rafId = requestAnimationFrame(() => {
      const target = container.querySelector(`[data-sub-idx="${navAnchor}"]`);
      if (target instanceof HTMLElement) {
        const containerRect = container.getBoundingClientRect();
        const elRect = target.getBoundingClientRect();
        const nextScrollTop =
          container.scrollTop +
          (elRect.top - containerRect.top) -
          container.clientHeight / 2 +
          elRect.height / 2;

        expectedScrollTopRef.current = nextScrollTop;
        container.scrollTo({
          top: nextScrollTop,
          behavior: "auto",
        });
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [navAnchor, visibleLines]);

  // Последний выставленный программный scrollTop — чтобы onScroll отличал
  // движение следования от ручного скролла пользователя.
  const expectedScrollTopRef = useRef<number>(NaN);

  /**
   * Расчёт адаптивного шага скролла в зависимости от дистанции до активной строки.
   * Для коротких шагов (обычный просмотр речи) — мягкое плавное движение (~20% за кадр).
   * Для больших дистанций (перемотка с 3 на 19 минуту) — динамическое ускорение
   * (сотни пикселей за кадр), благодаря которому любой прыжок преодолевается за ~300-400 мс.
   */
  const calculateAdaptiveStep = (delta: number): number => {
    const absDelta = Math.abs(delta);
    let mag: number;
    if (absDelta > 10000) {
      mag = Math.min(absDelta * 0.4, 2500);
    } else if (absDelta > 3000) {
      mag = Math.min(absDelta * 0.35, 1200);
    } else if (absDelta > 1000) {
      mag = Math.min(absDelta * 0.28, 500);
    } else if (absDelta > 300) {
      mag = Math.min(absDelta * 0.24, 200);
    } else {
      mag = Math.max(1, absDelta * 0.2);
    }
    return Math.sign(delta) * mag;
  };

  /**
   * Плавное следование за активной строкой через rAF-цикл.
   * Экспоненциальное приближение с адаптивной скоростью:
   * монотонно сходится, мёртвая зона 2px гасит субпиксельный тремор,
   * а большие скачки (перемотка фильма) долетают за доли секунды.
   * Скроллим строго контейнер списка (не scrollIntoView — тот тянет предков).
   */
  useEffect(() => {
    if (!followPlayback || searchQuery.trim() !== "" || lines.length === 0) {
      return;
    }
    let rafId = 0;
    const tick = () => {
      const container = listContainerRef.current;
      const el = activeLineElRef.current;
      if (container) {
        if (el && el.isConnected) {
          const elRect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const delta =
            elRect.top -
            containerRect.top +
            elRect.height / 2 -
            container.clientHeight / 2;
          if (Math.abs(delta) > 2) {
            const maxTop = Math.max(
              0,
              container.scrollHeight - container.clientHeight
            );
            const step = calculateAdaptiveStep(delta);
            const next = Math.max(
              0,
              Math.min(container.scrollTop + step, maxTop)
            );
            container.scrollTop = next;
            expectedScrollTopRef.current = next;
            scrollOffsetRef.current = next;
          }
        } else if (activeLineIndex >= 0) {
          const activePos = filteredLines.findIndex(
            (l) => l.index === activeLineIndex
          );
          if (activePos >= 0) {
            const targetTop = Math.max(
              0,
              activePos * estimatedRowHeight -
                container.clientHeight / 2 +
                estimatedRowHeight / 2
            );
            if (Math.abs(container.scrollTop - targetTop) > 2) {
              const delta = targetTop - container.scrollTop;
              const step = calculateAdaptiveStep(delta);
              const maxTop = Math.max(
                0,
                container.scrollHeight - container.clientHeight
              );
              const next = Math.max(
                0,
                Math.min(container.scrollTop + step, maxTop)
              );
              container.scrollTop = next;
              expectedScrollTopRef.current = next;
              scrollOffsetRef.current = next;
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    followPlayback,
    searchQuery,
    lines,
    activeLineIndex,
    filteredLines,
    estimatedRowHeight,
  ]);

  /**
   * Ручной скролл списка выключает следование. Программные сдвиги цикла
   * (scrollTop совпадает с последним выставленным) игнорируются.
   */
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
    if (followPlayback) {
      setFollowPlayback(false);
    }
  }, [followPlayback]);

  /**
   * Копирование текста реплики в буфер обмена.
   */
  const handleCopyText = useCallback((line: SubtitleLine, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard
      .writeText(line.text)
      .then(() => {
        setCopiedIndex(line.index);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopiedIndex(null), 1500);
      })
      .catch((err) => {
        console.error("Не удалось скопировать реплику:", err);
      });
  }, []);

  /**
   * Переход к началу выбранной реплики.
   * Переходим строго на line.start без искусственных откатов назад,
   * чтобы не попадать в диапазон предыдущей реплики при стыке фраз.
   */
  const handleSeek = useCallback(
    (line: SubtitleLine) => {
      setNavAnchor(null);
      setClickedLineIndex(line.index);
      if (clickedTimerRef.current) {
        clearTimeout(clickedTimerRef.current);
      }
      clickedTimerRef.current = setTimeout(() => {
        setClickedLineIndex(null);
      }, 800);
      seekTo(line.start);
    },
    [seekTo]
  );

  /**
   * Листание реплик списка (стрелки вверх/вниз с клавиатуры).
   * Выбирает следующую/предыдущую реплику, перематывает видео и центрирует строку.
   */
  const handleStepSubtitle = useCallback(
    (dir: 1 | -1) => {
      const targetLines = filteredLines.length > 0 ? filteredLines : lines;
      if (targetLines.length === 0) return;
      setNavAnchor(null);

      let currentIdx = targetLines.findIndex((l) => l.index === activeLineIndex);
      let target: SubtitleLine | undefined;

      if (currentIdx !== -1) {
        const nextIdx = currentIdx + dir;
        if (nextIdx >= 0 && nextIdx < targetLines.length) {
          target = targetLines[nextIdx];
        }
      } else {
        if (dir > 0) {
          target = targetLines.find((l) => l.start > position + 0.1);
        } else {
          for (let i = targetLines.length - 1; i >= 0; i--) {
            if (targetLines[i].start < position - 0.2) {
              target = targetLines[i];
              break;
            }
          }
        }
      }

      if (target) {
        setClickedLineIndex(target.index);
        if (clickedTimerRef.current) {
          clearTimeout(clickedTimerRef.current);
        }
        clickedTimerRef.current = setTimeout(() => {
          setClickedLineIndex(null);
        }, 800);
        seekTo(target.start);

        const container = listContainerRef.current;
        if (container) {
          const targetPos = targetLines.findIndex((l) => l.index === target!.index);
          if (targetPos >= 0) {
            const targetTop = Math.max(
              0,
              targetPos * estimatedRowHeight -
                container.clientHeight / 2 +
                estimatedRowHeight / 2
            );
            expectedScrollTopRef.current = targetTop;
            scrollOffsetRef.current = targetTop;
            if (!followPlayback) {
              container.scrollTo({
                top: targetTop,
                behavior: "smooth",
              });
            }
          }
        }
      }
    },
    [
      filteredLines,
      lines,
      activeLineIndex,
      position,
      seekTo,
      estimatedRowHeight,
      followPlayback,
    ]
  );

  useEffect(() => {
    handleStepSubtitleRef.current = handleStepSubtitle;
  }, [handleStepSubtitle]);

  /**
   * Переключение следования за речью. При включении rAF-цикл сам плавно
   * дотянет список до текущей реплики — отдельные scrollTo не нужны
   * (они бы боролись с циклом за scrollTop).
   */
  const handleToggleFollow = useCallback(() => {
    setFollowPlayback((prev) => !prev);
  }, []);

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
          viewMode === "technical" ? TECH_MODAL_MIN_WIDTH : MIN_MODAL_WIDTH
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
        } ${isResizing || isDragging ? "subtitles-search-card--resizing" : ""}`}
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

        {/* Шапка окна с поддержкой перемещения вбок */}
        <div
          className="subtitles-search-card__header--draggable"
          onMouseDown={handleDragHeaderStart}
          onDoubleClick={handleResetPosition}
          title="Потяните за шапку для перемещения окна вбок (двойной клик — привязать к правому краю)"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
            flexShrink: 0,
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--radius-xs)",
                background:
                  "linear-gradient(135deg, var(--accent, #3b82f6) 0%, rgba(59, 130, 246, 0.4) 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                flexShrink: 0,
              }}
            >
              <Subtitles size={16} />
            </div>
            <div
              style={{
                fontSize: "var(--fs-lg)",
                fontWeight: 600,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Поиск по субтитрам
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            {/* Переключатель режимов: Обычный / Инспектор */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px",
                background: "rgba(0, 0, 0, 0.35)",
                borderRadius: "var(--radius-xs)",
                border: "1px solid var(--border-pill)",
                marginRight: 4,
              }}
            >
              <button
                type="button"
                onClick={() => handleToggleViewMode("normal")}
                style={{
                  background:
                    viewMode === "normal"
                      ? "var(--accent)"
                      : "transparent",
                  color:
                    viewMode === "normal"
                      ? "#fff"
                      : "var(--text-muted)",
                  border: "none",
                  borderRadius: "calc(var(--radius-xs) - 2px)",
                  padding: "3px 7px",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.15s ease, color 0.15s ease",
                  lineHeight: 1.2,
                }}
                title="Обычный режим: текст реплик и таймкоды"
              >
                Обычный
              </button>
              <button
                type="button"
                onClick={() => handleToggleViewMode("technical")}
                style={{
                  background:
                    viewMode === "technical"
                      ? "var(--accent)"
                      : "transparent",
                  color:
                    viewMode === "technical"
                      ? "#fff"
                      : "var(--text-muted)",
                  border: "none",
                  borderRadius: "calc(var(--radius-xs) - 2px)",
                  padding: "3px 7px",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.15s ease, color 0.15s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  lineHeight: 1.2,
                }}
                title="Технический инспектор: стили, шрифты, кегли, цвета, слои, позиционирование и сырой код"
              >
                <SlidersHorizontal size={11} />
                <span>Инспектор</span>
              </button>
            </div>

            {/* Кнопка переключения прозрачности окна субтитров */}
            <button
              className="modal__close"
              onClick={handleToggleOpaque}
              title={
                isOpaque
                  ? "Включить прозрачность окна субтитров"
                  : "Убрать прозрачность окна субтитров (сплошной фон)"
              }
              aria-label={
                isOpaque
                  ? "Включить прозрачность окна субтитров"
                  : "Убрать прозрачность окна субтитров"
              }
              style={{
                width: 28,
                height: 28,
                color: isOpaque ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {isOpaque ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button
              className="modal__close"
              onClick={handleReanalyze}
              title="Пересканировать дорожку"
              aria-label="Пересканировать дорожку"
              style={{ width: 28, height: 28 }}
            >
              <RefreshCw size={14} className={isAnalyzing ? "spin-animation" : ""} />
            </button>
            <button
              className="modal__close"
              onClick={handleClose}
              title="Закрыть (Esc)"
              aria-label="Закрыть"
              style={{ width: 28, height: 28 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Панель дорожек и кнопка «Следовать за речью» */}
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
            {/* Селектор дорожек */}
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

            {/* Кнопка «Следовать за речью» вместо кнопки «Анализировать» */}
            <button
              type="button"
              onClick={handleToggleFollow}
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
                borderColor: followPlayback ? "var(--accent)" : "var(--border-pill)",
                borderRadius: "var(--radius-xs)",
                color: followPlayback ? "var(--accent)" : "var(--text-secondary)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
                transition: "all 0.15s ease",
              }}
              className="hover-bright"
              title="Автоматически центрировать список на звучащей фразе"
            >
              <Radio size={13} className={followPlayback ? "pulse-subtle" : ""} />
              <span>{followPlayback ? "Следовать за речью" : "Следование выкл."}</span>
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

        {/* Поле поиска */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginBottom: "10px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 10,
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  jumpToMatch(e.shiftKey ? -1 : 1);
                }
              }}
              placeholder="Поиск по диалогам и тексту..."
              title="Enter — следующее совпадение, Shift+Enter — предыдущее"
              style={{
                width: "100%",
                padding:
                  searchQuery && filteredLines.length > 0
                    ? "8px 76px 8px 32px"
                    : "8px 32px 8px 32px",
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid var(--border-pill)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: "0.84rem",
                outline: "none",
                transition: "border-color 0.15s ease",
              }}
            />
            {filteredLines.length > 0 && searchQuery.trim() && (
              <div
                style={{
                  position: "absolute",
                  right: searchQuery ? 30 : 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <button
                  type="button"
                  onClick={() => jumpToMatch(-1)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 2,
                    borderRadius: "var(--radius-xs)",
                  }}
                  className="hover-bright"
                  title="Предыдущее совпадение (Shift+Enter)"
                  aria-label="Предыдущее совпадение"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => jumpToMatch(1)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 2,
                    borderRadius: "var(--radius-xs)",
                  }}
                  className="hover-bright"
                  title="Следующее совпадение (Enter)"
                  aria-label="Следующее совпадение"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
            )}
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 8,
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 2,
                }}
                className="hover-bright"
                title="Очистить поиск"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Строка метаинформации о количестве строк */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              padding: "0 2px",
            }}
          >
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {searchQuery.trim() ? (
                <span>
                  Найдено:{" "}
                  <strong style={{ color: "var(--accent)" }}>{filteredLines.length}</strong>{" "}
                  из {lines.length}
                  {navAnchor !== null && filteredLines.length > 0 && (
                    <span style={{ opacity: 0.7 }}>
                      {" "}
                      · {navPos + 1}/{filteredLines.length}
                    </span>
                  )}
                </span>
              ) : (
                <span>
                  Всего строк:{" "}
                  <strong style={{ color: "var(--text-primary)" }}>{lines.length}</strong>
                  {analyzedTrackTitle && (
                    <span style={{ opacity: 0.7, marginLeft: 5 }}>({analyzedTrackTitle})</span>
                  )}
                </span>
              )}
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
              }}
            >
              {/* Сдвиг таймингов: − раньше, + позже (с Shift — шаг 0.5с) */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                }}
                title="Сдвинуть субтитры: − раньше, + позже (с Shift — шаг 0.5с)"
              >
                <button
                  type="button"
                  onClick={(e) => handleStepSubDelay(e.shiftKey ? -0.5 : -0.1)}
                  className="hover-bright"
                  title="Субтитры раньше"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "2px 6px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  −
                </button>
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--text-secondary)",
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 44,
                    textAlign: "center",
                  }}
                >
                  {subDelay > 0 ? "+" : ""}
                  {subDelay.toFixed(1)}с
                </span>
                <button
                  type="button"
                  onClick={(e) => handleStepSubDelay(e.shiftKey ? 0.5 : 0.1)}
                  className="hover-bright"
                  title="Субтитры позже"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "2px 6px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  +
                </button>
              </div>

              {isAnalyzing && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: "0.72rem",
                    color: "var(--accent)",
                  }}
                >
                  <Loader2 size={11} className="spin-animation" />
                  <span>Анализ...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Список строк субтитров */}
        <div
          ref={listContainerRef}
          onScroll={handleListScroll}
          onWheel={(e) => {
            // Гасим следование только на выраженный вертикальный скролл:
            // горизонтальный (трекпад) и нулевая дельта режим не трогают.
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
          {isAnalyzing && lines.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: 10,
                color: "var(--text-muted)",
                fontSize: "0.85rem",
              }}
            >
              <Loader2 size={26} className="spin-animation" style={{ color: "var(--accent)" }} />
              <span>Анализ дорожки субтитров через FFmpeg...</span>
              <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                Извлечение реплик и временных меток
              </span>
            </div>
          ) : lines.length === 0 ? (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                textAlign: "center",
                padding: "40px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <Subtitles size={32} style={{ opacity: 0.4 }} />
              <div>{analyzeError || "Субтитры для выбранной дорожки не найдены."}</div>
              <div style={{ fontSize: "0.78rem", opacity: 0.8, maxWidth: "320px" }}>
                {analyzeError
                  ? "Попробуйте другую дорожку или подключите внешний файл субтитров."
                  : "Выберите другую дорожку субтитров в селекторе выше."}
              </div>
              <button
                type="button"
                onClick={handleLoadExternalSubtitles}
                className="hover-bright"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  background: "rgba(59, 130, 246, 0.15)",
                  border: "1px solid var(--accent)",
                  borderRadius: "var(--radius-xs)",
                  color: "var(--accent)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                <FolderOpen size={13} />
                <span>Загрузить файл субтитров…</span>
              </button>
            </div>
          ) : filteredLines.length === 0 ? (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                textAlign: "center",
                padding: "40px 16px",
              }}
            >
              По запросу «{searchQuery}» ничего не найдено.
            </div>
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
                      onToggleRawFormat={handleToggleRawFormat}
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
