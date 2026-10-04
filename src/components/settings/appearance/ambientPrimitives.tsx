import { useState, useRef, memo, useCallback } from "react";
import { RotateCcw } from "lucide-react";
import { optionCardStyle, optionResetBtnStyle } from "../components/optionCardStyles";

export interface VerticalSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  ariaLabel?: string;
}

export const VerticalSlider = memo(function VerticalSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
}: VerticalSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const range = max - min;
  const percent = range > 0 ? Math.min(1, Math.max(0, (value - min) / range)) : 0;
  const decimals = (step.toString().split(".")[1] || "").length;

  const updateFromPointer = useCallback(
    (clientY: number) => {
      if (!trackRef.current || range <= 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.height <= 0) return;
      const offsetY = rect.bottom - clientY;
      const rawFrac = Math.min(1, Math.max(0, offsetY / rect.height));
      const rawVal = min + rawFrac * range;
      const steppedVal = Math.round((rawVal - min) / step) * step + min;
      const finalVal = Math.min(max, Math.max(min, Number(steppedVal.toFixed(decimals))));
      if (finalVal !== value) {
        onChange(finalVal);
      }
    },
    [decimals, max, min, onChange, range, step, value]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDragging(true);
    updateFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updateFromPointer(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    }
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={() => setIsDragging(false)}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      role="slider"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-orientation="vertical"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Home") {
          e.preventDefault();
          onChange(min);
        } else if (e.key === "End") {
          e.preventDefault();
          onChange(max);
        } else if (e.key === "ArrowUp" || e.key === "ArrowRight") {
          e.preventDefault();
          const nextVal = Math.min(max, Number((value + step).toFixed(decimals)));
          if (nextVal !== value) onChange(nextVal);
        } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
          e.preventDefault();
          const nextVal = Math.max(min, Number((value - step).toFixed(decimals)));
          if (nextVal !== value) onChange(nextVal);
        }
      }}
      style={{
        position: "relative",
         width: 16,
         minWidth: 16,
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        touchAction: "none",
        userSelect: "none",
        flexShrink: 0,
        outline: "none",
        padding: "0 4px",
      }}
    >
      {/* Background Track */}
      <div
        style={{
          position: "absolute",
          width: 4,
          left: "50%",
          transform: "translateX(-50%)",
          top: 6,
          bottom: 6,
          borderRadius: 999,
          background: isHovered || isDragging ? "rgba(255, 255, 255, 0.18)" : "rgba(255, 255, 255, 0.12)",
          filter: isHovered || isDragging ? "brightness(1.2)" : "none",
          transition: "filter var(--t-fast, 0.15s) var(--ease-smooth, ease), background var(--t-fast, 0.15s) ease",
        }}
      />
      {/* Active Filled Track */}
      <div
        style={{
          position: "absolute",
          width: 4,
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 6,
          height: `calc(${percent * 100}% - ${percent * 12}px)`,
          borderRadius: 999,
          background: "var(--accent)",
          boxShadow: isDragging
            ? "0 0 8px var(--accent)"
            : isHovered
            ? "0 0 6px rgba(var(--accent-rgb, 127, 199, 255), 0.5)"
            : "none",
          filter: isHovered || isDragging ? "brightness(1.15)" : "none",
          transition: isDragging ? "none" : "height 0.08s ease, box-shadow var(--t-fast, 0.15s) ease, filter var(--t-fast, 0.15s) ease",
        }}
      />
      {/* Thumb (Бегунок точно с таким же поведением как у горизонтального ползунка) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: `calc(${percent} * (100% - 12px))`,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "var(--accent)",
          boxShadow: isDragging
            ? "0 0 12px var(--accent), 0 0 2px #fff"
            : isHovered
            ? "0 0 12px var(--accent)"
            : "0 0 6px rgba(var(--accent-rgb, 127, 199, 255), 0.45)",
          transform: isDragging
            ? "translateX(-50%) scale(1.1)"
            : isHovered
            ? "translateX(-50%) scale(1.25)"
            : "translateX(-50%) scale(1)",
          transition: isDragging
            ? "transform 0.08s ease"
            : "transform var(--t-spring, 0.25s) var(--ease-spring-bounce, cubic-bezier(0.34, 1.56, 0.64, 1)), box-shadow var(--t-fast, 0.15s) var(--ease-smooth, ease), height 0.08s ease",
        }}
      />
    </div>
  );
});

export interface AmbientTuneRowProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  def: number;
  unit: string;
  resetTitle: string;
  ariaLabel: string;
  onChange: (v: number) => void;
  onReset: () => void;
}

/** Горизонтальный премиум-ряд подсветки (яркость/насыщенность): иконка + слайдер + бейдж + условный сброс. */
export const AmbientTuneRow = memo(function AmbientTuneRow({
  icon,
  label,
  value,
  min,
  max,
  step,
  def,
  unit,
  resetTitle,
  ariaLabel,
  onChange,
  onReset,
}: AmbientTuneRowProps) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  const isDefault = value === def;
  return (
    <div style={{ ...optionCardStyle, flexDirection: "row", alignItems: "center", padding: "10px 14px", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, lineHeight: 1 }}>
        <span style={{ display: "flex", color: "var(--accent)" }}>{icon}</span>
        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1, whiteSpace: "nowrap" }}>
          {label}
        </span>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0, height: 20 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="ui-premium-slider"
          style={{
            "--track-fill": `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255, 255, 255, 0.12) ${pct}%, rgba(255, 255, 255, 0.12) 100%)`,
          } as React.CSSProperties}
          aria-label={ariaLabel}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, lineHeight: 1 }}>
        <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "var(--accent)", minWidth: 44, textAlign: "left", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {value} {unit}
        </span>
        <button
          type="button"
          onClick={onReset}
          className="btn btn--secondary btn--sm"
          style={{
            ...optionResetBtnStyle,
            opacity: isDefault ? 0 : 1,
            visibility: isDefault ? "hidden" : "visible",
            pointerEvents: isDefault ? "none" : "auto",
            transform: isDefault ? "scale(0.85)" : "scale(1)",
            transition: "opacity var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth), visibility var(--t-fast) var(--ease-smooth)",
          }}
          title={resetTitle}
          tabIndex={isDefault ? -1 : 0}
        >
          <RotateCcw size={11} />
        </button>
      </div>
    </div>
  );
});
