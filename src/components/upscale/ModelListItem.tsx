import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getActiveUiScale } from "../../theme/tokens";
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
  /** Выбрана ли модель (сохранено для обратной совместимости пропсов) */
  isSelected?: boolean;
  /** Отмечена ли модель звездочкой как избранная (по умолчанию) */
  isFavorite: boolean;
  /** Переключение звездочки избранной модели */
  onToggleFavorite: () => void;
  /** Скрывать ли детальные имена моделей */
  hideModelNames: boolean;
  /** Текущие привязки горячих клавиш */
  customHotkeys?: Record<string, string[]>;
  /** Идентификатор действия, для которого сейчас идет запись клавиши */
  recordingActionId?: string | null;
  /** Поддерживает ли видеокарта ускорение NVIDIA TensorRT */
  supportsTensorrt: boolean;
  /** Имя модели, которая сейчас компилируется */
  compilingModel: string | null;
  /** Прогресс компиляции данной модели */
  compileProgressItem?: UpscaleCompileProgress;
  /** Обработчик выбора (сохранен для обратной совместимости) */
  onSelect?: () => void;
  /** Запуск предкомпиляции под 1080p */
  onPrecompile: () => void;
  /** Переключение режима записи горячей клавиши */
  onStartRecordKey?: () => void;
  /** Запись клавиатурной комбинации */
  onKeyRecord?: (e: React.KeyboardEvent) => void;
  /** Запись кнопки мыши */
  onMouseRecord?: (e: React.MouseEvent) => void;
}

/**
 * Карточка отдельной модели нейросетевого апскейлинга в списке:
 * - Поддерживает плавное перетаскивание мышкой за ручку захвата (Grip).
 * - Компактные сгруппированные иконки слева (ручка, номер, звезда) с аккуратными отступами.
 * - Однострочное отображение названия без дублирования.
 * - Карточка статична (клик по карточке отключен, чтобы не путать пользователя мнимым выбором).
 * - Правый блок действий имеет строго фиксированную ширину 136px, исключающую гуляние кнопок.
 */
export const ModelListItem: React.FC<ModelListItemProps> = React.memo(({
  model,
  idx,
  isFavorite,
  onToggleFavorite,
  hideModelNames,
  supportsTensorrt,
  compilingModel,
  compileProgressItem,
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
    padding: "9px 12px",
    minHeight: 46,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    position: "relative",
    cursor: "default",
  };

  return (
    // Measure a stationary slot; only the card inside it is translated.
    <div ref={setNodeRef} style={{ flex: "0 0 auto", minWidth: 0, position: "relative", zIndex: isDragging ? 999 : undefined }}>
    <div
      style={cardStyle}
      className="glass-tile"
      >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        {/* Компактный блок управляющих иконок (ручка перетаскивания, номер, звезда) */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
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
              padding: "2px 0",
              touchAction: "none",
              flexShrink: 0,
              borderRadius: "var(--radius-xs, 4px)",
              transition: "opacity 0.15s ease, color 0.15s ease",
            }}
            title={dict.settings.upscaling.dragReorderTip}
            >
            <GripVertical size={16} />
          </div>

          {/* Порядковый номер модели (единый нейтральный стиль для всех карточек) */}
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
              fontSize: "var(--fs-xs)",
              fontWeight: 600,
              color: "var(--text-secondary)",
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              flexShrink: 0,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
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
              padding: 2,
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
        </div>

        {/* Название модели (в одну строку, без серого дублирования имени файла) */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: "var(--fs-base)",
              fontWeight: 500,
              color: hideModelNames ? "var(--text-muted)" : "var(--text-primary)",
              letterSpacing: hideModelNames ? "0.15em" : "normal",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              userSelect: hideModelNames ? "none" : "auto",
            }}
            >
            {hideModelNames ? "••••••••••••••••" : model.display_name}
          </div>
        </div>
      </div>

      {/* Блок унифицированных действий: стабильная фиксированная ширина 148px во всех состояниях */}
      <div
        style={{
          width: 148,
          minWidth: 148,
          maxWidth: 148,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
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
