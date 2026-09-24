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
  searchQuery: string;
  listContainerRef: RefObject<HTMLDivElement | null>;
  scrollOffsetRef: RefObject<number>;
  expectedScrollTopRef: RefObject<number>;
  setFollowPlayback: Dispatch<SetStateAction<boolean>>;
  setClickedLineIndex: Dispatch<SetStateAction<number | null>>;
  clickedTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  seekTo: (time: number) => void;
  /** Ref временной метки последней ручной навигации. */
  lastManualNavTimeRef?: RefObject<number>;
}

interface UseSearchNavigationResult {
  navAnchor: number | null;
  navPos: number;
  jumpToMatch: (dir: 1 | -1) => void;
  handleStepSubtitle: (dir: 1 | -1) => void;
  /** Сброс якоря навигации (например, при прямом клике на строку). */
  resetNavAnchor: (lineIndex?: number) => void;
  /** Обновляемый ref для globalKeyDown-слушателя (всегда актуален). */
  handleStepSubtitleRef: RefObject<(dir: 1 | -1) => void>;
}

/**
 * Навигация по совпадениям поиска (Enter) и деликатное листание реплик стрелками.
 *
 * `jumpToMatch` — перемещение по результатам поиска: не трогает видео,
 *   только скроллирует список и отключает следование.
 *
 * `handleStepSubtitle` — листание соседних реплик (↑/↓ с клавиатуры):
 *   перематывает видео на целевую реплику и аккуратно скроллит только
 *   при выходе за границы видимости, не срывая список в центр экрана.
 */
