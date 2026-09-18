import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircle2,
  GripVertical,
  RefreshCw,
  Zap,
  Keyboard,
} from "lucide-react";
import { ModelFileItem, UpscaleCompileProgress } from "./types";
import { getKeyDisplay } from "../../utils/hotkeyUtils";

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
 * и быструю смену горячей клавиши в стиле вкладки хоткеев.
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
  const displayBind = bindCodes.length > 0 ? getKeyDisplay(bindCodes[0]) : "Назначить";

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
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
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

      {/* Блок предкомпиляции 1080p для NVIDIA TensorRT и кнопка горячей клавиши */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {supportsTensorrt &&
          (() => {
            const isCompiling =
              compilingModel === model.filename || compileProgressItem !== undefined;
            const isCompileFinished = !!(
              compileProgressItem &&
              compileProgressItem.is_finished &&
              !compileProgressItem.error
            );
            const isCompileError = !!(compileProgressItem && compileProgressItem.error);

            if (isCompiling) {
              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    width: 175,
                    minWidth: 175,
                    maxWidth: 175,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "0.72rem",
                      color: isCompileError
                        ? "#e74c3c"
                        : isCompileFinished
                        ? "#2ecc71"
                        : "var(--accent)",
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 120,
                      }}
                    >
                      {compileProgressItem?.stage || "Компиляция..."}
                    </span>
                    <span>
                      {isCompileError
                        ? "Ошибка"
                        : isCompileFinished
                        ? "100%"
                        : `${compileProgressItem?.percent || 0}%`}
                    </span>
                  </div>

                  <div
                    style={{
                      width: "100%",
                      height: 4,
                      background: "rgba(255, 255, 255, 0.1)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: isCompileError
                          ? "100%"
                          : isCompileFinished
                          ? "100%"
                          : `${compileProgressItem?.percent || 8}%`,
                        height: "100%",
                        background: isCompileError
                          ? "#e74c3c"
                          : isCompileFinished
                          ? "linear-gradient(90deg, #27ae60, #2ecc71)"
                          : "linear-gradient(90deg, #3498db, var(--accent), #2ecc71)",
                        borderRadius: 2,
                        transition: "width 0.25s ease-out",
                        boxShadow: isCompileFinished
                          ? "0 0 6px rgba(46, 204, 113, 0.4)"
                          : "0 0 6px rgba(127, 199, 255, 0.4)",
                      }}
                    />
                  </div>
                </div>
              );
            }

            if (model.has_engine_1080p) {
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    className="badge badge--success"
                    title="Движок TensorRT (.engine) уже скомпилирован под разрешение 1080p — включение будет мгновенным"
                  >
                    <CheckCircle2 size={13} />
                    1080p готов
                  </span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--icon btn--sm"
                    onClick={onPrecompile}
                    disabled={!!compilingModel}
                    title="Перекомпилировать движок TensorRT под 1080p"
                  >
                    <RefreshCw size={11} />
                  </button>
                </div>
              );
            }

            return (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={onPrecompile}
                disabled={!!compilingModel}
                title="Скомпилировать TensorRT движок под 1080p заранее, чтобы при первом запуске не было пауз"
              >
                <Zap size={12} color="var(--accent)" />
                1080p сборка
              </button>
            );
          })()}

        {/* Кнопка горячей клавиши: в стиле вкладки хоткеев без лишних крестиков */}
        <button
          type="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onStartRecordKey();
          }}
          onKeyDown={(e) => {
            if (isRecording) {
              onKeyRecord(e);
            }
          }}
          onMouseDown={(e) => {
            if (isRecording && onMouseRecord) {
              onMouseRecord(e);
            }
          }}
          onContextMenu={(e) => {
            if (isRecording) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          title={
            isRecording
              ? "Нажмите желаемую комбинацию клавиш или кнопку мыши (Esc для отмены)"
              : "Нажмите для переназначения клавиши активации"
          }
          style={{
            padding: "4px 10px",
            background: isRecording
              ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)"
              : "rgba(127, 199, 255, 0.08)",
            border: isRecording
              ? "1.5px solid var(--accent)"
              : "1px solid rgba(127, 199, 255, 0.2)",
            boxShadow: isRecording
              ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px var(--accent)"
              : "none",
            borderRadius: "var(--radius-sm)",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.82rem",
            fontWeight: 600,
            color: isRecording ? "var(--text-primary)" : "var(--accent)",
            cursor: "pointer",
            outline: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            transition: "all var(--t-fast, 0.15s) var(--ease-smooth)",
          }}
        >
          <Keyboard size={13} />
          <span>{isRecording ? "Нажмите..." : displayBind}</span>
        </button>
      </div>
    </div>
  );
};
