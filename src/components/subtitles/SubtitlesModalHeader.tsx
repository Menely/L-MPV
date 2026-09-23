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
      className="subtitles-search-card__header--draggable"
      onMouseDown={onDragStart}
      onDoubleClick={onResetPosition}
      title={dict.subtitlesSearch.dragHeader}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "12px",
        flexShrink: 0,
        gap: 8,
      }}
    >
      {/* Иконка + заголовок */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "var(--radius-xs)",
            background:
              "linear-gradient(135deg, var(--accent, #3b82f6) 0%, rgba(59, 130, 246, 0.4) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            flexShrink: 0,
          }}
        >
          <Subtitles size={16} />
        </div>
        <div
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
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          flexShrink: 0,
        }}
      >
        {/* Переключатель режимов: Обычный / Инспектор с повышенным контрастом */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px",
            background: "rgba(0, 0, 0, 0.55)",
            borderRadius: "var(--radius-xs)",
            border: "1px solid rgba(255, 255, 255, 0.16)",
            marginRight: 4,
            gap: 2,
          }}
        >
          <button
            type="button"
            onClick={() => onToggleViewMode("normal")}
            style={{
              background:
                viewMode === "normal"
                  ? "rgba(var(--accent-rgb, 127, 199, 255), 0.25)"
                  : "transparent",
              color: viewMode === "normal" ? "#ffffff" : "var(--text-secondary)",
              border:
                viewMode === "normal"
                  ? "1px solid var(--accent)"
                  : "1px solid transparent",
              borderRadius: "calc(var(--radius-xs) - 2px)",
              padding: "4px 9px",
              fontSize: "0.75rem",
              fontWeight: viewMode === "normal" ? 600 : 500,
              cursor: "pointer",
              transition:
                "background 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
              lineHeight: 1.2,
              boxShadow:
                viewMode === "normal"
                  ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35)"
                  : "none",
            }}
            className="hover-bright"
            title={dict.subtitlesSearch.modeNormalTooltip}
          >
            {dict.subtitlesSearch.modeNormal}
          </button>
          <button
            type="button"
            onClick={() => onToggleViewMode("technical")}
            style={{
              background:
                viewMode === "technical"
                  ? "rgba(var(--accent-rgb, 127, 199, 255), 0.25)"
                  : "transparent",
              color:
                viewMode === "technical" ? "#ffffff" : "var(--text-secondary)",
              border:
                viewMode === "technical"
                  ? "1px solid var(--accent)"
                  : "1px solid transparent",
              borderRadius: "calc(var(--radius-xs) - 2px)",
              padding: "4px 9px",
              fontSize: "0.75rem",
              fontWeight: viewMode === "technical" ? 600 : 500,
              cursor: "pointer",
              transition:
                "background 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              lineHeight: 1.2,
              boxShadow:
                viewMode === "technical"
                  ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35)"
                  : "none",
            }}
            className="hover-bright"
            title={dict.subtitlesSearch.modeTechTooltip}
          >
            <SlidersHorizontal
              size={12}
              style={{
                color: viewMode === "technical" ? "var(--accent)" : "currentColor",
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
          title={dict.subtitlesSearch.close}
          aria-label={dict.subtitlesSearch.close}
          style={{ width: 28, height: 28 }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
