import React from "react";
import { Keyboard } from "lucide-react";
import { getKeyDisplay } from "../../utils/hotkeyUtils";
import { useTranslation } from "../../i18n/LanguageContext";

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
  const { dict, locale } = useTranslation();
  const displayBind = bindCodes.length> 0 ? getKeyDisplay(bindCodes[0], locale) : dict.settings.upscaling.hotkeyAssign;

  return (
    <button
      type="button"
      className={`model-hotkey-btn${isRecording ? " is-recording" : ""}`}
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
          ? dict.settings.upscaling.hotkeyRecordingTip
          : dict.settings.upscaling.hotkeyChangeTip
      }
      style={{
        height: 24,
        padding: "0 8px",
        borderRadius: "var(--radius-control)",
        background: isRecording
          ? "var(--surface-accent-subtle)"
          : "var(--surface-level-3)",
        border: isRecording
          ? "1px solid var(--accent)"
          : "1px solid var(--border-subtle)",
        boxShadow: isRecording
          ? "none"
          : "none",
        fontFamily: "var(--font-mono, monospace)",
        fontSize: "var(--fs-xs)",
        fontWeight: 600,
        color: isRecording ? "var(--text-primary)" : "var(--accent-text)",
        cursor: "pointer",
        outline: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        boxSizing: "border-box",
        lineHeight: 1,
        whiteSpace: "nowrap",
        transition: "all var(--t-fast, 0.15s) var(--ease-smooth)",
      }}
      >
      <Keyboard size={13} />
      <span>{isRecording ? dict.settings.upscaling.hotkeyRecording : displayBind}</span>
    </button>
  );
});
