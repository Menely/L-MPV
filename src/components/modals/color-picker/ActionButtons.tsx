import React from "react";
import { Plus } from "lucide-react";

interface ActionButtonsProps {
  cancelLabel: string;
  addLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Симметричная 50/50 сетка кнопок подтверждения и отмены.
 */
export const ActionButtons: React.FC<ActionButtonsProps> = ({
  cancelLabel,
  addLabel,
  onCancel,
  onConfirm,
}) => {
  return (
    <div className="color-picker-actions-grid">
      <button
        type="button"
        onClick={onCancel}
        className="settings-action-btn settings-action-btn--secondary color-picker-action-btn"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="settings-action-btn settings-action-btn--primary color-picker-action-btn"
      >
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  );
};

