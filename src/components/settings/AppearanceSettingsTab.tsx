import { useState, useRef, memo, useCallback } from "react";
import {
  Palette, Type, Maximize2, SlidersHorizontal, Square, Sparkles, Clock, RotateCcw, PanelBottom, Timer, Zap
} from "lucide-react";
import { AccordionSection } from "./AccordionSection";
import { ColorSchemeSection } from "./ColorSchemeSection";
import { VisualizerSettingsSection } from "./VisualizerSettingsSection";
import { ControlButtonsPreviewCard } from "./ControlButtonsPreviewCard";
import { optionCardStyle, optionResetBtnStyle, optionBtnStyle } from "./optionCardStyles";
import { UiRadiusLevel, UiScaleMode, UiFontId, UI_RADIUS_PRESETS, UI_SCALE_PRESETS, UI_FONT_PRESETS } from "../../utils/uiThemeUtils";
import { TimeDisplayPosition, TIME_POSITION_OPTIONS } from "../../utils/timePositionUtils";
import { TimeFormatMode, TIME_FORMAT_OPTIONS } from "../../utils/timeFormatUtils";
import { ControlBarStyle } from "../../utils/controlBarStyleUtils";
import { AmbientSettings } from "../SettingsModal";

interface VerticalSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  ariaLabel?: string;
}

