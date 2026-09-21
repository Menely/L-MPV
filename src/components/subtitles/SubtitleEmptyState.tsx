/**
 * Компонент заглушек списка субтитров.
 * Отображает одно из трёх состояний:
 *   - анализ в процессе (спиннер)
 *   - субтитры не найдены / ошибка анализа (с кнопкой загрузки файла)
 *   - запрос поиска не дал результатов
 */

import { Subtitles, Loader2, FolderOpen } from "lucide-react";

interface SubtitleEmptyStateProps {
  isAnalyzing: boolean;
  analyzeError: string | null;
  searchQuery: string;
  onLoadExternal: () => void;
}

export function SubtitleEmptyState({
  isAnalyzing,
  analyzeError,
  searchQuery,
  onLoadExternal,
}: SubtitleEmptyStateProps) {
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
        <span>Анализ дорожки субтитров через FFmpeg...</span>
        <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
          Извлечение реплик и временных меток
        </span>
      </div>
    );
  }

  if (searchQuery.trim()) {
    return (
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
        {analyzeError || "Субтитры для выбранной дорожки не найдены."}
      </div>
      <div style={{ fontSize: "0.78rem", opacity: 0.8, maxWidth: "320px" }}>
        {analyzeError
          ? "Попробуйте другую дорожку или подключите внешний файл субтитров."
          : "Выберите другую дорожку субтитров в селекторе выше."}
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
        <span>Загрузить файл субтитров…</span>
      </button>
    </div>
  );
}
