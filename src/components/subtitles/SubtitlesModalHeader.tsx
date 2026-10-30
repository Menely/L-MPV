/**
 * Шапка окна поиска по субтитрам.
 * Содержит: иконку с заголовком, переключатель режима (Обычный/Инспектор),
 * кнопку прозрачности (Eye/EyeOff), кнопку пересканирования и кнопку закрытия.
 * Поддерживает drag за шапку и сброс позиции по двойному клику.
 */

import {
  Subtitles,
  RefreshCw,
  Eye,
  EyeOff,
  X,
  SlidersHorizontal,
} from "lucide-react";
import type { SubtitleViewMode } from "./subtitleTypes";
import { useTranslation } from "../../i18n/LanguageContext";

interface SubtitlesModalHeaderProps {
  viewMode: SubtitleViewMode;
  isOpaque: boolean;
  isAnalyzing: boolean;
  onToggleViewMode: (mode: SubtitleViewMode) => void;
  onToggleOpaque: () => void;
  onReanalyze: () => void;
  onClose: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onResetPosition: (e: React.MouseEvent) => void;
}

export function SubtitlesModalHeader({
  viewMode,
  isOpaque,
  isAnalyzing,
  onToggleViewMode,
  onToggleOpaque,
  onReanalyze,
  onClose,
  onDragStart,
  onResetPosition,
}: SubtitlesModalHeaderProps) {
  const { dict } = useTranslation();

  return (
    <div
      className="subtitles-search-card__header subtitles-search-card__header--draggable"
      onMouseDown={onDragStart}
      onDoubleClick={onResetPosition}
      title={dict.subtitlesSearch.dragHeader}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "var(--space-6)",
        flexShrink: 0,
        gap: "var(--space-4)",
      }}
      >
      {/* Иконка + заголовок */}
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

      {/* Кнопки управления */}
      <div
        className="subtitles-search-card__header-actions"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          flexShrink: 0,
        }}
        >
        {/* Переключатель режимов: Обычный / Инспектор с повышенным контрастом */}
        <div className="subtitles-search-card__mode-switch">
          <button
            type="button"
            onClick={() => onToggleViewMode("normal")}
            className={`subtitles-search-card__mode-btn ${
              viewMode === "normal"
                ? "subtitles-search-card__mode-btn--active"
                : ""
            }`}
            title={dict.subtitlesSearch.modeNormalTooltip}
            >
            {dict.subtitlesSearch.modeNormal}
          </button>
          <button
            type="button"
            onClick={() => onToggleViewMode("technical")}
            className={`subtitles-search-card__mode-btn ${
              viewMode === "technical"
                ? "subtitles-search-card__mode-btn--active"
                : ""
            }`}
            title={dict.subtitlesSearch.modeTechTooltip}
            >
            <SlidersHorizontal
              size={12}
              style={{
                color:
                  viewMode === "technical" ? "var(--accent)" : "currentColor",
              }}
            />
            <span>{dict.subtitlesSearch.modeTech}</span>
          </button>
        </div>

        {/* Непрозрачность */}
        <button
          className="modal__close"
          onClick={onToggleOpaque}
          title={
            isOpaque
              ? dict.subtitlesSearch.opacityEnable
              : dict.subtitlesSearch.opacityDisable
          }
          aria-label={
            isOpaque
              ? dict.subtitlesSearch.opacityEnable
              : dict.subtitlesSearch.opacityDisable
          }
          style={{
            width: 28,
            height: 28,
            color: isOpaque ? "var(--accent)" : "var(--text-secondary)",
          }}
          >
          {isOpaque ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>

        {/* Пересканировать */}
        <button
          className="modal__close"
          onClick={onReanalyze}
          title={dict.subtitlesSearch.rescanTrack}
          aria-label={dict.subtitlesSearch.rescanTrack}
          style={{ width: 28, height: 28 }}
          >
          <RefreshCw
            size={14}
            className={isAnalyzing ? "spin-animation" : ""}
          />
        </button>

        {/* Закрыть */}
        <button
          className="modal__close"
          onClick={onClose}

          aria-label={dict.subtitlesSearch.close}
          style={{ width: 28, height: 28 }}
          >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
