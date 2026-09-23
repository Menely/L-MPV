/**
 * Компонент заглушек списка субтитров.
 * Отображает одно из трёх состояний:
 *   - анализ в процессе (спиннер)
 *   - субтитры не найдены / ошибка анализа (с кнопкой загрузки файла)
 *   - запрос поиска не дал результатов
 */

import { Subtitles, Loader2, FolderOpen } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";

interface SubtitleEmptyStateProps {
  isAnalyzing: boolean;
  /**
   * true когда `lines.length === 0` — данных нет вообще (ошибка / не
   * проанализировано). false когда строки есть, но фильтр не дал
   * совпадений. Это разграничение важно для правильного приоритета:
   * при отсутствии строк показываем ошибку, а не «ничего не найдено».
   */
  isLinesEmpty: boolean;
  analyzeError: string | null;
  searchQuery: string;
  onLoadExternal: () => void;
}

export function SubtitleEmptyState({
  isAnalyzing,
  isLinesEmpty,
  analyzeError,
  searchQuery,
  onLoadExternal,
}: SubtitleEmptyStateProps) {
  const { dict } = useTranslation();

  if (isAnalyzing) {
    return (
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
        <Loader2
          size={26}
          className="spin-animation"
          style={{ color: "var(--accent)" }}
        />
        <span>{dict.subtitlesSearch.loadingTitle}</span>
        <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
          {dict.subtitlesSearch.loadingSubtitle}
        </span>
      </div>
    );
  }

  // «Ничего не найдено по запросу» — только если строки ЕСТЬ, но фильтр пуст.
  // Если строки отсутствуют вообще (ошибка / нет данных), показываем ошибку
  // независимо от содержимого строки поиска.
  if (!isLinesEmpty && searchQuery.trim()) {
    return (
      <div
        style={{
          color: "var(--text-muted)",
          fontSize: "0.85rem",
          textAlign: "center",
          padding: "40px 16px",
        }}
      >
        {dict.subtitlesSearch.noResults(searchQuery)}
      </div>
    );
  }

  return (
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
      <div>
        {analyzeError || dict.subtitlesSearch.notFound}
      </div>
      <div style={{ fontSize: "0.78rem", opacity: 0.8, maxWidth: "320px" }}>
        {analyzeError
          ? dict.subtitlesSearch.tryOtherOrExternal
          : dict.subtitlesSearch.selectOtherTrack}
      </div>
      <button
        type="button"
        onClick={onLoadExternal}
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
        <span>{dict.subtitlesSearch.loadExternalFile}</span>
      </button>
    </div>
  );
}
