import React from "react";
import { Keyboard } from "lucide-react";
import { getKeyDisplay } from "../../utils/hotkeyUtils";

export interface ModelHotkeyButtonProps {
  /** Коды назначенных клавиш (например, ["Shift+Digit2"]) */
  bindCodes: string[];
  /** Активен ли режим записи новой клавиши */
  isRecording: boolean;
  /** Обработчик переключения режима записи */
  onStartRecordKey: () => void;
  /** Обработчик нажатия клавиши на клавиатуре */
  onKeyRecord: (e: React.KeyboardEvent) => void;
  /** Обработчик нажатия кнопки мыши */
  onMouseRecord?: (e: React.MouseEvent) => void;
}

/**
 * Компактная кнопка назначения горячей клавиши модели в едином стиле вкладки хоткеев.
 * Выровнена по общей высоте 24px, обладает акцентным свечением при записи
 * и интуитивной индикацией статуса.
 */
export const ModelHotkeyButton: React.FC<ModelHotkeyButtonProps> = React.memo(({
  bindCodes,
  isRecording,
  onStartRecordKey,
  onKeyRecord,
  onMouseRecord,
}) => {
  const displayBind = bindCodes.length > 0 ? getKeyDisplay(bindCodes[0]) : "Назначить";

  return (
    <button
      type="button"
      tabIndex={0}
      data-hotkey-recording={isRecording ? "true" : undefined}
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
          ? "Нажмите комбинацию клавиш или кнопку мыши (Esc для отмены)"
          : "Нажмите для переназначения клавиши активации"
      }
      style={{
        height: 24,
        padding: "0 8px",
        borderRadius: "var(--radius-sm, 6px)",
        background: isRecording
          ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)"
          : "rgba(127, 199, 255, 0.08)",
        border: isRecording
          ? "1.5px solid var(--accent)"
          : "1px solid rgba(127, 199, 255, 0.2)",
        boxShadow: isRecording
          ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px var(--accent)"
          : "none",
        fontFamily: "var(--font-mono, monospace)",
        fontSize: "0.76rem",
        fontWeight: 600,
        color: isRecording ? "var(--text-primary)" : "var(--accent)",
        cursor: "pointer",
        outline: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        boxSizing: "border-box",
        lineHeight: 1,
        whiteSpace: "nowrap",
        transition: "all var(--t-fast, 0.15s) var(--ease-smooth)",
      }}
    >
      <Keyboard size={13} />
      <span>{isRecording ? "Нажмите..." : displayBind}</span>
    </button>
  );
});
