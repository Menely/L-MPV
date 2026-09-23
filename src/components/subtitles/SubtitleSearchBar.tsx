/**
 * Панель поиска по субтитрам.
 * Включает: поле ввода с иконкой, кнопки навигации по совпадениям
 * (ChevronUp / ChevronDown), кнопку сброса запроса, строку метаинфо
 * (кол-во совпадений / всего строк, счётчик позиции) и регуляторы
 * сдвига таймингов (sub-delay ±0.1 с / ±0.5 с с Shift).
 */

import { Search, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "../../i18n/LanguageContext";

interface SubtitleSearchBarProps {
  searchQuery: string;
  totalLines: number;
  filteredCount: number;
  navAnchor: number | null;
  navPos: number;
  analyzedTrackTitle: string;
  subDelay: number;
  isAnalyzing: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (query: string) => void;
  onSearchKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onJumpPrev: () => void;
  onJumpNext: () => void;
  onClearSearch: () => void;
  onStepDelay: (step: number, shift: boolean) => void;
}

export function SubtitleSearchBar({
  searchQuery,
  totalLines,
  filteredCount,
  navAnchor,
  navPos,
  analyzedTrackTitle,
  subDelay,
  isAnalyzing,
  inputRef,
  onSearchChange,
  onSearchKeyDown,
  onJumpPrev,
  onJumpNext,
  onClearSearch,
  onStepDelay,
}: SubtitleSearchBarProps) {
  const { dict } = useTranslation();
  const hasResults = filteredCount > 0 && searchQuery.trim();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        marginBottom: "10px",
        flexShrink: 0,
      }}
    >
      {/* Строка ввода */}
      <div
        style={{ position: "relative", display: "flex", alignItems: "center" }}
      >
        <Search
          size={15}
          style={{
            position: "absolute",
            left: 10,
            color: "var(--text-muted)",
            pointerEvents: "none",
          }}
        />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={dict.subtitlesSearch.searchPlaceholder}
          title={dict.subtitlesSearch.searchEnterHint}
          style={{
            width: "100%",
            padding: hasResults
              ? "8px 76px 8px 32px"
              : "8px 32px 8px 32px",
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid var(--border-pill)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: "0.84rem",
            outline: "none",
            transition: "border-color 0.15s ease",
          }}
        />

        {/* Кнопки навигации по совпадениям */}
        {hasResults && (
          <div
            style={{
              position: "absolute",
              right: searchQuery ? 30 : 8,
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <button
              type="button"
              onClick={onJumpPrev}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 2,
                borderRadius: "var(--radius-xs)",
              }}
              className="hover-bright"
              title={dict.subtitlesSearch.prevMatch}
              aria-label={dict.subtitlesSearch.prevMatch}
            >
              <ChevronUp size={13} />
            </button>
            <button
              type="button"
              onClick={onJumpNext}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 2,
                borderRadius: "var(--radius-xs)",
              }}
              className="hover-bright"
              title={dict.subtitlesSearch.nextMatch}
              aria-label={dict.subtitlesSearch.nextMatch}
            >
              <ChevronDown size={13} />
            </button>
          </div>
        )}

        {/* Кнопка сброса запроса */}
        {searchQuery && (
          <button
            type="button"
            onClick={onClearSearch}
            style={{
              position: "absolute",
              right: 8,
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 2,
            }}
            className="hover-bright"
            title={dict.subtitlesSearch.clearSearch}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Строка метаинформации */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.75rem",
          color: "var(--text-secondary)",
          padding: "0 2px",
        }}
      >
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {searchQuery.trim() ? (
            <span>
              {dict.subtitlesSearch.foundCount(filteredCount, totalLines)}
              {navAnchor !== null && filteredCount > 0 && (
                <span style={{ opacity: 0.7 }}>
                  {" "}
                  · {navPos + 1}/{filteredCount}
                </span>
              )}
            </span>
          ) : (
            <span>
              {dict.subtitlesSearch.totalCount(totalLines)}
              {analyzedTrackTitle && (
                <span style={{ opacity: 0.7, marginLeft: 5 }}>
                  ({analyzedTrackTitle})
                </span>
              )}
            </span>
          )}
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {/* Регуляторы сдвига таймингов */}
          <div
            style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
            title={dict.subtitlesSearch.delayTooltip}
          >
            <button
              type="button"
              onClick={(e) => onStepDelay(-0.1, e.shiftKey)}
              className="hover-bright"
              title={dict.subtitlesSearch.delayEarlier}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: "var(--radius-xs)",
                fontSize: "0.78rem",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              −
            </button>
            <span
              style={{
                fontSize: "0.72rem",
                color: "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
                minWidth: 44,
                textAlign: "center",
              }}
            >
              {subDelay > 0 ? "+" : ""}
              {subDelay.toFixed(1)}{dict.subtitlesSearch.secSuffix}
            </span>
            <button
              type="button"
              onClick={(e) => onStepDelay(0.1, e.shiftKey)}
              className="hover-bright"
              title={dict.subtitlesSearch.delayLater}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: "var(--radius-xs)",
                fontSize: "0.78rem",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              +
            </button>
          </div>

          {/* Индикатор анализа */}
          {isAnalyzing && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: "0.72rem",
                color: "var(--accent)",
              }}
            >
              <Loader2 size={11} className="spin-animation" />
              <span>{dict.subtitlesSearch.analyzing}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
