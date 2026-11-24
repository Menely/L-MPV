import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getActiveUiScale } from "../../utils/uiThemeUtils";
import { toLocalDragTransform } from "../../utils/dndCoordinates";
import { GripVertical, Star } from "lucide-react";
import { ModelFileItem, UpscaleCompileProgress } from "./types";
import { ModelTensorRtAction } from "./ModelTensorRtAction";
import { useTranslation } from "../../i18n/LanguageContext";

export interface ModelListItemProps {
  /** Данные файла модели */
  model: ModelFileItem;
  /** Порядковый индекс в списке (0-indexed) */
  idx: number;
  /** Выбрана ли модель в данный момент */
  isSelected: boolean;
  /** Отмечена ли модель звездочкой как избранная (по умолчанию) */
  isFavorite: boolean;
  /** Переключение звездочки избранной модели */
  onToggleFavorite: () => void;
  /** Скрывать ли детальные имена моделей */
  hideModelNames: boolean;
  /** Текущие привязки горячих клавиш */
  customHotkeys: Record<string, string[]>;
  /** Идентификатор действия, для которого сейчас идет запись клавиши */
  recordingActionId: string | null;
  /** Поддерживает ли видеокарта ускорение NVIDIA TensorRT */
  supportsTensorrt: boolean;
  /** Имя модели, которая сейчас компилируется */
  compilingModel: string | null;
  /** Прогресс компиляции данной модели */
  compileProgressItem?: UpscaleCompileProgress;
  /** Выбор модели */
  onSelect: () => void;
  /** Запуск предкомпиляции под 1080p */
  onPrecompile: () => void;
  /** Переключение режима записи горячей клавиши */
  onStartRecordKey: () => void;
  /** Запись клавиатурной комбинации */
  onKeyRecord: (e: React.KeyboardEvent) => void;
  /** Запись кнопки мыши */
  onMouseRecord?: (e: React.MouseEvent) => void;
}

/**
 * Безопасное форматирование размера файлов в байтах
 */
function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Карточка отдельной модели нейросетевого апскейлинга в списке.
 * Поддерживает плавное перетаскивание мышкой за ручку захвата (Grip),
 * индикатор активного выбора, предкомпиляцию 1080p для TensorRT
 * и унифицированные компактные кнопки управления единой высоты (24px).
 */
export const ModelListItem: React.FC<ModelListItemProps> = React.memo(({
  model,
  idx,
  isSelected,
  isFavorite,
  onToggleFavorite,
  hideModelNames,
  supportsTensorrt,
  compilingModel,
  compileProgressItem,
  onSelect,
  onPrecompile,
}) => {
  const { dict } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: model.filename, disabled: !!compilingModel });

  const cardStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(toLocalDragTransform(transform, getActiveUiScale())),
    transition,
    zIndex: isDragging ? 999 : undefined,
    padding: "8px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    position: "relative",
    cursor: "pointer",
  };

  return (
    // Measure a stationary slot; only the card inside it is translated.
    <div ref={setNodeRef} style={{ flex: "0 0 auto", minWidth: 0, position: "relative", zIndex: isDragging ? 999 : undefined }}>
    <div
      style={cardStyle}
      onClick={onSelect}
      className="glass-tile glass-tile--clickable"
      >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flex: 1, minWidth: 0 }}>
        {/* Ручка захвата для перетаскивания мышкой */}
        <div
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="hover-bright"
          style={{
            cursor: isDragging ? "grabbing" : "grab",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            opacity: 0.6,
            padding: "4px 2px",
            touchAction: "none",
            flexShrink: 0,
            borderRadius: "var(--radius-xs, 4px)",
            transition: "opacity 0.15s ease, color 0.15s ease",
          }}
          title={dict.settings.upscaling.dragReorderTip}
          >
          <GripVertical size={16} />
        </div>

        {/* Порядковый номер модели в стиле плейлиста */}
        <div
          style={{
            width: 22,
            minWidth: 22,
            height: 22,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: isSelected ? 11 : "var(--fs-xs)",
            fontWeight: isSelected ? 700 : 600,
            color: isSelected ? "var(--on-accent, #000)" : "var(--text-secondary)",
            background: isSelected ? "var(--accent)" : "rgba(255, 255, 255, 0.06)",
            border: isSelected ? "none" : "1px solid rgba(255, 255, 255, 0.08)",
            flexShrink: 0,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            transition: "background-color var(--t-fast) var(--ease-smooth), color var(--t-fast) var(--ease-smooth)",
          }}
          title={dict.settings.upscaling.modelNumberTip(idx + 1)}
          >
          {idx + 1}
        </div>

        {/* Звездочка избранной модели: контур по умолчанию, золотая при выборе */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="hover-bright"
          title={isFavorite ? dict.settings.upscaling.favoriteUnsetTitle : dict.settings.upscaling.favoriteSetTitle}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? dict.settings.upscaling.favoriteUnsetTitle : dict.settings.upscaling.favoriteSetTitle}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
            margin: 0,
            background: "transparent",
            border: "none",
            borderRadius: "var(--radius-xs, 4px)",
            cursor: "pointer",
            flexShrink: 0,
            color: isFavorite ? "var(--warning-text)" : "var(--text-muted)",
            opacity: isFavorite ? 1 : 0.6,
            transition: "opacity 0.15s ease, color 0.15s ease",
          }}
          >
          <Star
            size={16}
            fill={isFavorite ? "currentColor" : "none"}
            strokeWidth={isFavorite ? 0 : 1.8}
          />
        </button>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: "var(--fs-base)",
              fontWeight: isSelected ? 600 : 500,
              color: isSelected ? "#ffffff" : hideModelNames ? "var(--text-muted)" : "var(--text-primary)",
              letterSpacing: hideModelNames ? "0.15em" : "normal",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              userSelect: hideModelNames ? "none" : "auto",
            }}
            >
            {hideModelNames ? "••••••••••••••••" : model.display_name}
          </div>
          <div
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              letterSpacing: hideModelNames ? "0.15em" : "normal",
              marginTop: "var(--space-0)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              userSelect: hideModelNames ? "none" : "auto",
            }}
            >
            {hideModelNames
              ? "••••••••••••••••••••"
              : `${model.filename} (${formatFileSize(model.size_bytes)})`}
          </div>
        </div>
      </div>

      {/* Блок унифицированных действий: TensorRT статус/кнопка + горячая клавиша */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
        >
        <ModelTensorRtAction
          model={model}
          supportsTensorrt={supportsTensorrt}
          compilingModel={compilingModel}
          compileProgressItem={compileProgressItem}
          onPrecompile={onPrecompile}
        />


      </div>
    </div>
    </div>
  );
});
