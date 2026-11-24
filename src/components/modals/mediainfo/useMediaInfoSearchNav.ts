import { useState, useEffect, useCallback, type RefObject, type KeyboardEvent } from "react";
import type { CategoryKey } from "./mediaInfoTypes";

interface UseMediaInfoSearchNavOptions {
  searchQuery: string;
  activeCategory: CategoryKey;
  matchCount: number;
  bodyRef: RefObject<HTMLDivElement | null>;
  motionAllowed: boolean;
}

/**
 * Хук навигации по совпадениям поиска в отчёте MediaInfo:
 * переход вперёд/назад (кнопки и Enter / Shift+Enter) и прокрутка к активной строке.
 */
export function useMediaInfoSearchNav({
  searchQuery,
  activeCategory,
  matchCount,
  bodyRef,
  motionAllowed,
}: UseMediaInfoSearchNavOptions) {
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(0);

  // Сброс индекса при изменении поискового запроса или фильтра категории
  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchQuery, activeCategory]);

  // Безопасное ограничение индекса при пересчёте совпадений (например, при смене языка отчёта)
  useEffect(() => {
    if (matchCount === 0) {
      setActiveMatchIndex(0);
    } else if (activeMatchIndex >= matchCount) {
      setActiveMatchIndex(matchCount - 1);
    }
  }, [matchCount, activeMatchIndex]);

  const jumpMatch = useCallback(
    (delta: 1 | -1) => {
      if (matchCount <= 0) return;
      setActiveMatchIndex((prev) => (prev + delta + matchCount) % matchCount);
    },
    [matchCount]
  );

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && matchCount > 0) {
        e.preventDefault();
        jumpMatch(e.shiftKey ? -1 : 1);
      }
    },
    [matchCount, jumpMatch]
  );

  // Подсветка и плавная прокрутка к текущему активному совпадению
  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;

    const prevCurrent = container.querySelectorAll(".mediainfo-row--match-current");
    prevCurrent.forEach((el) => el.classList.remove("mediainfo-row--match-current"));

    if (!searchQuery.trim()) return;

    const matches = container.querySelectorAll<HTMLElement>(
      ".mediainfo-row--match, .mediainfo-floating-window__line--match"
    );
    if (matches.length === 0) return;

    const targetIdx = Math.min(activeMatchIndex, matches.length - 1);
    const target = matches[targetIdx];
    if (target) {
      target.classList.add("mediainfo-row--match-current");
      target.scrollIntoView({
        block: "nearest",
        behavior: motionAllowed ? "smooth" : "auto",
      });
    }
  }, [searchQuery, activeCategory, activeMatchIndex, matchCount, bodyRef, motionAllowed]);

  return {
    activeMatchIndex,
    jumpMatch,
    handleSearchKeyDown,
  };
}
