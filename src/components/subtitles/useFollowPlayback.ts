import { useEffect } from "react";
import type { RefObject } from "react";
import type { SubtitleLine } from "./subtitleTypes";

/**
 * Адаптивный шаг скролла в зависимости от расстояния до цели.
 * При малых дельтах — мягкое плавное движение (~20% за кадр).
 * При больших (перемотка с 3 на 19 минуту) — динамическое ускорение,
 * чтобы добраться до цели за ~300–400 мс.
 */
export function calculateAdaptiveStep(delta: number): number {
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
}

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
}

/**
 * Плавное следование за активной репликой через rAF-цикл.
 *
 * Экспоненциальное приближение с адаптивной скоростью:
 * - монотонно сходится, мёртвая зона 2 px гасит субпиксельный тремор.
 * - Большие скачки (перемотка по таймлайну) преодолеваются
 *   за доли секунды благодаря `calculateAdaptiveStep`.
 * - Скроллим строго контейнер списка (не scrollIntoView —
 *   тот тянет предков).
 *
 * При выключенном следовании (`followPlayback = false`) или при
 * активном поисковом запросе эффект не запускается.
 */
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
}: UseFollowPlaybackParams): void {
  useEffect(() => {
    if (
      !followPlayback ||
      searchQuery.trim() !== "" ||
      lines.length === 0
    ) {
      return;
    }

    let rafId = 0;

    const tick = () => {
      const container = listContainerRef.current;
      const el = activeLineElRef.current;

      if (container) {
        if (el && el.isConnected) {
          // Элемент присутствует в DOM — центруем по нему точно
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
          // Элемент не рендерится (вне окна виртуализации) —
          // считаем целевой scrollTop через estimatedRowHeight
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
    listContainerRef,
    activeLineElRef,
    expectedScrollTopRef,
    scrollOffsetRef,
  ]);
}
