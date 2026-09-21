import { useMemo } from "react";
import type { SubtitleLine } from "./subtitleTypes";

interface UseActiveLineIndexParams {
  lines: SubtitleLine[];
  position: number;
  clickedLineIndex: number | null;
}

/**
 * Вычисляет индекс активной реплики субтитров по текущей позиции плеера.
 *
 * Приоритеты определения (от высшего к низшему):
 * 1. Пользовательский клик/навигация (`clickedLineIndex`) — мгновенный
 *    визуальный отклик без ожидания асинхронного ответа mpv.
 * 2. Звучащая реплика (position >= start && position < end),
 *    при перекрытии предпочитается позже начавшаяся.
 * 3. Реплика, заканчивающаяся точно на position (position <= end).
 * 4. «Lead-in» — реплика, начинающаяся через ≤ 0.3 с от position.
 * 5. Ближайшая к position реплика (минимальное интервальное расстояние).
 */
export function useActiveLineIndex({
  lines,
  position,
  clickedLineIndex,
}: UseActiveLineIndexParams): number {
  return useMemo(() => {
    if (lines.length === 0) return -1;

    // Приоритет 1: явный клик или навигация стрелками
    if (clickedLineIndex !== null) {
      const clicked = lines.find((l) => l.index === clickedLineIndex);
      if (clicked) return clicked.index;
    }

    // Приоритет 2: звучащая реплика
    const matching = lines.filter(
      (l) => position >= l.start && position < l.end
    );
    if (matching.length > 0) {
      const exact = matching.reduce((prev, curr) =>
        curr.start > prev.start ? curr : prev
      );
      return exact.index;
    }

    // Приоритет 3: реплика, которая только что закончилась
    const exactAtEnd = lines.filter(
      (l) => position >= l.start && position <= l.end
    );
    if (exactAtEnd.length > 0) {
      const exact = exactAtEnd.reduce((prev, curr) =>
        curr.start > prev.start ? curr : prev
      );
      return exact.index;
    }

    // Приоритет 4: «lead-in» — реплика вот-вот начнётся
    const LEAD_IN = 0.3;
    const upcoming = lines.find(
      (l) =>
        l.start > position && l.start - position <= LEAD_IN
    );
    if (upcoming) return upcoming.index;

    // Приоритет 5: ближайшая по интервальному расстоянию
    const getIntervalDist = (l: SubtitleLine): number => {
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
      } else if (
        lines[i].start > position &&
        lines[i].start - position > bestDist
      ) {
        // Строки упорядочены по возрастанию — дальше дистанция только растёт
        break;
      }
    }
    return best;
  }, [lines, position, clickedLineIndex]);
}
