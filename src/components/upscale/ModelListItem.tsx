import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2, GripVertical } from "lucide-react";
import { ModelFileItem, UpscaleCompileProgress } from "./types";
import { ModelTensorRtAction } from "./ModelTensorRtAction";
import { ModelHotkeyButton } from "./ModelHotkeyButton";

export interface ModelListItemProps {
  /** Данные файла модели */
  model: ModelFileItem;
  /** Порядковый индекс в списке (0-indexed) */
  idx: number;
  /** Выбрана ли модель в данный момент */
  isSelected: boolean;
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
export const ModelListItem: React.FC<ModelListItemProps> = ({
  model,
  idx,
  isSelected,
  hideModelNames,
  customHotkeys,
  recordingActionId,
  supportsTensorrt,
  compilingModel,
  compileProgressItem,
  onSelect,
  onPrecompile,
  onStartRecordKey,
  onKeyRecord,
  onMouseRecord,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: model.filename });

  const actionId = `upscaleNet${idx + 1}`;
  const bindCodes = customHotkeys[actionId] || [];
  const isRecording = recordingActionId === actionId;

  const cardStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
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
    <div
      ref={setNodeRef}
      style={cardStyle}
      onClick={onSelect}
      className={`glass-tile glass-tile--clickable ${isSelected ? "glass-tile--active" : ""}`}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
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
          title="Зажмите и перетащите мышкой для изменения порядка моделей"
        >
          <GripVertical size={16} />
        </div>

        {/* Порядковый номер модели в списке */}
        <span
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            color: isSelected ? "var(--accent)" : "var(--text-muted)",
            background: isSelected
              ? "rgba(var(--accent-rgb, 127, 199, 255), 0.14)"
              : "rgba(255, 255, 255, 0.05)",
            border: `1px solid ${isSelected ? "var(--accent)" : "var(--border-subtle)"}`,
            borderRadius: 4,
            padding: "1px 6px",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
            lineHeight: 1.4,
          }}
          title={`Модель #${idx + 1}`}
        >
          #{idx + 1}
        </span>

        {/* Индикатор выбора */}
        {isSelected ? (
          <CheckCircle2 size={18} color="var(--accent)" style={{ flexShrink: 0 }} />
        ) : (
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "1px solid var(--border-pill)",
              flexShrink: 0,
              boxSizing: "border-box",
            }}
          />
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: "0.88rem",
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
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              letterSpacing: hideModelNames ? "0.15em" : "normal",
              marginTop: 1,
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
          gap: 6,
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

        <ModelHotkeyButton
          bindCodes={bindCodes}
          isRecording={isRecording}
          onStartRecordKey={onStartRecordKey}
          onKeyRecord={onKeyRecord}
          onMouseRecord={onMouseRecord}
        />
      </div>
    </div>
  );
};
