import {
  Palette, Type, Maximize2, SlidersHorizontal, Square, Sparkles, AudioLines, Clock, RotateCcw, Play, RotateCw, PanelBottom, Timer, Zap
} from "lucide-react";
import { AccordionSection } from "./AccordionSection";
import { ColorSchemeSection } from "./ColorSchemeSection";
import { VisualizerSettingsSection } from "./VisualizerSettingsSection";
import { ControlButtonsPreviewCard } from "./ControlButtonsPreviewCard";
import { UiRadiusLevel, UiScaleMode, UiFontId, UI_RADIUS_PRESETS, UI_SCALE_PRESETS, UI_FONT_PRESETS } from "../../utils/uiThemeUtils";
import { TimeDisplayPosition, TIME_POSITION_OPTIONS } from "../../utils/timePositionUtils";
import { TimeFormatMode, TIME_FORMAT_OPTIONS } from "../../utils/timeFormatUtils";
import { ControlBarStyle } from "../../utils/controlBarStyleUtils";

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
  ambientSettings: any;
  updateAmbient: (updates: any, save?: boolean) => void;
  visibleButtons: Record<string, boolean>;
  setVisibleButtons: (v: Record<string, boolean>) => void;
  showTrackNames: boolean;
  setShowTrackNames: (v: boolean) => void;
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
    showTrackNames, setShowTrackNames,
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
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 8, marginBottom: 10, lineHeight: 1.35 }}>
                  Настройка внешнего вида элементов плеера: степень скругления углов, масштаб и прозрачность панелей управления и окон.
                </div>

                {/* Компактный интерактивный предпросмотр */}
                <div className="settings-preview-card">
                  <div className="settings-preview-card__info">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        Предпросмотр:
                      </span>
                      <span
                        style={{
                          fontSize: "0.80rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                        }}
                      >
                        {uiRadius.level === "custom"
                          ? `Кастомное (${uiRadius.value} px)`
                          : `${UI_RADIUS_PRESETS[uiRadius.level as Exclude<UiRadiusLevel, "custom">]?.label || "Стандартный"} (${uiRadius.value} px)`}
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>•</span>
                      <span
                        style={{
                          fontSize: "0.80rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                        }}
                      >
                        Масштаб: {uiScale.mode === "auto" ? "Авто (100%)" : `${Math.round(uiScale.value * 100)}%`}
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>•</span>
                      <span
                        style={{
                          fontSize: "0.80rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                        }}
                      >
                        Прозрачность: {Math.round(uiOpacity * 100)}%
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>•</span>
                      <span
                        style={{
                          fontSize: "0.80rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                        }}
                      >
                        Шрифт: {UI_FONT_PRESETS.find((f) => f.id === uiFont)?.label || "Inter"}
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>•</span>
                      <span
                        style={{
                          fontSize: "0.80rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                        }}
                      >
                        Время: {TIME_POSITION_OPTIONS.find((p) => p.id === timePosition)?.label || "Справа от таймлайна"}
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>•</span>
                      <span
                        style={{
                          fontSize: "0.80rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                        }}
                      >
                        Панель: {controlBarStyle === "docked" ? "Пристыкованная (Docked)" : "Парящая (Floating)"}
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>•</span>
                      <span
                        style={{
                          fontSize: "0.80rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                        }}
                      >
                        Формат: {TIME_FORMAT_OPTIONS.find((f) => f.id === timeFormat)?.label || "Прошедшее / Общее"}
                      </span>
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.25 }}>
                      Живой отклик нижней панели управления, кнопок плеера, диалогов и контекстных меню
                    </span>
                  </div>

                  {/* Миниатюрная аутентичная панель управления с живым скруглением и прозрачностью */}
                  <div
                    className="settings-preview-card__mini-player"
                    style={{
                      background: `rgba(var(--bg-pill-rgb, 10, 12, 18), ${uiOpacity})`,
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      borderTop: "1px solid var(--border-pill)",
                      borderLeft: controlBarStyle === "docked" ? "none" : "1px solid var(--border-pill)",
                      borderRight: controlBarStyle === "docked" ? "none" : "1px solid var(--border-pill)",
                      borderBottom: controlBarStyle === "docked" ? "none" : "1px solid var(--border-pill)",
                      borderRadius: controlBarStyle === "docked" ? 0 : `${uiRadius.value}px`,
                      padding: "6px 14px 8px",
                      boxShadow: controlBarStyle === "docked"
                        ? "0 -4px 16px rgba(0, 0, 0, 0.45)"
                        : "var(--shadow-pill, 0 4px 20px rgba(0, 0, 0, 0.45))",
                      transition: "border-radius var(--t-spring) var(--ease-spring-smooth), background 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                      <RotateCcw size={14} style={{ color: "var(--text-secondary)", opacity: 0.85, cursor: "default" }} />
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--accent)",
                          cursor: "default",
                          filter: "var(--play-icon-glow)",
                          transition: "filter var(--t-fast) var(--ease-smooth)",
                        }}
                      >
                        <Play size={20} fill="currentColor" />
                      </div>
                      <RotateCw size={14} style={{ color: "var(--text-secondary)", opacity: 0.85, cursor: "default" }} />
                    </div>
                    {/* Полоска таймлайна */}
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        height: 3,
                        background: "rgba(255, 255, 255, 0.15)",
                        borderRadius: `${Math.max(1, Math.round(uiRadius.value * 0.25))}px`,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: "55%",
                          background: "var(--accent)",
                          borderRadius: `${Math.max(1, Math.round(uiRadius.value * 0.25))}px`,
                          boxShadow: "var(--timeline-glow)",
                          transition: "box-shadow var(--t-fast) var(--ease-smooth)",
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Вспомогательные стили для подблоков настроек интерфейса ── */}
                {(() => {
                  const cardStyle: React.CSSProperties = {
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "10px 12px",
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border)",
                    marginBottom: 10,
                  };
                  const resetBtnStyle: React.CSSProperties = {
                    height: 22,
                    padding: "0 8px",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: "0.70rem",
                    cursor: "pointer",
                  };
                  const btnStyle = (isSel: boolean, padding = "6px 4px"): React.CSSProperties => ({
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                    padding,
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    cursor: "pointer",
                    background: isSel ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)" : "rgba(255, 255, 255, 0.03)",
                    color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                    boxShadow: isSel
                      ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px var(--accent)"
                      : "none",
                    transition: "all var(--t-fast) var(--ease-smooth)",
                  });

                  return (
                    <>
                      {/* ── Блок 1: Скругление углов ── */}
                      <div style={cardStyle}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Square size={14} style={{ color: "var(--accent)" }} />
                            <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              Скругление углов интерфейса
                            </span>
                            {controlBarStyle === "docked" && (
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  color: "var(--accent)",
                                  background: "rgba(var(--accent-rgb, 127, 199, 255), 0.12)",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                }}
                                title="В режиме 'Пристыкованная планка' нижняя панель зафиксирована плоской, а скругление применяется к окнам, меню и карточкам"
                              >
                                Панель зафиксирована плоской
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "var(--accent)" }}>
                              {uiRadius.value} px
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setUiRadius({ level: "default", value: 16 });
                                saveUiRadius("default", 16);
                              }}
                              className="btn btn--secondary btn--sm"
                              style={resetBtnStyle}
                            >
                              <RotateCcw size={11} />
                              <span>16 px (Стандарт)</span>
                            </button>
                          </div>
                        </div>

                        {/* 5 кнопок пресетов скругления в адаптивной сетке */}
                        <div className="radius-presets-grid">
                          {(Object.keys(UI_RADIUS_PRESETS) as (Exclude<UiRadiusLevel, "custom">)[]).map((level) => {
                            const preset = UI_RADIUS_PRESETS[level];
                            const isSel = uiRadius.value === preset.controlsRadius;
                            const visualRadius = level === "none" ? "0px" : level === "minimal" ? "3px" : level === "default" ? "6px" : level === "smooth" ? "9px" : "14px";
                            return (
                              <button
                                key={level}
                                type="button"
                                onClick={() => {
                                  setUiRadius({ level, value: preset.controlsRadius });
                                  saveUiRadius(level, preset.controlsRadius);
                                }}
                                style={btnStyle(isSel)}
                              >
                                <div
                                  style={{
                                    width: 22,
                                    height: 13,
                                    border: `1.5px solid ${isSel ? "var(--accent)" : "rgba(255, 255, 255, 0.35)"}`,
                                    borderRadius: visualRadius,
                                    background: isSel ? "var(--accent-glass)" : "transparent",
                                    transition: "all var(--t-fast) var(--ease-smooth)",
                                  }}
                                />
                                <span style={{ fontSize: "0.76rem", fontWeight: 600 }}>{preset.label}</span>
                                <span style={{ fontSize: "0.68rem", color: isSel ? "var(--accent-hover)" : "var(--text-muted)" }}>
                                  {preset.badge}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Ползунок точной настройки кастомного скругления */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", width: 65, flexShrink: 0 }}>
                            Кастомное:
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="34"
                            step="1"
                            value={uiRadius.value}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              const matched = (Object.keys(UI_RADIUS_PRESETS) as (Exclude<UiRadiusLevel, "custom">)[]).find(
                                (k) => UI_RADIUS_PRESETS[k].controlsRadius === val
                              );
                              const nextLevel: UiRadiusLevel = matched || "custom";
                              setUiRadius({ level: nextLevel, value: val });
                              saveUiRadius(nextLevel, val);
                            }}
                            style={{ flex: 1, cursor: "pointer", accentColor: "var(--accent)" }}
                          />
                          <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text-secondary)", width: 42, textAlign: "right" }}>
                            {uiRadius.value} px
                          </span>
                        </div>
                      </div>

                      {/* ── Блок 2: Масштаб и размеры ── */}
                      <div style={cardStyle}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Maximize2 size={14} style={{ color: "var(--accent)" }} />
                            <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              Масштаб и размеры интерфейса (UI Scale)
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "var(--accent)" }}>
                              {uiScale.mode === "auto" ? "Авто (100%)" : `${Math.round(uiScale.value * 100)}%`}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setUiScale({ mode: "auto", value: 1.0 });
                                saveUiScale("auto", 1.0);
                              }}
                              className="btn btn--secondary btn--sm"
                              style={resetBtnStyle}
                            >
                              <RotateCcw size={11} />
                              <span>Авто (Стандарт)</span>
                            </button>
                          </div>
                        </div>

                        {/* 6 кнопок пресетов масштаба в адаптивной сетке */}
                        <div className="scale-presets-grid">
                          {UI_SCALE_PRESETS.map((preset) => {
                            const isSel =
                              uiScale.mode === preset.id ||
                              (uiScale.mode !== "auto" &&
                                preset.value !== null &&
                                Math.abs(uiScale.value - preset.value) < 0.01);
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => {
                                  const nextVal = preset.value !== null ? preset.value : 1.0;
                                  setUiScale({ mode: preset.id, value: nextVal });
                                  saveUiScale(preset.id, nextVal);
                                }}
                                style={btnStyle(isSel, "6px 3px")}
                              >
                                <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{preset.label}</span>
                                <span style={{ fontSize: "0.68rem", color: isSel ? "var(--accent-hover)" : "var(--text-muted)" }}>
                                  {preset.badge}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Ползунок точной настройки масштаба */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", width: 65, flexShrink: 0 }}>
                            Точная:
                          </span>
                          <input
                            type="range"
                            min="0.75"
                            max="1.60"
                            step="0.05"
                            value={uiScale.value}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setUiScale({ mode: "custom", value: val });
                              saveUiScale("custom", val);
                            }}
                            style={{ flex: 1, cursor: "pointer", accentColor: "var(--accent)" }}
                          />
                          <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text-secondary)", width: 42, textAlign: "right" }}>
                            {Math.round(uiScale.value * 100)}%
                          </span>
                        </div>
                      </div>

                      {/* ── Блок 3: Прозрачность интерфейса ── */}
                      <div style={{ ...cardStyle, marginBottom: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <SlidersHorizontal size={14} style={{ color: "var(--accent)" }} />
                            <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              Прозрачность интерфейса
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "var(--accent)" }}>
                              {Math.round(uiOpacity * 100)}%
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setUiOpacity(0.88);
                                saveUiOpacity(0.88);
                              }}
                              className="btn btn--secondary btn--sm"
                              style={resetBtnStyle}
                            >
                              <RotateCcw size={11} />
                              <span>88% (Стандарт)</span>
                            </button>
                          </div>
                        </div>

                        {/* Ползунок прозрачности */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", width: 65, flexShrink: 0 }}>
                            Уровень:
                          </span>
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
                            style={{ flex: 1, cursor: "pointer", accentColor: "var(--accent)" }}
                          />
                          <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text-secondary)", width: 42, textAlign: "right" }}>
                            {Math.round(uiOpacity * 100)}%
                          </span>
                        </div>
                      </div>

                      {/* ── Блок 4: Шрифт интерфейса (UI Font) ── */}
                      <div style={{ ...cardStyle, marginBottom: 0, marginTop: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Type size={14} style={{ color: "var(--accent)" }} />
                            <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              Шрифт интерфейса
                            </span>
                          </div>
                          {uiFont !== "inter" && (
                            <button
                              type="button"
                              onClick={() => {
                                setUiFont("inter");
                                saveUiFont("inter");
                              }}
                              className="btn btn--secondary btn--sm"
                              style={resetBtnStyle}
                              title="Сбросить на Inter (Стандарт)"
                            >
                              <RotateCcw size={11} />
                              <span>Inter</span>
                            </button>
                          )}
                        </div>

                        {/* 6 кнопок пресетов шрифтов в компактном исполнении */}
                        <div className="font-presets-grid">
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
                                  ...btnStyle(isSel, "5px 3px"),
                                  fontFamily: `var(--font-${fontPreset.id})`,
                                }}
                                title={`${fontPreset.label} — ${fontPreset.desc}`}
                              >
                                <span
                                  style={{
                                    fontSize: "0.92rem",
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    marginBottom: 2,
                                    color: isSel ? "var(--accent)" : "var(--text-primary)",
                                  }}
                                >
                                  Aa
                                </span>
                                <span style={{ fontSize: "0.72rem", fontWeight: 600, whiteSpace: "nowrap" }}>
                                  {fontPreset.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* ── Блок 5: Стиль панели управления (Визуальный переключатель) ── */}
                      <div style={{ ...cardStyle, marginBottom: 0, marginTop: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <PanelBottom size={14} style={{ color: "var(--accent)" }} />
                            <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              Стиль панели управления
                            </span>
                          </div>
                          {controlBarStyle !== "floating" && (
                            <button
                              type="button"
                              onClick={() => {
                                setControlBarStyle("floating");
                                saveControlBarStyle("floating");
                              }}
                              className="btn btn--secondary btn--sm"
                              style={resetBtnStyle}
                              title="Сбросить на Парящий остров"
                            >
                              <RotateCcw size={11} />
                              <span>Парящая</span>
                            </button>
                          )}
                        </div>

                        {/* Наглядные визуальные карточки плеера */}
                        <div className="visual-bar-selector">
                          {/* 1: Парящий остров */}
                          <div
                            className={`visual-bar-card ${controlBarStyle === "floating" ? "visual-bar-card--active" : ""}`}
                            onClick={() => {
                              setControlBarStyle("floating");
                              saveControlBarStyle("floating");
                            }}
                            title="Парящий остров: скругленная капсула с воздушными отступами от краев окна"
                          >
                            <div className="visual-bar-card__mockup">
                              <div className="visual-bar-card__bar-floating">
                                <div className="visual-bar-card__mock-dot" />
                                <div className="visual-bar-card__mock-line" />
                              </div>
                            </div>
                            <span className="visual-bar-card__label">Парящий остров</span>
                          </div>

                          {/* 2: Пристыкованная плашка */}
                          <div
                            className={`visual-bar-card ${controlBarStyle === "docked" ? "visual-bar-card--active" : ""}`}
                            onClick={() => {
                              setControlBarStyle("docked");
                              saveControlBarStyle("docked");
                            }}
                            title="Пристыкованная плашка: сплошная полоса во всю ширину окна у нижнего края без зазоров"
                          >
                            <div className="visual-bar-card__mockup">
                              <div className="visual-bar-card__bar-docked">
                                <div className="visual-bar-card__mock-dot" />
                                <div className="visual-bar-card__mock-line" />
                              </div>
                            </div>
                            <span className="visual-bar-card__label">Пристыкованная плашка</span>
                          </div>
                        </div>
                      </div>

                      {/* ── Блок 6: Время видео (Позиция и Формат в одну строку) ── */}
                      <div className="time-settings-row">
                        {/* Колонка 1: Позиция времени */}
                        <div style={{ ...cardStyle, marginBottom: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Clock size={14} style={{ color: "var(--accent)" }} />
                              <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                Позиция времени
                              </span>
                            </div>
                            {timePosition !== "timeline_right" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTimePosition("timeline_right");
                                  saveTimePosition("timeline_right");
                                }}
                                className="btn btn--secondary btn--sm"
                                style={resetBtnStyle}
                                title="Сбросить на Справа"
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
                          </div>

                          {/* 3 компактные сегментные кнопки */}
                          <div className="time-pos-compact-grid">
                            {TIME_POSITION_OPTIONS.map((posOption) => {
                              const isSel = timePosition === posOption.id;
                              const shortLabel =
                                posOption.id === "timeline_left"
                                  ? "Слева"
                                  : posOption.id === "timeline_right"
                                  ? "Справа"
                                  : "У звука";
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
                                >
                                  {shortLabel}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Колонка 2: Формат отображения времени */}
                        <div style={{ ...cardStyle, marginBottom: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Timer size={14} style={{ color: "var(--accent)" }} />
                              <span style={{ fontSize: "0.80rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                Формат времени
                              </span>
                            </div>
                            {timeFormat !== "elapsed_total" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTimeFormat("elapsed_total");
                                  saveTimeFormat("elapsed_total");
                                }}
                                className="btn btn--secondary btn--sm"
                                style={resetBtnStyle}
                                title="Сбросить на Прошедшее / Общее"
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
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
                                >
                                  {formatOption.example}
                                </button>
                              );
                            })}
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

              {/* 5. Названия дорожек на панели */}
              <AccordionSection
                isOpen={!!openSections["app_track_names"]}
                onToggle={() => toggleSection("app_track_names")}
                icon={<AudioLines size={16} />}
                title="Названия дорожек на панели"
              >
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={showTrackNames}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setShowTrackNames(val);
                      localStorage.setItem('l-mpv-show-track-names', val ? 'true' : 'false');
                      window.dispatchEvent(new Event('l-mpv-settings-changed'));
                    }}
                  />
                  <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                    Отображать короткое название выбранной аудиодорожки и субтитров рядом с иконками
                  </span>
                </label>
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
                            border: "none",
                            cursor: "pointer",
                            background: isSel ? "var(--accent-glow)" : "transparent",
                            color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                            boxShadow: isSel
                              ? "0 0 12px var(--accent-glow), inset 0 0 0 1px var(--accent)"
                              : "none",
                            transition: "all var(--t-fast) var(--ease-smooth)",
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
                  {ambientSettings.mode === "blur" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                          Радиус аппаратного размытия (Blur Radius)
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: "0.85rem", color: "var(--accent)", fontWeight: 600 }}>
                            {ambientSettings.blur_radius} px
                          </span>
                          <button
                            onClick={() => updateAmbient({ blur_radius: 100 }, true)}
                            className="btn btn--secondary btn--icon btn--sm"
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "var(--radius-sm)",
                            }}
                          >
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="150"
                        step="5"
                        value={ambientSettings.blur_radius}
                        onChange={(e) => updateAmbient({ blur_radius: parseInt(e.target.value, 10) }, false)}
                        style={{ width: "100%", cursor: "pointer", accentColor: "var(--accent)" }}
                      />
                    </div>
                  )}

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
                        <button
                          onClick={() => updateAmbient({ color: getEffectiveAccentColor() }, true)}
                          title="Использовать текущий акцент плеера"
                          style={{
                            padding: "6px 12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                            background: "var(--accent-glass)",
                            color: "var(--accent)",
                            fontSize: "0.78rem",
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          Как в теме ({activeColor === "windows" ? "Windows" : activeColor})
                        </button>

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
                              transition: "all var(--t-fast) var(--ease-smooth)",
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
