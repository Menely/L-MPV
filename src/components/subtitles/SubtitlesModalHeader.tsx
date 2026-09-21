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
  return (
    <div
      className="subtitles-search-card__header--draggable"
      onMouseDown={onDragStart}
      onDoubleClick={onResetPosition}
      title="Потяните за шапку для перемещения окна вбок (двойной клик — привязать к правому краю)"
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
          Поиск по субтитрам
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
        {/* Переключатель режимов: Обычный / Инспектор */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px",
            background: "rgba(0, 0, 0, 0.35)",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--border-pill)",
            marginRight: 4,
          }}
        >
          <button
            type="button"
            onClick={() => onToggleViewMode("normal")}
            style={{
              background:
                viewMode === "normal" ? "var(--accent)" : "transparent",
              color: viewMode === "normal" ? "#fff" : "var(--text-muted)",
              border: "none",
              borderRadius: "calc(var(--radius-xs) - 2px)",
              padding: "3px 7px",
              fontSize: "0.72rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s ease, color 0.15s ease",
              lineHeight: 1.2,
            }}
            title="Обычный режим: текст реплик и таймкоды"
          >
            Обычный
          </button>
          <button
            type="button"
            onClick={() => onToggleViewMode("technical")}
            style={{
              background:
                viewMode === "technical"
                  ? "var(--accent)"
                  : "transparent",
              color:
                viewMode === "technical" ? "#fff" : "var(--text-muted)",
              border: "none",
              borderRadius: "calc(var(--radius-xs) - 2px)",
              padding: "3px 7px",
              fontSize: "0.72rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s ease, color 0.15s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              lineHeight: 1.2,
            }}
            title="Технический инспектор: стили, шрифты, кегли, цвета, слои, позиционирование и сырой код"
          >
            <SlidersHorizontal size={11} />
            <span>Инспектор</span>
          </button>
        </div>

        {/* Непрозрачность */}
        <button
          className="modal__close"
          onClick={onToggleOpaque}
          title={
            isOpaque
              ? "Включить прозрачность окна субтитров"
              : "Убрать прозрачность окна субтитров (сплошной фон)"
          }
          aria-label={
            isOpaque
              ? "Включить прозрачность окна субтитров"
              : "Убрать прозрачность окна субтитров"
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
          title="Пересканировать дорожку"
          aria-label="Пересканировать дорожку"
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
          title="Закрыть (Esc)"
          aria-label="Закрыть"
          style={{ width: 28, height: 28 }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
