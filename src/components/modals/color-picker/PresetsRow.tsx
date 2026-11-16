import React from "react";
import { QUICK_PRESETS } from "./types";

interface PresetsRowProps {
  currentHex: string;
  onSelectPreset: (hex: string) => void;
}

/**
 * Ряд быстрых сбалансированных сватчей палитры для моментального старта калибровки.
 */
export const PresetsRow: React.FC<PresetsRowProps> = ({
  currentHex,
  onSelectPreset,
}) => {
  return (
    <div className="color-picker-presets-row" role="radiogroup" aria-label="Быстрые цвета">
      {QUICK_PRESETS.map((preset) => {
        const isSelected = currentHex.toUpperCase() === preset.toUpperCase();
        return (
          <button
            key={preset}
            type="button"
            className={`color-picker-swatch-btn ${isSelected ? "color-picker-swatch-btn--active" : ""}`}
            style={{ backgroundColor: preset }}
            onClick={() => onSelectPreset(preset)}
            title={preset}
            aria-label={`Выбрать ${preset}`}
            aria-checked={isSelected}
            role="radio"
          />
        );
      })}
    </div>
  );
};

