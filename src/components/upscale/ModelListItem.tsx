import React from "react";
import {
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Zap,
  Keyboard,
  X,
} from "lucide-react";
import { ModelFileItem, UpscaleCompileProgress } from "./types";
import { getKeyDisplay } from "../../utils/hotkeyUtils";

export interface ModelListItemProps {
  model: ModelFileItem;
  idx: number;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  isDragged: boolean;
  hideModelNames: boolean;
  customHotkeys: Record<string, string[]>;
  recordingActionId: string | null;
  supportsTensorrt: boolean;
  compilingModel: string | null;
  compileProgressItem?: UpscaleCompileProgress;
  onSelect: () => void;
  onMoveUp: (e: React.MouseEvent) => void;
  onMoveDown: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onPrecompile: () => void;
  onStartRecordKey: () => void;
  onKeyRecord: (e: React.KeyboardEvent) => void;
  onClearKey: (e: React.MouseEvent) => void;
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
 * Включает кнопки изменения порядка, индикатор выбора, бейджи оптимизации 1080p и бинд горячих клавиш.
 */
export const ModelListItem: React.FC<ModelListItemProps> = ({
  model,
  idx,
  isSelected,
  isFirst,
  isLast,
  isDragged,
  hideModelNames,
  customHotkeys,
  recordingActionId,
  supportsTensorrt,
  compilingModel,
  compileProgressItem,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onPrecompile,
  onStartRecordKey,
  onKeyRecord,
  onClearKey,
}) => {
  const actionId = `upscaleNet${idx + 1}`;
  const bindCodes = customHotkeys[actionId] || [];
  const isRecording = recordingActionId === actionId;
  const displayBind = bindCodes.length > 0 ? getKeyDisplay(bindCodes[0]) : "Назначить";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      className={`glass-tile glass-tile--clickable ${isSelected ? "glass-tile--active" : ""}`}
      style={{
        padding: "8px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        isolation: "isolate",
        opacity: isDragged ? 0.4 : 1,
        cursor: "grab",
        transition: "transform 0.15s ease, opacity 0.15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        {/* Кнопки перемещения позиции модели (выше / ниже) */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="btn btn--secondary"
            style={{
              padding: 0,
              width: 22,
              height: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: isFirst ? 0.25 : 0.85,
              cursor: isFirst ? "default" : "pointer",
              borderRadius: 3,
              border: "none",
              background: "rgba(255, 255, 255, 0.06)",
            }}
            disabled={isFirst}
            onClick={onMoveUp}
            title={isFirst ? "Первая в списке" : "Переместить выше"}
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            style={{
              padding: 0,
              width: 22,
              height: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: isLast ? 0.25 : 0.85,
              cursor: isLast ? "default" : "pointer",
              borderRadius: 3,
              border: "none",
              background: "rgba(255, 255, 255, 0.06)",
            }}
            disabled={isLast}
            onClick={onMoveDown}
            title={isLast ? "Последняя в списке" : "Переместить ниже"}
          >
            <ChevronDown size={12} />
          </button>
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
                    boxSizing: "border-box",
                    padding: "4px 8px",
                    borderRadius: "var(--radius-sm)",
                    background: isCompileError
                      ? "rgba(231, 76, 60, 0.08)"
                      : isCompileFinished
                      ? "rgba(46, 204, 113, 0.08)"
                      : "rgba(127, 199, 255, 0.08)",
                    border: `1px solid ${
                      isCompileError
                        ? "rgba(231, 76, 60, 0.35)"
                        : isCompileFinished
                        ? "rgba(46, 204, 113, 0.35)"
                        : "rgba(127, 199, 255, 0.3)"
                    }`,
                    userSelect: "none",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                      fontSize: "0.72rem",
                      width: "100%",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        color: isCompileError
                          ? "#e74c3c"
                          : isCompileFinished
                          ? "#2ecc71"
                          : "var(--accent)",
                        fontWeight: isCompileFinished ? 600 : 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        minWidth: 0,
                      }}
                      title={compileProgressItem?.stage || "Сборка 1080p..."}
                    >
                      {isCompileError ? (
                        <X size={11} color="#e74c3c" style={{ flexShrink: 0 }} />
                      ) : isCompileFinished ? (
                        <CheckCircle2 size={11} color="#2ecc71" style={{ flexShrink: 0 }} />
                      ) : (
                        <RefreshCw size={10} className="spin" style={{ flexShrink: 0 }} />
                      )}
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {compileProgressItem?.stage || "Сборка 1080p..."}
                      </span>
                    </span>
                    <span
                      style={{
                        color: isCompileError
                          ? "#e74c3c"
                          : isCompileFinished
                          ? "#2ecc71"
                          : "var(--accent)",
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        width: 38,
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      {isCompileError
                        ? "Ошибка"
                        : isCompileFinished
                        ? "100%"
                        : compileProgressItem
                        ? `${Math.round(compileProgressItem.percent)}%`
                        : "..."}
                    </span>
                  </div>

                  {/* Полоса прогресса */}
                  <div
                    style={{
                      width: "100%",
                      height: 3.5,
                      borderRadius: 2,
                      background: "rgba(255, 255, 255, 0.1)",
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

        <button
          type="button"
          tabIndex={0}
          onClick={onStartRecordKey}
          onKeyDown={(e) => isRecording && onKeyRecord(e)}
          title={
            isRecording
              ? "Нажмите желаемую комбинацию клавиш (Esc для отмены)"
              : "Нажмите для переназначения клавиши активации"
          }
          className={`kbd-chip ${isRecording ? "kbd-chip--recording" : ""}`}
        >
          <Keyboard size={13} />
          <span>{isRecording ? "Нажмите клавишу..." : displayBind}</span>
        </button>

        {bindCodes.length > 0 && (
          <button
            type="button"
            onClick={onClearKey}
            className="btn btn--ghost btn--icon btn--sm"
            style={{ padding: 4 }}
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
};
