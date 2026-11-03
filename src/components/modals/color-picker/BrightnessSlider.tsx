import React from "react";
import { Sun } from "lucide-react";

interface BrightnessSliderProps {
  lightness: number;
  sliderMidHex: string;
  label: string;
  onChange: (lightness: number) => void;
}

/**
 * Ползунок регулировки яркости (Lightness) с цветовым градиентом спектра и процентным индикатором.
 */
export const BrightnessSlider: React.FC<BrightnessSliderProps> = ({
  lightness,
  sliderMidHex,
  label,
  onChange,
}) => {
  return (
    <div className="color-picker-brightness-wrap">
      <div className="color-picker-brightness-head">
        <span className="row-center row-gap-2">
          <Sun size={13} className="t-muted" />
          <span>{label}</span>
        </span>
        <span className="color-picker-brightness-val">{lightness}%</span>
      </div>
      <input
        type="range"
        min="5"
        max="95"
        value={lightness}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="color-picker-range"
        style={{
          background: `linear-gradient(90deg, #000000 0%, #000000 3px, ${sliderMidHex} 50%, #ffffff calc(100% - 3px), #ffffff 100%) no-repeat`,
          backgroundColor: "#000000",
        }}
      />
    </div>
  );
};