const VerticalSlider = memo(function VerticalSlider({
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
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
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
        width: 20,
        minWidth: 20,
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

interface AppearanceSettingsTabProps {
  activeColor: string;
  setActiveColor: (c: string) => void;
  uiRadius: { level: UiRadiusLevel, value: number };
  saveUiRadius: (level: UiRadiusLevel, value: number) => void;
  setUiRadius: (r: { level: UiRadiusLevel, value: number }) => void;
  uiScale: { mode: UiScaleMode, value: number };
  saveUiScale: (mode: UiScaleMode, value: number) => void;
  setUiScale: (s: { mode: UiScaleMode, value: number }) => void;
  uiOpacity: number;
  saveUiOpacity: (o: number) => void;
  setUiOpacity: (o: number) => void;
  uiFont: UiFontId;
  saveUiFont: (f: UiFontId) => void;
  setUiFont: (f: UiFontId) => void;
  timePosition: TimeDisplayPosition;
  saveTimePosition: (p: TimeDisplayPosition) => void;
  setTimePosition: (p: TimeDisplayPosition) => void;
  timeFormat: TimeFormatMode;
  saveTimeFormat: (f: TimeFormatMode) => void;
  setTimeFormat: (f: TimeFormatMode) => void;
  controlBarStyle: ControlBarStyle;
  saveControlBarStyle: (s: ControlBarStyle) => void;
  setControlBarStyle: (s: ControlBarStyle) => void;
  ambientSettings: AmbientSettings;
  updateAmbient: (updates: Partial<AmbientSettings>, immediateSave?: boolean) => void;
  visibleButtons: Record<string, boolean>;
  setVisibleButtons: (v: Record<string, boolean>) => void;
  skipOpeningSeconds: number;
  setSkipOpeningSeconds: (v: number) => void;
  animationsEnabled: boolean;
  setAnimationsEnabled: (v: boolean) => void;
  openSections: Record<string, boolean>;
  onToggleSection: (id: string) => void;
  getEffectiveAccentColor: (color?: string) => string;
}

export function AppearanceSettingsTab(props: AppearanceSettingsTabProps) {
  const {
    activeColor, setActiveColor,
    uiRadius, saveUiRadius, setUiRadius,
    uiScale, saveUiScale, setUiScale,
    uiOpacity, saveUiOpacity, setUiOpacity,
    uiFont, saveUiFont, setUiFont,
    timePosition, saveTimePosition, setTimePosition,
    timeFormat, saveTimeFormat, setTimeFormat,
    controlBarStyle, saveControlBarStyle, setControlBarStyle,
    ambientSettings, updateAmbient,
    visibleButtons, setVisibleButtons,
    skipOpeningSeconds, setSkipOpeningSeconds,
    animationsEnabled, setAnimationsEnabled,
    openSections, onToggleSection: toggleSection,
    getEffectiveAccentColor
  } = props;

  return (
    <>
                  <div className="modal__section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* 1. Цветовое оформление (Единая категория: цвет плеера, акценты, свечение) */}
              <AccordionSection
                isOpen={!!openSections["app_color_scheme"]}
                onToggle={() => toggleSection("app_color_scheme")}
                icon={<Palette size={16} />}
                title="Цветовое оформление"
              >
                <ColorSchemeSection onAccentChange={(color) => setActiveColor(color)} />
              </AccordionSection>

              {/* 2.1 Настройки интерфейса (Единая категория: скругление, масштаб, прозрачность) */}
              <AccordionSection
                isOpen={!!openSections["app_interface"]}
                onToggle={() => toggleSection("app_interface")}
                icon={<SlidersHorizontal size={16} />}
                title="Настройки интерфейса"
              >
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 8, marginBottom: 12, lineHeight: 1.35 }}>
                  Настройка внешнего вида элементов плеера: степень скругления углов, масштаб и прозрачность панелей управления и окон.
                </div>

                {/* ── Вспомогательные стили для подблоков настроек интерфейса ── */}
                {(() => {
                  const cardStyle = optionCardStyle;
                  const resetBtnStyle = optionResetBtnStyle;
                  const btnStyle = optionBtnStyle;

                  return (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
                        
                        {/* ── Прозрачность интерфейса (Горизонтально сверху) ── */}
                        {(() => {
                          const opacityPct = Math.round(((uiOpacity - 0.10) / (1.00 - 0.10)) * 100);
                          return (
                            <div
                              style={{
                                ...cardStyle,
                                flexDirection: "row",
                                alignItems: "center",
                                padding: "10px 14px",
                                gap: 14,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 7,
                                  flexShrink: 0,
                                  lineHeight: 1,
                                }}
                              >
                                <SlidersHorizontal size={15} style={{ color: "var(--accent)" }} />
                                <span
                                  style={{
                                    fontSize: "0.82rem",
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                    lineHeight: 1,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Прозрачность
                                </span>
                              </div>

                              <div
                                style={{
                                  flex: 1,
                                  display: "flex",
                                  alignItems: "center",
                                  minWidth: 0,
                                  height: 20,
                                }}
                              >
                                <input
                                  type="range"
                                  min="0.10"
                                  max="1.00"
                                  step="0.01"
                                  value={uiOpacity}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setUiOpacity(val);
                                    saveUiOpacity(val);
                                  }}
                                  className="ui-premium-slider"
                                  style={{
                                    "--track-fill": `linear-gradient(to right, var(--accent) 0%, var(--accent) ${opacityPct}%, rgba(255, 255, 255, 0.12) ${opacityPct}%, rgba(255, 255, 255, 0.12) 100%)`,
                                  } as React.CSSProperties}
                                  aria-label="Прозрачность интерфейса"
                                />
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  flexShrink: 0,
                                  lineHeight: 1,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.80rem",
                                    fontWeight: 700,
                                    color: "var(--accent)",
                                    minWidth: 36,
                                    textAlign: "left",
                                    fontVariantNumeric: "tabular-nums",
                                    lineHeight: 1,
                                  }}
                                >
                                  {Math.round(uiOpacity * 100)}%
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUiOpacity(0.88);
                                    saveUiOpacity(0.88);
                                  }}
                                  className="btn btn--secondary btn--sm"
                                  style={{
                                    ...resetBtnStyle,
                                    opacity: Math.abs(uiOpacity - 0.88) > 0.005 ? 1 : 0,
                                    visibility: Math.abs(uiOpacity - 0.88) > 0.005 ? "visible" : "hidden",
                                    pointerEvents: Math.abs(uiOpacity - 0.88) > 0.005 ? "auto" : "none",
                                    transform: Math.abs(uiOpacity - 0.88) > 0.005 ? "scale(1)" : "scale(0.85)",
                                    transition: "opacity var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth), visibility var(--t-fast) var(--ease-smooth)",
                                  }}
                                  title="Сбросить на 88%"
                                  tabIndex={Math.abs(uiOpacity - 0.88) > 0.005 ? 0 : -1}
                                >
                                  <RotateCcw size={11} />
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                        {/* ── Сетка из 3-х колонок ── */}
                        <div className="ui-ergonomics-grid">

                          {/* Колонка 1: Скругление */}
                          <div style={{ ...cardStyle, flex: 1, minHeight: 185 }}>
                            <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Square size={14} style={{ color: "var(--accent)" }} />
                                <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                  Скругление
                                </span>
                              </div>
                              <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                                {uiRadius.value} px
                              </span>
                            </div>

                            <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0, alignItems: "stretch" }}>
                              {/* Сетка 2x2 для пресетов */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gridTemplateRows: "repeat(2, minmax(0, 1fr))",
                                  gap: 6,
                                  flex: 1,
                                  minWidth: 0,
                                  minHeight: 0,
                                }}
                              >
                                {(Object.keys(UI_RADIUS_PRESETS) as (Exclude<UiRadiusLevel, "custom">)[])
                                  .filter(level => level !== "none")
                                  .map((level) => {
                                    const preset = UI_RADIUS_PRESETS[level];
                                    const isSel = uiRadius.value === preset.controlsRadius;
                                    const visualRadius =
                                      level === "minimal"
                                        ? "1.5px"
                                        : level === "default"
                                        ? "6px"
                                        : level === "smooth"
                                        ? "13px"
                                        : "999px";
                                    return (
                                      <button
                                        key={level}
                                        type="button"
                                        onClick={() => {
                                          setUiRadius({ level, value: preset.controlsRadius });
                                          saveUiRadius(level, preset.controlsRadius);
                                        }}
                                        style={{
                                          ...btnStyle(isSel, "5px 4px"),
                                          gap: 4,
                                          minHeight: 56,
                                        }}
                                      >
                                        <div
                                          style={{
                                            width: 46,
                                            height: 25,
                                            border: `1.5px solid ${isSel ? "var(--accent)" : "rgba(255, 255, 255, 0.35)"}`,
                                            borderRadius: visualRadius,
                                            background: isSel ? "rgba(var(--accent-rgb, 127, 199, 255), 0.18)" : "rgba(255, 255, 255, 0.04)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            boxShadow: isSel ? "0 0 10px rgba(var(--accent-rgb, 127, 199, 255), 0.35)" : "none",
                                            transition: "all var(--t-fast) var(--ease-smooth)",
                                            flexShrink: 0,
                                          }}
                                        >
                                          <div
                                            style={{
                                              width: 20,
                                              height: 3,
                                              borderRadius: visualRadius === "1.5px" ? "1px" : "999px",
                                              background: isSel ? "var(--accent)" : "rgba(255, 255, 255, 0.25)",
                                              transition: "all var(--t-fast) var(--ease-smooth)",
                                            }}
                                          />
                                        </div>
                                        <span style={{ fontSize: "0.70rem", fontWeight: 600, lineHeight: 1.15, textAlign: "center", whiteSpace: "nowrap" }}>
                                          {preset.label}
                                        </span>
                                      </button>
                                    );
                                })}
                              </div>

                              {/* Вертикальный ползунок */}
                              <div style={{ width: 20, display: "flex", alignItems: "stretch", justifyContent: "center", flexShrink: 0 }}>
                                <VerticalSlider
                                  value={uiRadius.value}
                                  min={0}
                                  max={34}
                                  step={1}
                                  onChange={(val: number) => {
                                    const matched = (Object.keys(UI_RADIUS_PRESETS) as (Exclude<UiRadiusLevel, "custom">)[]).find(
                                      (k) => UI_RADIUS_PRESETS[k].controlsRadius === val
                                    );
                                    const nextLevel: UiRadiusLevel = matched || "custom";
                                    setUiRadius({ level: nextLevel, value: val });
                                    saveUiRadius(nextLevel, val);
                                  }}
                                  ariaLabel="Степень скругления углов интерфейса"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Колонка 2: Масштаб */}
                          <div style={{ ...cardStyle, flex: 1, minHeight: 185 }}>
                            <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Maximize2 size={14} style={{ color: "var(--accent)" }} />
                                <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                  Масштаб
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                                  {Math.round(uiScale.value * 100)}%
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUiScale({ mode: "auto", value: 1.0 });
                                    saveUiScale("auto", 1.0);
                                  }}
                                  style={{
                                    background: uiScale.mode === "auto" ? "var(--accent)" : "rgba(255,255,255,0.08)",
                                    color: uiScale.mode === "auto" ? "#0b0d12" : "var(--text-secondary)",
                                    border: "none",
                                    borderRadius: "4px",
                                    width: 18,
                                    height: 18,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "0.70rem",
                                    fontWeight: "bold",
                                    cursor: "pointer",
                                    transition: "all var(--t-fast) var(--ease-smooth)",
                                  }}
                                  title="Автоматический масштаб"
                                >
                                  A
                                </button>
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0, alignItems: "stretch" }}>
                              {/* Сетка 2x2 для пресетов */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gridTemplateRows: "repeat(2, minmax(0, 1fr))",
                                  gap: 6,
                                  flex: 1,
                                  minWidth: 0,
                                  minHeight: 0,
                                }}
                              >
                                {UI_SCALE_PRESETS.filter(p => ["compact", "standard", "medium", "large"].includes(p.id)).map((preset) => {
                                  const isSel = uiScale.mode === preset.id || (uiScale.mode !== "auto" && preset.value !== null && Math.abs(uiScale.value - preset.value) < 0.01);
                                  return (
                                    <button
                                      key={preset.id}
                                      type="button"
                                      onClick={() => {
                                        const nextVal = preset.value !== null ? preset.value : 1.0;
                                        setUiScale({ mode: preset.id, value: nextVal });
                                        saveUiScale(preset.id, nextVal);
                                      }}
                                      style={{
                                        ...btnStyle(isSel, "5px 4px"),
                                        gap: 3,
                                        minHeight: 56,
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: "0.70rem",
                                          fontWeight: 600,
                                          lineHeight: 1.15,
                                          textAlign: "center",
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          maxWidth: "100%",
                                        }}
                                      >
                                        {preset.label}
                                      </span>
                                      <span style={{ fontSize: "0.65rem", color: isSel ? "var(--text-primary)" : "var(--text-muted)", opacity: 0.85, fontWeight: 500 }}>
                                        {preset.badge}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Вертикальный ползунок */}
                              <div style={{ width: 20, display: "flex", alignItems: "stretch", justifyContent: "center", flexShrink: 0 }}>
                                <VerticalSlider
                                  value={uiScale.value}
                                  min={0.70}
                                  max={2.00}
                                  step={0.05}
                                  onChange={(val: number) => {
                                    const matched = UI_SCALE_PRESETS.find((p) => p.value !== null && Math.abs(p.value - val) < 0.01);
                                    const nextMode = matched ? matched.id : "custom";
                                    setUiScale({ mode: nextMode, value: val });
                                    saveUiScale(nextMode, val);
                                  }}
                                  ariaLabel="Масштаб интерфейса"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Колонка 3: Шрифты */}
                          <div style={{ ...cardStyle, flex: 1, minHeight: 185 }}>
                            <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Type size={14} style={{ color: "var(--accent)" }} />
                                <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                  Шрифты
                                </span>
                              </div>
                            </div>

                            <div className="custom-scrollbar" style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, overflowY: "auto", paddingRight: 4 }}>
                              {UI_FONT_PRESETS.map((fontPreset) => {
                                const isSel = uiFont === fontPreset.id;
                                return (
                                  <button
                                    key={fontPreset.id}
                                    type="button"
                                    onClick={() => {
                                      setUiFont(fontPreset.id);
                                      saveUiFont(fontPreset.id);
                                    }}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      padding: "6px 8px",
                                      borderRadius: "var(--radius-sm)",
                                      border: isSel ? "1.5px solid var(--accent)" : "1px solid rgba(255, 255, 255, 0.06)",
                                      background: isSel ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)" : "rgba(255, 255, 255, 0.03)",
                                      color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                                      boxShadow: isSel
                                        ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px var(--accent)"
                                        : "0 1px 3px rgba(0, 0, 0, 0.2)",
                                      cursor: "pointer",
                                      fontFamily: `var(--font-${fontPreset.id})`,
                                      transition: "all var(--t-fast) var(--ease-smooth)",
                                      flexShrink: 0,
                                    }}
                                  >
                                    <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{fontPreset.label}</span>
                                    <span style={{ fontSize: "0.70rem", color: isSel ? "var(--accent)" : "var(--text-muted)", fontWeight: 700 }}>Aa</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── Блок 5 и 6: Стиль панели управления (слева) + Позиция и Формат времени (справа) ── */}
                      <div className="controls-and-time-grid">
                        {/* Левая колонка: Стиль панели управления (друг под другом) */}
                        <div style={{ ...cardStyle, margin: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                          <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                              <PanelBottom size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                              <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                                Стиль панели управления
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setControlBarStyle("floating");
                                saveControlBarStyle("floating");
                              }}
                              className="btn btn--secondary btn--sm"
                              style={{
                                ...resetBtnStyle,
                                opacity: controlBarStyle !== "floating" ? 1 : 0,
                                visibility: controlBarStyle !== "floating" ? "visible" : "hidden",
                                pointerEvents: controlBarStyle !== "floating" ? "auto" : "none",
                                transform: controlBarStyle !== "floating" ? "scale(1)" : "scale(0.85)",
                                transition: "opacity var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth), visibility var(--t-fast) var(--ease-smooth)",
                              }}
                              title="Сбросить на Парящую"
                              tabIndex={controlBarStyle !== "floating" ? 0 : -1}
                            >
                              <RotateCcw size={11} />
                            </button>
                          </div>

                          {/* Наглядные реалистичные превью плеера друг под другом */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, justifyContent: "center" }}>
                            {/* 1: Капсула */}
                            <div
                              className={`visual-bar-card visual-bar-card--row ${controlBarStyle === "floating" ? "visual-bar-card--active" : ""}`}
                              onClick={() => {
                                setControlBarStyle("floating");
                                saveControlBarStyle("floating");
                              }}
                              title="Капсула: скругленная капсула с воздушными отступами от краев окна"
                            >
                              {/* Мини-превью плеера */}
                              <div className="visual-bar-preview">
                                <div className="visual-bar-preview__screen">
                                  <div className="visual-bar-preview__glow" />
                                  <div className="visual-bar-preview__floating-island">
                                    <div className="visual-bar-preview__btn-play" />
                                    <div className="visual-bar-preview__track">
                                      <div className="visual-bar-preview__progress" style={{ width: "45%" }} />
                                    </div>
                                    <div className="visual-bar-preview__dot" />
                                  </div>
                                </div>
                              </div>

                              <div className="visual-bar-card__info">
                                <span className="visual-bar-card__label">Капсула</span>
                                <span className="visual-bar-card__desc">Скругленная капсула с отступами от краев окна</span>
                              </div>
                            </div>

                            {/* 2: Классический */}
                            <div
                              className={`visual-bar-card visual-bar-card--row ${controlBarStyle === "docked" ? "visual-bar-card--active" : ""}`}
                              onClick={() => {
                                setControlBarStyle("docked");
                                saveControlBarStyle("docked");
                              }}
                              title="Классический: сплошная полоса во всю ширину окна у нижнего края без зазоров"
                            >
                              {/* Мини-превью плеера */}
                              <div className="visual-bar-preview">
                                <div className="visual-bar-preview__screen">
                                  <div className="visual-bar-preview__glow" />
                                  <div className="visual-bar-preview__docked-bar">
                                    <div className="visual-bar-preview__docked-timeline">
                                      <div className="visual-bar-preview__progress" style={{ width: "65%" }} />
                                    </div>
                                    <div className="visual-bar-preview__docked-controls">
                                      <div className="visual-bar-preview__btn-play" />
                                      <div className="visual-bar-preview__line" />
                                      <div className="visual-bar-preview__dot" />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="visual-bar-card__info">
                                <span className="visual-bar-card__label">Классический</span>
                                <span className="visual-bar-card__desc">Сплошная панель во всю ширину у нижнего края</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Правая колонка: Время видео (Позиция времени сверху, Формат времени снизу) */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                          {/* Справа сверху: Позиция времени */}
                          <div style={{ ...cardStyle, margin: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                            <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                <Clock size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                                <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                                  Позиция времени
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setTimePosition("timeline_right");
                                  saveTimePosition("timeline_right");
                                }}
                                className="btn btn--secondary btn--sm"
                                style={{
                                  ...resetBtnStyle,
                                  opacity: timePosition !== "timeline_right" ? 1 : 0,
                                  visibility: timePosition !== "timeline_right" ? "visible" : "hidden",
                                  pointerEvents: timePosition !== "timeline_right" ? "auto" : "none",
                                  transform: timePosition !== "timeline_right" ? "scale(1)" : "scale(0.85)",
                                  transition: "opacity var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth), visibility var(--t-fast) var(--ease-smooth)",
                                }}
                                title="Сбросить на Справа"
                                tabIndex={timePosition !== "timeline_right" ? 0 : -1}
                              >
                                <RotateCcw size={11} />
                              </button>
                            </div>

                            {/* Компактные сегментные кнопки позиций времени */}
                            <div className="time-pos-compact-grid">
                              {TIME_POSITION_OPTIONS.map((posOption) => {
                                const isSel = timePosition === posOption.id;
                                const shortLabel =
                                  posOption.id === "timeline_left"
                                    ? "Слева"
                                    : posOption.id === "timeline_right"
                                    ? "Справа"
                                    : posOption.id === "volume_right"
                                    ? "У звука"
                                    : posOption.id === "toolbar_right"
                                    ? "В тулбаре"
                                    : posOption.id === "timeline_floating_center"
                                    ? "По центру"
                                    : "Titlebar";
                                return (
                                  <button
                                    key={posOption.id}
                                    type="button"
                                    className={`compact-segment-btn ${isSel ? "compact-segment-btn--active" : ""}`}
                                    onClick={() => {
                                      setTimePosition(posOption.id);
                                      saveTimePosition(posOption.id);
                                    }}
                                    title={`${posOption.label}: ${posOption.desc}`}
                                    style={{ height: 28 }}
                                  >
                                    {shortLabel}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Справа снизу: Формат отображения времени */}
                          <div style={{ ...cardStyle, margin: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                            <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                <Timer size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                                <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                                  Формат времени
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setTimeFormat("elapsed_total");
                                  saveTimeFormat("elapsed_total");
                                }}
                                className="btn btn--secondary btn--sm"
                                style={{
                                  ...resetBtnStyle,
                                  opacity: timeFormat !== "elapsed_total" ? 1 : 0,
                                  visibility: timeFormat !== "elapsed_total" ? "visible" : "hidden",
                                  pointerEvents: timeFormat !== "elapsed_total" ? "auto" : "none",
                                  transform: timeFormat !== "elapsed_total" ? "scale(1)" : "scale(0.85)",
                                  transition: "opacity var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth), visibility var(--t-fast) var(--ease-smooth)",
                                }}
                                title="Сбросить на Прошедшее / Общее"
                                tabIndex={timeFormat !== "elapsed_total" ? 0 : -1}
                              >
                                <RotateCcw size={11} />
                              </button>
                            </div>

                            {/* 4 компактные сегментные кнопки с примерами тайминга */}
                            <div className="time-format-compact-grid">
                              {TIME_FORMAT_OPTIONS.map((formatOption) => {
                                const isSel = timeFormat === formatOption.id;
                                return (
                                  <button
                                    key={formatOption.id}
                                    type="button"
                                    className={`compact-segment-btn compact-segment-btn--mono ${
                                      isSel ? "compact-segment-btn--active" : ""
                                    }`}
                                    onClick={() => {
                                      setTimeFormat(formatOption.id);
                                      saveTimeFormat(formatOption.id);
                                    }}
                                    title={`${formatOption.label} — ${formatOption.desc}`}
                                    style={{ height: 28 }}
                                  >
                                    {formatOption.example}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </AccordionSection>

              {/* 4. Плавные анимации интерфейса */}
              <AccordionSection
                isOpen={!!openSections["app_animations"]}
                onToggle={() => toggleSection("app_animations")}
                icon={<Zap size={16} />}
                title="Анимации интерфейса (Spring Physics)"
              >
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      className="ui-checkbox"
                      checked={animationsEnabled}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setAnimationsEnabled(val);
                        localStorage.setItem('l-mpv-animations-enabled', val ? 'true' : 'false');
                        if (val) {
                          document.documentElement.classList.remove('no-animations');
                        } else {
                          document.documentElement.classList.add('no-animations');
                        }
                        window.dispatchEvent(new Event('l-mpv-settings-changed'));
                      }}
                    />
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Включить плавные spring-микроанимации переключения, раскрытия меню и физического отклика
                    </span>
                  </label>
                  <p style={{ margin: "2px 0 0 30px", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                    Эластичные переходы кнопок Play/Pause, Mute, слайдера громкости, боковой панели плейлиста, меню дорожек и окон. При отключении интерфейс реагирует мгновенно.
                  </p>
                </div>
              </AccordionSection>

              {/* 5. Аудио-визуалайзер на панели управления */}
              <VisualizerSettingsSection
                isOpen={!!openSections["app_visualizer"]}
                onToggle={() => toggleSection("app_visualizer")}
              />

              {/* 6. Видимость кнопок панели управления */}
              <AccordionSection
                isOpen={!!openSections["app_control_buttons"]}
                onToggle={() => toggleSection("app_control_buttons")}
                icon={<SlidersHorizontal size={16} />}
                title="Видимость кнопок панели управления"
              >
                <div style={{ marginTop: 12 }}>
                  <ControlButtonsPreviewCard
                    visibleButtons={visibleButtons}
                    skipOpeningSeconds={skipOpeningSeconds}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", columnGap: 20, rowGap: 8, marginTop: 12 }}>
                  {[
                    { id: 'repeat', label: 'Повтор', defaultChecked: true },
                    { id: 'shuffle', label: 'Случайный порядок', defaultChecked: true },
                    { id: 'alwaysOnTop', label: 'Поверх всех окон', defaultChecked: true },
                    { id: 'info', label: 'Информация о файле', defaultChecked: true },
                    { id: 'mediaInfo', label: 'Свойства MediaInfo (Shift+F10)', defaultChecked: true },
                    { id: 'visualizer', label: 'Аудио-визуалайзер', defaultChecked: true },
                    { id: 'screenshot', label: 'Сделать скриншот', defaultChecked: true },
                    { id: 'playlist', label: 'Плейлист', defaultChecked: true },
                    { id: 'fullscreen', label: 'Полный экран', defaultChecked: true },
                    { id: 'skipOpening', label: 'Перемотка опенинга', defaultChecked: false }
                  ].map(btn => {
                    const isChecked = visibleButtons[btn.id] !== undefined 
                      ? visibleButtons[btn.id] 
                      : btn.defaultChecked;
                    return (
                      <label key={btn.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 24, height: 24, cursor: "pointer", userSelect: "none", boxSizing: "border-box" }}>
                        <input
                          type="checkbox"
                          className="ui-checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const val = e.target.checked;
                            const updated = { ...visibleButtons, [btn.id]: val };
                            setVisibleButtons(updated);
                            localStorage.setItem('l-mpv-visible-buttons', JSON.stringify(updated));
                            window.dispatchEvent(new Event('l-mpv-settings-changed'));
                          }}
                        />
                        <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500, lineHeight: 1 }}>
                          {btn.label}
                        </span>
                        {btn.id === 'skipOpening' && isChecked && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4, height: 20 }}
                          >
                            <input
                              type="text"
                              inputMode="numeric"
                              className="no-spin-input"
                              value={skipOpeningSeconds}
                              onChange={(e) => {
                                const rawVal = e.target.value.replace(/\D/g, "");
                                const num = rawVal === "" ? 0 : Number(rawVal);
                                const val = num > 600 ? 600 : num;
                                setSkipOpeningSeconds(val);
                                if (val > 0) {
                                  localStorage.setItem('l-mpv-skip-opening-seconds', val.toString());
                                  window.dispatchEvent(new Event('l-mpv-settings-changed'));
                                }
                              }}
                              onBlur={() => {
                                if (skipOpeningSeconds <= 0) {
                                  setSkipOpeningSeconds(90);
                                  localStorage.setItem('l-mpv-skip-opening-seconds', '90');
                                  window.dispatchEvent(new Event('l-mpv-settings-changed'));
                                }
                              }}
                              style={{
                                width: 44,
                                height: 20,
                                padding: "0 4px",
                                background: "rgba(0, 0, 0, 0.4)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius-sm)",
                                color: "var(--text-primary)",
                                fontSize: "0.78rem",
                                textAlign: "center",
                                fontWeight: 600,
                                boxSizing: "border-box",
                                outline: "none"
                              }}
                            />
                            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1 }}>сек</span>
                          </div>
                        )}
                      </label>
                    );
                  })}
                </div>
              </AccordionSection>

              {/* 6. Подсветка черных полос (Ambient Light) */}
              <AccordionSection
                isOpen={!!openSections["app_ambient"]}
                onToggle={() => toggleSection("app_ambient")}
                icon={<Sparkles size={16} />}
                title="Подсветка черных полос (Ambient Light)"
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                  <span style={{ fontSize: "0.80rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    Заполняет пустые области экрана (letterbox/pillarbox) при просмотре широкоформатных видео или в полноэкранном режиме.
                  </span>

                  {/* Переключатель режимов */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 8,
                      padding: 4,
                      background: "rgba(255, 255, 255, 0.03)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {[
                      { id: "off", label: "Выключено", desc: "Черные полосы" },
                      { id: "blur", label: "Размытие (GPU)", desc: "Шейдерный Blur" },
                      { id: "color", label: "Цветной фон", desc: "Свечение цветом" },
                    ].map((item) => {
                      const isSel = ambientSettings.mode === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => updateAmbient({ mode: item.id as "off" | "blur" | "color" }, true)}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                            padding: "8px 6px",
                            borderRadius: "var(--radius-sm)",
                            border: isSel ? "1.5px solid var(--accent)" : "1px solid rgba(255, 255, 255, 0.06)",
                            cursor: "pointer",
                            background: isSel ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)" : "transparent",
                            color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                            boxShadow: isSel
                              ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px var(--accent)"
                              : "none",
                            transition: "background-color var(--t-fast) var(--ease-smooth), border-color var(--t-fast) var(--ease-smooth), color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
                          }}
                        >
                          <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{item.label}</span>
                          <span style={{ fontSize: "0.70rem", color: isSel ? "var(--accent-hover)" : "var(--text-muted)" }}>
                            {item.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Настройка радиуса размытия (только для режима blur) */}
                  {ambientSettings.mode === "blur" && (() => {
                    const bMin = 10;
                    const bMax = 150;
                    const bDef = 100;
                    const bVal = ambientSettings.blur_radius;
                    const bPct = Math.round(((bVal - bMin) / (bMax - bMin)) * 100);
                    const isDefault = bVal === bDef;
                    return (
                      <div style={{ ...optionCardStyle, flexDirection: "row", alignItems: "center", padding: "10px 14px", gap: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, lineHeight: 1 }}>
                          <Sparkles size={15} style={{ color: "var(--accent)" }} />
                          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1, whiteSpace: "nowrap" }}>
                            Размытие
                          </span>
                        </div>
                        <div style={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0, height: 20 }}>
                          <input
                            type="range"
                            min={bMin}
                            max={bMax}
                            step={5}
                            value={bVal}
                            onChange={(e) => updateAmbient({ blur_radius: parseInt(e.target.value, 10) }, false)}
                            className="ui-premium-slider"
                            style={{
                              "--track-fill": `linear-gradient(to right, var(--accent) 0%, var(--accent) ${bPct}%, rgba(255, 255, 255, 0.12) ${bPct}%, rgba(255, 255, 255, 0.12) 100%)`,
                            } as React.CSSProperties}
                            aria-label="Радиус аппаратного размытия"
                          />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, lineHeight: 1 }}>
                          <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "var(--accent)", minWidth: 44, textAlign: "left", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                            {bVal} px
                          </span>
                          <button
                            type="button"
                            onClick={() => updateAmbient({ blur_radius: bDef }, true)}
                            className="btn btn--secondary btn--sm"
                            style={{
                              ...optionResetBtnStyle,
                              opacity: isDefault ? 0 : 1,
                              visibility: isDefault ? "hidden" : "visible",
                              pointerEvents: isDefault ? "none" : "auto",
                              transform: isDefault ? "scale(0.85)" : "scale(1)",
                              transition: "opacity var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth), visibility var(--t-fast) var(--ease-smooth)",
                            }}
                            title="Сбросить на 100px"
                            tabIndex={isDefault ? -1 : 0}
                          >
                            <RotateCcw size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Настройка цвета (только для режима color) */}
                  {ambientSettings.mode === "color" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                        Цвет подсветки черных полос
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        {(() => {
                          const isThemeMatch =
                            ambientSettings.color.toLowerCase() ===
                            getEffectiveAccentColor().toLowerCase();
                          return (
                            <button
                              onClick={() => updateAmbient({ color: getEffectiveAccentColor() }, true)}
                              title="Использовать текущий акцент плеера"
                              style={{
                                padding: "6px 12px",
                                borderRadius: "var(--radius-sm)",
                                border: isThemeMatch
                                  ? "1.5px solid var(--accent)"
                                  : "1px solid var(--border)",
                                background: isThemeMatch
                                  ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)"
                                  : "var(--accent-glass)",
                                color: isThemeMatch
                                  ? "var(--text-primary)"
                                  : "var(--accent)",
                                boxShadow: isThemeMatch
                                  ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px var(--accent)"
                                  : "none",
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                transition: "background-color var(--t-fast) var(--ease-smooth), border-color var(--t-fast) var(--ease-smooth), color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
                              }}
                            >
                              Как в теме ({activeColor === "windows" ? "Windows" : activeColor})
                            </button>
                          );
                        })()}

                        {["#141923", "#1f2937", "#241e38", "#2d1c24", "#132a24", "#0a192f"].map((hex) => (
                          <button
                            key={hex}
                            onClick={() => updateAmbient({ color: hex }, true)}
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: "50%",
                              backgroundColor: hex,
                              border: ambientSettings.color === hex ? "2px solid white" : "1px solid var(--border)",
                              cursor: "pointer",
                              boxShadow: ambientSettings.color === hex ? `0 0 10px ${hex}` : "none",
                              transition: "border-color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
                            }}
                          />
                        ))}

                        <input
                          type="color"
                          value={ambientSettings.color.startsWith("#") ? ambientSettings.color : "#7fc7ff"}
                          onChange={(e) => updateAmbient({ color: e.target.value }, false)}
                          title="Выбрать произвольный цвет"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            border: "none",
                            cursor: "pointer",
                            background: "none",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </AccordionSection>
            </div>
    </>
  );
}
