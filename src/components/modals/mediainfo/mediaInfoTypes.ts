import { ParsedMediaInfoSection, ParsedMediaInfoRow } from "../../../utils/mediaInfoParser";

export type CategoryKey = "all" | "general" | "video" | "audio" | "text" | "menu" | "other";

export interface MediaInfoCategoryTab {
  key: CategoryKey;
  label: string;
  count: number;
}

export interface ProcessedMediaInfoRow extends ParsedMediaInfoRow {
  isMatch?: boolean;
}

export interface MediaInfoProcessedSection extends Omit<ParsedMediaInfoSection, "rows"> {
  rows: ProcessedMediaInfoRow[];
  hasMatches: boolean;
  matchesCount: number;
}

/**
 * Определение ключа категории по названию секции отчёта MediaInfo.
 */
export function getSectionCategoryKey(title: string): CategoryKey {
  const t = title.toLowerCase();
  if (t.startsWith("общ") || t.startsWith("general")) return "general";
  if (t.startsWith("вид") || t.startsWith("video")) return "video";
  if (t.startsWith("ауд") || t.startsWith("audio")) return "audio";
  if (t.startsWith("текст") || t.startsWith("text") || t.startsWith("субт") || t.startsWith("sub")) return "text";
  if (t.startsWith("меню") || t.startsWith("menu") || t.startsWith("глав") || t.startsWith("chap")) return "menu";
  return "other";
}

/**
 * Построение списка доступных интерактивных чипов-вкладок (только для присутствующих категорий).
 */
export function buildCategoryTabs(
  sections: ParsedMediaInfoSection[],
  useRussian: boolean
): MediaInfoCategoryTab[] {
  if (sections.length === 0) return [];

  const counts: Record<CategoryKey, number> = {
    all: sections.length,
    general: 0,
    video: 0,
    audio: 0,
    text: 0,
    menu: 0,
    other: 0,
  };

  for (const sec of sections) {
    const cat = getSectionCategoryKey(sec.title);
    counts[cat] = (counts[cat] || 0) + 1;
  }

  const tabs: MediaInfoCategoryTab[] = [
    { key: "all", label: useRussian ? "Все" : "All", count: sections.length },
  ];

  if (counts.general > 0) {
    tabs.push({ key: "general", label: useRussian ? "Общее" : "General", count: counts.general });
  }
  if (counts.video > 0) {
    tabs.push({ key: "video", label: useRussian ? "Видео" : "Video", count: counts.video });
  }
  if (counts.audio > 0) {
    tabs.push({ key: "audio", label: useRussian ? "Аудио" : "Audio", count: counts.audio });
  }
  if (counts.text > 0) {
    tabs.push({ key: "text", label: useRussian ? "Субтитры" : "Subtitles", count: counts.text });
  }
  if (counts.menu > 0) {
    tabs.push({ key: "menu", label: useRussian ? "Главы" : "Chapters", count: counts.menu });
  }
  if (counts.other > 0) {
    tabs.push({ key: "other", label: useRussian ? "Другое" : "Other", count: counts.other });
  }

  return tabs;
}

/**
 * Фильтрация секций по активной категории и поисковому запросу с подсветкой совпадений.
 */
export function filterAndProcessSections(
  sections: ParsedMediaInfoSection[],
  activeCategory: CategoryKey,
  searchQuery: string
): MediaInfoProcessedSection[] {
  // 1. Фильтрация по активной категории
  const filtered = activeCategory === "all"
    ? sections
    : sections.filter((sec) => getSectionCategoryKey(sec.title) === activeCategory);

  const q = searchQuery.trim().toLowerCase();

  // 2. Если поисковый запрос пуст — возвращаем секции без подсветки
  if (!q) {
    return filtered.map((sec) => ({
      ...sec,
      rows: sec.rows.map((r: ParsedMediaInfoRow): ProcessedMediaInfoRow => ({ ...r, isMatch: false })),
      hasMatches: false,
      matchesCount: 0,
    }));
  }

  // 3. Подсветка совпадений в ключах и значениях
  return filtered.map((sec) => {
    let matches = 0;
    const rows: ProcessedMediaInfoRow[] = sec.rows.map((r: ParsedMediaInfoRow): ProcessedMediaInfoRow => {
      const isMatch =
        (!!r.key && r.key.toLowerCase().includes(q)) ||
        (!!r.value && r.value.toLowerCase().includes(q));
      if (isMatch) matches++;
      return { ...r, isMatch };
    });

    return {
      ...sec,
      rows,
      hasMatches: matches > 0,
      matchesCount: matches,
    };
  });
}