export function useSearchNavigation({
  filteredLines,
  lines,
  activeLineIndex,
  position,
  estimatedRowHeight,
  searchQuery,
  listContainerRef,
  scrollOffsetRef,
  expectedScrollTopRef,
  setFollowPlayback,
  setClickedLineIndex,
  clickedTimerRef,
  seekTo,
  lastManualNavTimeRef,
}: UseSearchNavigationParams): UseSearchNavigationResult {
  const [navAnchor, setNavAnchor] = useState<number | null>(null);
  const [navPos, setNavPos] = useState(0);
  const navPosRef = useRef(0);
  const lastNavIndexRef = useRef<number | null>(null);

  // Сброс якоря при смене запроса или набора строк
  useEffect(() => {
    navPosRef.current = 0;
    setNavPos(0);
    setNavAnchor(null);
    lastNavIndexRef.current = null;
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
      lastNavIndexRef.current = targetLine.index;
      setFollowPlayback(false);
      if (lastManualNavTimeRef) {
        lastManualNavTimeRef.current = Date.now();
      }

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
      lastManualNavTimeRef,
    ]
  );

  /**
   * Листание реплик стрелками (↑/↓ с клавиатуры).
   * Перематывает видео на целевую реплику и деликатно прокручивает
   * список только при приближении к границам экрана.
   */
  const handleStepSubtitle = useCallback(
    (dir: 1 | -1) => {
      const targetLines =
        filteredLines.length > 0 ? filteredLines : lines;
      if (targetLines.length === 0) return;

      const container = listContainerRef.current;

      // 1. Определение текущей опорной реплики
      let currentIdx = -1;

      // Приоритет A: предыдущая выбранная реплика из клавиатурной навигации
      if (lastNavIndexRef.current !== null) {
        currentIdx = targetLines.findIndex(
          (l) => l.index === lastNavIndexRef.current
        );
      }

      // Приоритет B: якорь совпадения поиска
      if (currentIdx === -1 && navAnchor !== null) {
        currentIdx = targetLines.findIndex((l) => l.index === navAnchor);
      }

      // Приоритет C: активная реплика из воспроизведения
      if (currentIdx === -1 && activeLineIndex >= 0) {
        currentIdx = targetLines.findIndex(
          (l) => l.index === activeLineIndex
        );
      }

      // Проверка: если строка найдена, но пользователь вручную ускроллил список
      // в сторону так, что её нет в видимой зоне, отталкиваемся от видимой реплики
      if (container && currentIdx !== -1) {
        const lineItem = targetLines[currentIdx];
        const el = container.querySelector<HTMLElement>(
          `[data-sub-idx="${lineItem.index}"]`
        );
        if (el) {
          const cr = container.getBoundingClientRect();
          const er = el.getBoundingClientRect();
          const isVisible = er.bottom > cr.top && er.top < cr.bottom;
          if (!isVisible) {
            currentIdx = -1;
          }
        } else {
          currentIdx = -1;
        }
      }

      // Приоритет D: если опорная реплика за пределами экрана — находим видимую в контейнере
      if (currentIdx === -1 && container) {
        const cr = container.getBoundingClientRect();
        const rendered = Array.from(
          container.querySelectorAll<HTMLElement>("[data-sub-idx]")
        );
        const visibleEl = rendered.find((el) => {
          const er = el.getBoundingClientRect();
          return er.bottom > cr.top + 20 && er.top < cr.bottom - 20;
        });
        if (visibleEl) {
          const subIdx = Number(visibleEl.getAttribute("data-sub-idx"));
          currentIdx = targetLines.findIndex((l) => l.index === subIdx);
        }
      }

      // Вычисляем следующий индекс: шаг вперёд (+1) или назад (-1)
      let nextIdx: number;
      if (currentIdx !== -1) {
        nextIdx = Math.max(
          0,
          Math.min(targetLines.length - 1, currentIdx + dir)
        );
      } else {
        if (dir > 0) {
          const found = targetLines.findIndex((l) => l.start > position + 0.1);
          nextIdx = found !== -1 ? found : 0;
        } else {
          let found = -1;
          for (let i = targetLines.length - 1; i >= 0; i--) {
            if (targetLines[i].start < position - 0.2) {
              found = i;
              break;
            }
          }
          nextIdx = found !== -1 ? found : targetLines.length - 1;
        }
      }

      const target = targetLines[nextIdx];
      if (!target) return;

      lastNavIndexRef.current = target.index;
      if (searchQuery.trim()) {
        setNavAnchor(target.index);
      }
      setClickedLineIndex(target.index);
      if (clickedTimerRef.current) {
        clearTimeout(clickedTimerRef.current);
      }
      clickedTimerRef.current = setTimeout(() => {
        setClickedLineIndex(null);
      }, 1500);

      // Фиксируем время ручного действия, чтобы rAF-следование не срывало список
      if (lastManualNavTimeRef) {
        lastManualNavTimeRef.current = Date.now();
      }

      seekTo(target.start);

      // 2. Деликатный скролл без хаотичных прыжков:
      // Если целевая реплика уже в видимой зоне — скролл = 0.
      // Если выходит за границы — подкручиваем ровно на недостающее расстояние строки.
      if (container) {
        const targetEl = container.querySelector<HTMLElement>(
          `[data-sub-idx="${target.index}"]`
        );
        if (targetEl) {
          const cr = container.getBoundingClientRect();
          const er = targetEl.getBoundingClientRect();

          const PADDING = 28;
          const topDiff = er.top - cr.top;
          const bottomDiff = cr.bottom - er.bottom;

          let targetScrollTop = container.scrollTop;

          if (topDiff < PADDING) {
            // Элемент выше зоны комфорта (выходит за верхний край)
            const delta = PADDING - topDiff;
            targetScrollTop = Math.max(0, container.scrollTop - delta);
          } else if (bottomDiff < PADDING) {
            // Элемент ниже зоны комфорта (выходит за нижний край)
            const delta = PADDING - bottomDiff;
            const maxScroll = Math.max(
              0,
              container.scrollHeight - container.clientHeight
            );
            targetScrollTop = Math.min(maxScroll, container.scrollTop + delta);
          }

          if (Math.abs(targetScrollTop - container.scrollTop) > 1) {
            expectedScrollTopRef.current = targetScrollTop;
            scrollOffsetRef.current = targetScrollTop;
            container.scrollTop = targetScrollTop;
          }
        } else {
          // Если элемента нет в DOM (редкий прыжок через виртуализацию)
          const targetPos = targetLines.findIndex(
            (l) => l.index === target!.index
          );
          if (targetPos >= 0) {
            const approxTop = Math.max(
              0,
              targetPos * estimatedRowHeight - container.clientHeight / 2
            );
            expectedScrollTopRef.current = approxTop;
            scrollOffsetRef.current = approxTop;
            container.scrollTop = approxTop;
          }
        }
      }
    },
    [
      filteredLines,
      lines,
      activeLineIndex,
      position,
      navAnchor,
      searchQuery,
      seekTo,
      estimatedRowHeight,
      listContainerRef,
      scrollOffsetRef,
      expectedScrollTopRef,
      setClickedLineIndex,
      clickedTimerRef,
      lastManualNavTimeRef,
    ]
  );

  // Обновляемый ref для глобального keydown-слушателя
  const handleStepSubtitleRef = useRef<(dir: 1 | -1) => void>(
    handleStepSubtitle
  );
  useEffect(() => {
    handleStepSubtitleRef.current = handleStepSubtitle;
  }, [handleStepSubtitle]);

  const resetNavAnchor = useCallback((lineIndex?: number) => {
    setNavAnchor(null);
    if (lineIndex !== undefined) {
      lastNavIndexRef.current = lineIndex;
    }
  }, []);

  return {
    navAnchor,
    navPos,
    jumpToMatch,
    handleStepSubtitle,
    resetNavAnchor,
    handleStepSubtitleRef,
  };
}
