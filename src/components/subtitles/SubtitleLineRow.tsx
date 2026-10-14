import { memo, useCallback } from "react";
import { Copy, Check, Clock } from "lucide-react";
import { formatTime } from "../../utils/timeUtils";
import { HighlightedText } from "./HighlightedText";
import { SubtitleMetaBadges } from "./SubtitleMetaBadges";
import { SubtitleRawBlock } from "./SubtitleRawBlock";
import { useTranslation } from "../../i18n/LanguageContext";
import type {
  SubtitleLine,
  SubtitleViewMode,
  SubtitleRawFormat,
} from "./subtitleTypes";

export interface SubtitleLineRowProps {
  line: SubtitleLine;
  isActive: boolean;
  isNavTarget?: boolean;
  searchQuery: string;
  isCopied: boolean;
  viewMode?: SubtitleViewMode;
  rawFormat?: SubtitleRawFormat;
  locale?: string;
  onToggleRawFormat?: (fmt: SubtitleRawFormat) => void;
  onSeek: (line: SubtitleLine) => void;
  onCopy: (line: SubtitleLine, e: React.MouseEvent) => void;
}

/**
 * Форматирование времени с сотыми долями секунды для технического режима.
 */
function formatPrecisionTime(seconds: number): string {
  const base = formatTime(seconds);
  const frac = Math.floor((Math.abs(seconds) % 1) * 100)
    .toString()
    .padStart(2, "0");
  return `${base}.${frac}`;
}

/**
 * Мемоизированная строка субтитров.
 * В режиме "normal" отображает лаконичную карточку с текстом и таймкодами.
 * В режиме "technical" показывает панель метаданных (SubtitleMetaBadges)
 * и блок сырого кода (SubtitleRawBlock).
 */
export const SubtitleLineRow = memo(function SubtitleLineRow({
  line,
  isActive,
  isNavTarget = false,
  searchQuery,
  isCopied,
  viewMode = "normal",
  rawFormat,
  locale,
  onToggleRawFormat,
  onSeek,
  onCopy,
}: SubtitleLineRowProps) {
  const { dict } = useTranslation();
  const duration = Math.max(0, line.end - line.start);
  const isTech = viewMode === "technical";

  const handleCopyClick = useCallback(
    (e: React.MouseEvent) => onCopy(line, e),
    [line, onCopy]
  );

  return (
    <div
      onClick={() => onSeek(line)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        padding: isTech ? "8px 11px" : "7px 10px",
        background: isActive
          ? "var(--bg-active)"
          : isNavTarget
          ? "rgba(59, 130, 246, 0.12)"
          : "rgba(255, 255, 255, 0.02)",
        border: "1px solid",
        borderColor: isActive
          ? "var(--accent)"
          : isNavTarget
          ? "var(--accent)"
          : "transparent",
        boxShadow:
          isNavTarget && !isActive
            ? "0 0 10px rgba(59, 130, 246, 0.25)"
            : "none",
        borderRadius: "var(--radius-xs)",
        cursor: "pointer",
        transition:
          "background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
      }}
      className={`sub-line-row hover-bright ${
        isTech ? "sub-line-row--tech" : ""
      }`}
      >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-4)",
        }}
        >
        <div className="grow">
          {/* Строка таймингов + тех-бейджи */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              marginBottom: "var(--space-1)",
              flexWrap: "wrap",
            }}
            >
            {/* Таймкоды */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                fontSize: isTech ? "0.74rem" : "0.72rem",
                fontWeight: 600,
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
              >
              <Clock size={11} />
              <span>
                {isTech
                  ? formatPrecisionTime(line.start)
                  : formatTime(line.start)}
              </span>
              <span style={{ opacity: 0.5 }}>—</span>
              <span>
                {isTech
                  ? formatPrecisionTime(line.end)
                  : formatTime(line.end)}
              </span>
            </span>

            {duration> 0 && (
              <span
                style={{
                  fontSize: "var(--fs-2xs)",
                  color: "var(--text-muted)",
                  opacity: 0.7,
                  fontVariantNumeric: "tabular-nums",
                }}
                >
                ({duration.toFixed(isTech ? 2 : 1)}{dict.subtitlesSearch.secSuffix})
              </span>
            )}

            {isNavTarget && !isActive && (
              <span
                style={{
                  fontSize: "var(--fs-3xs)",
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: "var(--radius-xs)",
                  background: "rgba(59, 130, 246, 0.2)",
                  color: "var(--accent)",
                  border: "1px solid var(--accent)",
                }}
                >
                {dict.subtitlesSearch.matchBadge}
              </span>
            )}

            {/* Тех-бейджи (стиль, актёр, слой, шрифт, цвет...) */}
            {isTech && <SubtitleMetaBadges line={line} locale={locale} />}
          </div>

          {/* Текст реплики */}
          <div
            style={{
              fontSize: isTech ? "0.9rem" : "0.84rem",
              lineHeight: 1.35,
              color: isActive
                ? "var(--text-primary)"
                : "var(--text-secondary)",
              fontWeight: isActive ? 500 : 400,
              wordBreak: "break-word",
              whiteSpace: "pre-line",
            }}
            >
            <HighlightedText text={line.text} query={searchQuery} />
          </div>
        </div>

        {/* Кнопка копирования чистого текста */}
        <button
          type="button"
          onClick={handleCopyClick}
          style={{
            background: "transparent",
            border: "none",
            color: isCopied ? "var(--accent)" : "var(--text-muted)",
            cursor: "pointer",
            padding: "var(--space-2)",
            borderRadius: "var(--radius-xs)",
            flexShrink: 0,
            opacity: 0.7,
            transition: "opacity 0.15s ease, color 0.15s ease",
          }}
          className="hover-bright sub-line-copy-btn"
          title={dict.subtitlesSearch.copyLineText}
          >
          {isCopied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>

      {/* Блок исходного кода в техническом режиме (всегда открыт) */}
      {isTech && (
        <SubtitleRawBlock
          line={line}
          rawFormat={rawFormat}
          onToggleRawFormat={onToggleRawFormat}
        />
      )}
    </div>
  );
});
