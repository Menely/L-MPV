import { useMemo, useRef } from "react";
import type { SubtitleLine } from "./subtitleTypes";

interface UseActiveLineIndexParams {
  lines: SubtitleLine[];
  position: number;
  clickedLineIndex: number | null;
}

/**
 * Вычисляет индекс активной реплики субтитров по текущей позиции воспроизведения.
 *
 * Принципы детерминированности и стабильности:
 * 1. Приоритет пользователя: явный клик или навигация стрелками (`clickedLineIndex`).
 * 2. Звучащие реплики: если в момент времени `position` звучит одна или несколько реплик:
 *    - Предпочитается реплика, начавшаяся позже (свежая речь).
 *    - При близких таймингах старта (≤ 0.2 с) предпочтение отдаётся реплике с меньшей
 *      длительностью (реплики диалогов короче многосекундных фоновых вывесок/песен).
 *    - Гистерезис: пока текущая звучащая реплика не закончилась, не переключаемся
 *      на старые фоновые дорожки.
 * 3. Паузы между репликами (тишина):
 *    - Список удерживает последнюю прозвучавшую реплику вплоть до начала следующей.
 *    - Исключаются преждевременные скачки вперёд в паузах и осцилляции по Евклидову расстоянию.
 */
export function useActiveLineIndex({
  lines,
  position,
  clickedLineIndex,
}: UseActiveLineIndexParams): number {
  const lastActiveIndexRef = useRef<number>(-1);

  return useMemo(() => {
    if (lines.length === 0) return -1;

    // Приоритет 1: явный выбор пользователя
    if (clickedLineIndex !== null) {
      const clicked = lines.find((l) => l.index === clickedLineIndex);
      if (clicked) {
        lastActiveIndexRef.current = clicked.index;
        return clicked.index;
      }
    }

    // 1. Поиск реплик, звучащих непосредственно в момент времени `position`
    const activeMatches = lines.filter(
      (l) => position >= l.start && position < l.end
    );

    let chosenIndex = -1;

    if (activeMatches.length > 0) {
      // Сортировка перекрывающихся реплик:
      // 1) По времени начала (позже начавшиеся имеют высший приоритет)
      // 2) При близком старте (разница ≤ 0.2с) — более короткие по длительности (диалог важнее вывески)
      activeMatches.sort((a, b) => {
        const startDiff = b.start - a.start;
        if (Math.abs(startDiff) > 0.2) return startDiff;
        return (a.end - a.start) - (b.end - b.start);
      });

      // Гистерезис: если предыдущая реплика всё ещё звучит и её начало не старше новой — держим её
      const prevActive = lines.find((l) => l.index === lastActiveIndexRef.current);
      if (
        prevActive &&
        position >= prevActive.start &&
        position < prevActive.end &&
        activeMatches[0].start <= prevActive.start + 0.15
      ) {
        chosenIndex = prevActive.index;
      } else {
        chosenIndex = activeMatches[0].index;
      }
    } else {
      // В моменты тишины между репликами:
      // Фиксируемся на последней прозвучавшей реплике (не прыгаем вперёд до старта новой)
      let lastSpokenIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].start <= position) {
          lastSpokenIndex = lines[i].index;
        } else if (lastSpokenIndex !== -1 && lines[i].start > position + 0.05) {
          break;
        }
      }

      if (lastSpokenIndex !== -1) {
        chosenIndex = lastSpokenIndex;
      } else {
        // Позиция до первой реплики в файле
        chosenIndex = lines[0].index;
      }
    }

    lastActiveIndexRef.current = chosenIndex;
    return chosenIndex;
  }, [lines, position, clickedLineIndex]);
}
