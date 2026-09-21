import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SubtitleLine } from "./subtitleTypes";

interface UseSearchNavigationParams {
  filteredLines: SubtitleLine[];
  lines: SubtitleLine[];
  activeLineIndex: number;
  position: number;
  estimatedRowHeight: number;
  followPlayback: boolean;
  searchQuery: string;
  listContainerRef: RefObject<HTMLDivElement | null>;
  scrollOffsetRef: RefObject<number>;
  expectedScrollTopRef: RefObject<number>;
  setFollowPlayback: Dispatch<SetStateAction<boolean>>;
  setClickedLineIndex: Dispatch<SetStateAction<number | null>>;
  clickedTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  seekTo: (time: number) => void;
}

interface UseSearchNavigationResult {
  navAnchor: number | null;
  navPos: number;
  jumpToMatch: (dir: 1 | -1) => void;
  handleStepSubtitle: (dir: 1 | -1) => void;
  /** Сброс якоря навигации (например, при прямом клике на строку). */
  resetNavAnchor: () => void;
  /** Обновляемый ref для globalKeyDown-слушателя (всегда актуален). */
  handleStepSubtitleRef: RefObject<(dir: 1 | -1) => void>;
}

/**
 * Навигация по совпадениям поиска (Enter) и листание реплик стрелками.
 *
 * `jumpToMatch` — перемещение по результатам поиска: не трогает видео,
 *   только скроллирует список и отключает следование.
 *
 * `handleStepSubtitle` — листание соседних реплик (↑/↓ с клавиатуры):
 *   перематывает видео на начало целевой реплики и центрирует список.
 */
export function useSearchNavigation({
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
}: UseSearchNavigationParams): UseSearchNavigationResult {
  const [navAnchor, setNavAnchor] = useState<number | null>(null);
  const [navPos, setNavPos] = useState(0);
  const navPosRef = useRef(0);

  // Сброс якоря при смене запроса или набора строк
  useEffect(() => {
    navPosRef.current = 0;
    setNavPos(0);
    setNavAnchor(null);
  }, [searchQuery, lines]);

  /**
   * Доводка до якоря навигации после смены окна виртуализации или
   * переключения совпадения.
   */
  useEffect(() => {
    if (navAnchor == null) return;
    const container = listContainerRef.current;
    if (!container) return;

    const rafId = requestAnimationFrame(() => {
      const target = container.querySelector(
        `[data-sub-idx="${navAnchor}"]`
      );
      if (target instanceof HTMLElement) {
        const containerRect = container.getBoundingClientRect();
        const elRect = target.getBoundingClientRect();
        const nextScrollTop =
          container.scrollTop +
          (elRect.top - containerRect.top) -
          container.clientHeight / 2 +
          elRect.height / 2;

        expectedScrollTopRef.current = nextScrollTop;
        container.scrollTo({ top: nextScrollTop, behavior: "auto" });
      }
    });

    return () => cancelAnimationFrame(rafId);
    // filteredLines нужны как триггер после изменения окна виртуализации
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navAnchor, filteredLines]);

  /**
   * Переход к следующему/предыдущему совпадению поиска.
   * Только скролл — видео не перематываем; следование выключаем, чтобы
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
        container.scrollTo({ top: targetScrollTop, behavior: "auto" });
      }
    },
    [
      filteredLines,
      navAnchor,
      estimatedRowHeight,
      listContainerRef,
      scrollOffsetRef,
      expectedScrollTopRef,
      setFollowPlayback,
    ]
  );

  /**
   * Листание реплик стрелками (↑/↓ с клавиатуры).
   * Перематывает видео на начало целевой реплики и центрирует список.
   */
  const handleStepSubtitle = useCallback(
    (dir: 1 | -1) => {
      const targetLines =
        filteredLines.length > 0 ? filteredLines : lines;
      if (targetLines.length === 0) return;
      setNavAnchor(null);

      const currentIdx = targetLines.findIndex(
        (l) => l.index === activeLineIndex
      );
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

      if (!target) return;

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
        const targetPos = targetLines.findIndex(
          (l) => l.index === target!.index
        );
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
            container.scrollTo({ top: targetTop, behavior: "smooth" });
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
      listContainerRef,
      scrollOffsetRef,
      expectedScrollTopRef,
      setClickedLineIndex,
      clickedTimerRef,
    ]
  );

  // Обновляемый ref для глобального keydown-слушателя
  const handleStepSubtitleRef = useRef<(dir: 1 | -1) => void>(
    handleStepSubtitle
  );
  useEffect(() => {
    handleStepSubtitleRef.current = handleStepSubtitle;
  }, [handleStepSubtitle]);

  const resetNavAnchor = useCallback(() => setNavAnchor(null), []);

  return {
    navAnchor,
    navPos,
    jumpToMatch,
    handleStepSubtitle,
    resetNavAnchor,
    handleStepSubtitleRef,
  };
}
