import { useEffect } from "react";
import type { RefObject } from "react";
import type { SubtitleLine } from "../subtitleTypes";

import { useMotionAllowed } from "../../motion/useMotionAllowed";
import { nextFollowScrollTop } from "../lib/followScroll";

interface UseFollowPlaybackParams {
  followPlayback: boolean;
  searchQuery: string;
  lines: SubtitleLine[];
  activeLineIndex: number;
  filteredLines: SubtitleLine[];
  estimatedRowHeight: number;
  listContainerRef: RefObject<HTMLDivElement | null>;
  activeLineElRef: RefObject<HTMLDivElement | null>;
  /** Ref синхронизации последнего программного scrollTop (исключает
   *  ложное срабатывание ручного-скролл-детектора). */
  expectedScrollTopRef: RefObject<number>;
  /** Ref текущего scrollOffset для виртуализатора. */
  scrollOffsetRef: RefObject<number>;
  /** Ref временной метки последней ручной навигации (стрелками или кликом). */
  lastManualNavTimeRef?: RefObject<number>;
}

/** Follow only this list, preserving the manual-navigation pause and virtualized fallback. */
export function useFollowPlayback({
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
  lastManualNavTimeRef,
}: UseFollowPlaybackParams): void {
  const motionAllowed = useMotionAllowed();
  useEffect(() => {
    if (
      !followPlayback ||
      searchQuery.trim() !== "" ||
      lines.length === 0
    ) {
      return;
    }

    let rafId = 0;
    let missFrames = 0;
    let lastTime = performance.now();
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;

    const applyScroll = (container: HTMLDivElement, target: number, elapsedMs: number): boolean => {
      const before = container.scrollTop;
      const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
      const next = nextFollowScrollTop(before, target, maximum, elapsedMs, motionAllowed, container.clientHeight);
      container.scrollTop = next;
      // Some WebView/DPR combinations quantize subpixel writes. Finish rather than spin.
      if (container.scrollTop === before && next !== before) {
        container.scrollTop = Math.max(0, Math.min(target, maximum));
      }
      expectedScrollTopRef.current = container.scrollTop;
      scrollOffsetRef.current = container.scrollTop;
      return Math.abs(container.scrollTop - before) > 0.01;
    };

    const tick = (time: number) => {
      const elapsedMs = Math.min(64, Math.max(0, time - lastTime));
      lastTime = time;
      // A callback can share a frame timestamp with the effect that started it.
      if (motionAllowed && elapsedMs === 0) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const container = listContainerRef.current;
      if (!container) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      // Если пользователь недавно переключал реплики стрелками или кликал вручную —
      // не перетягиваем список в центр принудительно, даём спокойно просмотреть фрагмент
      const manualPauseRemaining = 2000 - (Date.now() - (lastManualNavTimeRef?.current ?? 0));
      if (manualPauseRemaining > 0) {
        resumeTimer = setTimeout(() => {
          lastTime = performance.now();
          rafId = requestAnimationFrame(tick);
        }, manualPauseRemaining);
        return;
      }

      // Находим актуальный DOM-элемент активной реплики (проверяем соответствие data-sub-idx)
      let targetEl = activeLineElRef.current;
      if (
        !targetEl ||
        !targetEl.isConnected ||
        targetEl.getAttribute("data-sub-idx") !== String(activeLineIndex)
      ) {
        targetEl = container.querySelector<HTMLDivElement>(
          `[data-sub-idx="${activeLineIndex}"]`
        );
      }

      let needsAnotherTick = false;

      if (targetEl && targetEl.isConnected) {
        missFrames = 0;
        // Элемент присутствует в DOM — центруем по нему точно
        const elRect = targetEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const scale = container.offsetHeight > 0 ? containerRect.height / container.offsetHeight : 1;
        const delta =
          (elRect.top - containerRect.top + elRect.height / 2) / scale -
          container.clientTop -
          container.clientHeight / 2;

        if (Math.abs(delta) > 2) {
          needsAnotherTick = applyScroll(container, container.scrollTop + delta, elapsedMs);
        }
      } else if (activeLineIndex >= 0) {
        // Защита: не прыгаем по грубой estimatedRowHeight сразу в первом же кадре смены реплики,
        // даём React до 3 кадров смонтировать DOM-элемент. Это предотвращает раскачку "вниз-вверх".
        missFrames++;
        if (missFrames > 3) {
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
              needsAnotherTick = applyScroll(container, targetTop, elapsedMs);
            }
          }
        } else {
          needsAnotherTick = true;
        }
      }

      if (needsAnotherTick) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (resumeTimer !== undefined) clearTimeout(resumeTimer);
    };
  }, [
    motionAllowed,
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
    lastManualNavTimeRef,
  ]);
}
