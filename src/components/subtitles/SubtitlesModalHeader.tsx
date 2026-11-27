import { useState, useCallback } from "react";
import { Subtitles, X, SlidersHorizontal } from "lucide-react";
import { SelectionRail } from "../motion/SelectionRail";
import { EyeMorphIcon } from "../common/EyeMorphIcon";
import { RefreshMorphIcon } from "../common/RefreshMorphIcon";
import type { SubtitleViewMode } from "./subtitleTypes";
import { useTranslation } from "../../i18n/LanguageContext";

interface SubtitlesModalHeaderProps {
  viewMode: SubtitleViewMode;
  isOpaque: boolean;
  isAnalyzing: boolean;
  isCapsule?: boolean;
  onToggleViewMode: (mode: SubtitleViewMode) => void;
  onToggleOpaque: () => void;
  onReanalyze: () => void;
  onClose: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onResetPosition: (e: React.MouseEvent) => void;
}

const ACTION_BTN_SIZE_STYLE = { width: 28, height: 28 } as const;

/**
 * Шапка окна поиска по субтитрам:
 * - В стиле «Капсула» (isCapsule): 3 независимых парящих островка (иконка, переключатель, кнопки).
 * - В стилях «Модерн» и «Классический»: монолитная интегрированная шапка внутри единого окна.
 */
export function SubtitlesModalHeader({
  viewMode,
  isOpaque,
  isAnalyzing,
  isCapsule = false,
  onToggleViewMode,
  onToggleOpaque,
  onReanalyze,
  onClose,
  onDragStart,
  onResetPosition,
}: SubtitlesModalHeaderProps) {
  const { dict } = useTranslation();
  const [refreshTriggerKey, setRefreshTriggerKey] = useState(0);

  const handleRefreshClick = useCallback(() => {
    setRefreshTriggerKey((prev) => prev + 1);
    onReanalyze();
  }, [onReanalyze]);

  const opacityTooltip = isOpaque
    ? dict.subtitlesSearch.opacityEnable
    : dict.subtitlesSearch.opacityDisable;

  const renderModeButtons = () => (
    <>
      <button
        type="button"
        onClick={() => onToggleViewMode("normal")}
        className={`subtitles-search-card__mode-btn ${
          viewMode === "normal" ? "subtitles-search-card__mode-btn--active" : ""
        }`}
        aria-pressed={viewMode === "normal"}
        title={dict.subtitlesSearch.modeNormalTooltip}
      >
        {dict.subtitlesSearch.modeNormal}
      </button>
      <button
        type="button"
        onClick={() => onToggleViewMode("technical")}
        className={`subtitles-search-card__mode-btn ${
          viewMode === "technical" ? "subtitles-search-card__mode-btn--active" : ""
        }`}
        aria-pressed={viewMode === "technical"}
        title={dict.subtitlesSearch.modeTechTooltip}
      >
        <SlidersHorizontal
          size={12}
          style={{
            color: viewMode === "technical" ? "var(--accent-text)" : "currentColor",
          }}
        />
        <span>{dict.subtitlesSearch.modeTech}</span>
      </button>
    </>
  );

  const renderWindowActionButtons = () => (
    <>
      <button
        type="button"
        className="modal__close"
        onClick={onToggleOpaque}
        title={opacityTooltip}
        aria-label={opacityTooltip}
        style={{
          ...ACTION_BTN_SIZE_STYLE,
          color: isOpaque ? "var(--accent-text)" : "var(--text-secondary)",
        }}
      >
        <EyeMorphIcon off={isOpaque} size={16} />
      </button>

      <button
        type="button"
        className="modal__close"
        onClick={handleRefreshClick}
        title={dict.subtitlesSearch.rescanTrack}
        aria-label={dict.subtitlesSearch.rescanTrack}
        style={ACTION_BTN_SIZE_STYLE}
      >
        <RefreshMorphIcon
          spinning={isAnalyzing}
          triggerKey={refreshTriggerKey}
          size={16}
        />
      </button>

      <button
        type="button"
        className="modal__close"
        onClick={onClose}
        aria-label={dict.subtitlesSearch.close}
        style={ACTION_BTN_SIZE_STYLE}
      >
        <X size={16} strokeWidth={2.4} />
      </button>
    </>
  );

  if (isCapsule) {
    return (
      <div className="subtitles-capsule-row subtitles-capsule-row--header">
        <div
          className="subtitles-card subtitles-card--icon"
          onMouseDown={onDragStart}
          onDoubleClick={onResetPosition}
        >
          <Subtitles size={20} className="t-accent" />
        </div>

        <SelectionRail
          activeKey={viewMode}
          className="subtitles-card subtitles-card--mode-switch"
        >
          {renderModeButtons()}
        </SelectionRail>

        <div className="subtitles-card subtitles-card--actions">
          {renderWindowActionButtons()}
        </div>
      </div>
    );
  }

  return (
    <div
      className="subtitles-search-card__header subtitles-search-card__header--draggable"
      onMouseDown={onDragStart}
      onDoubleClick={onResetPosition}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "var(--space-6)",
        flexShrink: 0,
        gap: "var(--space-4)",
      }}
    >
      <div
        className="subtitles-search-card__header-left"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          minWidth: 0,
        }}
      >
        <Subtitles size={18} className="t-accent" style={{ flexShrink: 0 }} />
        <div
          className="subtitles-search-card__header-title"
          style={{
            fontSize: "var(--fs-lg)",
            fontWeight: 600,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {dict.subtitlesSearch.title}
        </div>
      </div>

      <div
        className="subtitles-search-card__header-actions"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          flexShrink: 0,
        }}
      >
        <SelectionRail
          activeKey={viewMode}
          className="subtitles-search-card__mode-switch"
        >
          {renderModeButtons()}
        </SelectionRail>
        {renderWindowActionButtons()}
      </div>
    </div>
  );
}
