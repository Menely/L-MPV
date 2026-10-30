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
  totalWords?: number;
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
  totalWords,
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
  const hasResults = filteredCount> 0 && searchQuery.trim();

  return (
    <div
      className="subtitles-search-card__bar"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        marginBottom: "var(--space-5)",
        flexShrink: 0,
      }}
      >
      {/* Строка ввода */}
      <div
        className="sub-search-input-wrapper subtitles-search-card__search-input-wrap"
        style={{ position: "relative", display: "flex", alignItems: "center" }}
        >
        <Search
          size={15}
          style={{
            position: "absolute",
            left: "var(--space-5)",
            color: "var(--text-muted)",
            pointerEvents: "none",
          }}
        />
        <input
          ref={inputRef}
          className="subtitles-search-card__search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={dict.subtitlesSearch.searchPlaceholder}
          aria-label={dict.subtitlesSearch.searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
          title={dict.subtitlesSearch.searchEnterHint}
          style={{
            width: "100%",
            padding: `8px ${hasResults && searchQuery ? "96px" : searchQuery ? "40px" : "14px"} 8px 32px`,
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid var(--border-pill)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: "var(--fs-sm)",
            outline: "none",
            transition: "border-color 0.15s ease",
          }}
        />

        {/* Кнопки действий поиска: навигация и очистка в едином flex-контейнере */}
        {(hasResults || searchQuery) && (
          <div
            className="subtitles-search-card__actions"
            style={{
              position: "absolute",
              right: 6,
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            {hasResults && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0,
                }}
              >
                <button
                  type="button"
                  onClick={onJumpPrev}
                  className="subtitles-search-card__jump-btn hover-bright"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 26,
                    minHeight: 26,
                    padding: 0,
                    borderRadius: "var(--radius-xs)",
                  }}
                  title={dict.subtitlesSearch.prevMatch}
                  aria-label={dict.subtitlesSearch.prevMatch}
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={onJumpNext}
                  className="subtitles-search-card__jump-btn hover-bright"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 26,
                    minHeight: 26,
                    padding: 0,
                    borderRadius: "var(--radius-xs)",
                  }}
                  title={dict.subtitlesSearch.nextMatch}
                  aria-label={dict.subtitlesSearch.nextMatch}
                >
                  <ChevronDown size={13} />
                </button>
              </div>
            )}

            {searchQuery && (
              <button
                type="button"
                onClick={onClearSearch}
                className="subtitles-search-card__clear-btn hover-bright"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 26,
                  minHeight: 26,
                  padding: 0,
                  borderRadius: "var(--radius-xs)",
                }}
                aria-label={dict.subtitlesSearch.clearSearch}
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Строка метаинформации */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "var(--fs-xs)",
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
              {navAnchor !== null && filteredCount> 0 && (
                <span style={{ opacity: 0.7 }}>
                  {" "}
                  · {navPos + 1}/{filteredCount}
                </span>
              )}
            </span>
          ) : (
            <span>
              {dict.subtitlesSearch.totalCount(totalLines)}
              {totalWords ? dict.subtitlesSearch.totalWordsSuffix(totalWords) : ""}
              {analyzedTrackTitle && (
                <span style={{ opacity: 0.7, marginLeft: "var(--space-2)" }}>
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
            gap: "var(--space-4)",
            flexShrink: 0,
          }}
          >
          {/* Регуляторы сдвига таймингов */}
          <div
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}
            title={dict.subtitlesSearch.delayTooltip}
            >
            <button
              type="button"
              onClick={(e) => onStepDelay(-0.1, e.shiftKey)}
              className="subtitles-search-card__delay-btn hover-bright"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 28,
                minHeight: 26,
                padding: "2px 4px",
                borderRadius: "var(--radius-xs)",
                fontSize: "var(--fs-xs)",
                fontWeight: 700,
                lineHeight: 1,
              }}
              >
              −
            </button>
            <span
              style={{
                fontSize: "var(--fs-xs)",
                color: "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
                minWidth: 44,
                textAlign: "center",
              }}
              >
              {subDelay> 0 ? "+" : ""}
              {subDelay.toFixed(1)}{dict.subtitlesSearch.secSuffix}
            </span>
            <button
              type="button"
              onClick={(e) => onStepDelay(0.1, e.shiftKey)}
              className="subtitles-search-card__delay-btn hover-bright"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 28,
                minHeight: 26,
                padding: "2px 4px",
                borderRadius: "var(--radius-xs)",
                fontSize: "var(--fs-xs)",
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
                gap: "var(--space-2)",
                fontSize: "var(--fs-xs)",
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
