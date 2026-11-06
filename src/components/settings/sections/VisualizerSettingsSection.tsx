import { SettingsIcon } from "../components/SettingsIcon";
import { useTranslation } from "../../../i18n/LanguageContext";
import React, { useState, useEffect, useRef } from "react";
import {
  AudioWaveform,
  RotateCcw,
  Power,
  Monitor,
  Layers,
  Palette,
  Ruler,
} from "lucide-react";
import { AccordionSection } from "../components/AccordionSection";
import {
  optionCardStyle,
  optionResetBtnStyle,
  optionBtnStyle,
  optionSectionDescStyle,
  optionBlockHeaderStyle,
  optionBlockTitleStyle,
  optionBlockTitleTextStyle,
  optionValueBadgeStyle,
} from "../components/optionCardStyles";
import {
  VisualizerConfig,
  DEFAULT_VISUALIZER_CONFIG,
  getVisualizerConfig,
  saveVisualizerConfig,
} from "../../player/AudioVisualizer";

interface VisualizerSettingsSectionProps {
  isOpen: boolean;
  onToggle: () => void;
}

import {
  PLACEMENT_ITEMS,
  MODE_ITEMS,
  THEME_ITEMS,
  THEME_SWATCH,
} from "../lib/visualizerConstants";
import { VisualizerPreviewCard } from "../components/VisualizerPreviewCard";

/**
 * Изолированная секция настроек аудио-визуализатора для окна настроек (SettingsModal).
 */
export const VisualizerSettingsSection: React.FC<VisualizerSettingsSectionProps> = ({
  isOpen,
  onToggle,
}) => {
  const { dict } = useTranslation();
  const [visualizerConfig, setVisualizerConfig] = useState<VisualizerConfig>(() =>
    getVisualizerConfig()
  );
  const visualizerConfigRef = useRef(visualizerConfig);
  visualizerConfigRef.current = visualizerConfig;

  useEffect(() => {
    const handleSettingsUpdate = () => {
      const next = getVisualizerConfig();
      visualizerConfigRef.current = next;
      setVisualizerConfig(next);
    };
    window.addEventListener("l-mpv-settings-changed", handleSettingsUpdate);
    return () => {
      window.removeEventListener("l-mpv-settings-changed", handleSettingsUpdate);
    };
  }, []);

  const updateVisualizer = (partial: Partial<VisualizerConfig>) => {
    const updated = { ...visualizerConfigRef.current, ...partial };
    visualizerConfigRef.current = updated;
    setVisualizerConfig(updated);
    saveVisualizerConfig(updated);
  };

  // Заблокированные (серые, некликабельные) контролы вместо скрытия:
  // раскладка не прыгает при вкл/выкл, окно настроек стабильно.
  const controlsLocked = !visualizerConfig.enabled;
  const lockedStyle: React.CSSProperties = {
    opacity: controlsLocked ? 0.45 : 1,
    pointerEvents: controlsLocked ? "none" : "auto",
    filter: controlsLocked ? "saturate(0.5)" : "none",
    transition: "opacity var(--t-fast) var(--ease-smooth), filter var(--t-fast) var(--ease-smooth)",
  };

  return (
    <AccordionSection
      isOpen={isOpen}
      onToggle={onToggle}
      icon={<AudioWaveform size={18} />}
      title={dict.settings.appearance.controlButtons.visualizer}
    >
      <div className="col col-gap-5">
        <span style={optionSectionDescStyle}>
          {dict.settings.appearance.visualizer.desc}
        </span>

        {/* Интерактивный предпросмотр аудио-визуализатора */}
        <VisualizerPreviewCard config={visualizerConfig} isVisible={isOpen} />


        {/* Сетки всегда смонтированы (не прыгают при вкл/выкл);
            при выкл. контролы сереют через lockedStyle + inert */}
        <>
            {/* Верхний ряд: палитра (широкая) + карточка включения */}
            <div className="viz-grid-top">
              <div
                style={{ ...optionCardStyle, padding: "8px 12px", gap: "var(--space-3)", ...lockedStyle }}
                inert={controlsLocked}
                aria-disabled={controlsLocked} className="theme-card"
                >
                <div style={{ ...optionBlockHeaderStyle, marginBottom: "var(--space-2)" }}>
                  <div style={optionBlockTitleStyle}>
                    <SettingsIcon><Palette size={14} className="t-accent" /></SettingsIcon>
                    <span style={optionBlockTitleTextStyle}>{dict.settings.appearance.visualizer.palette}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={optionValueBadgeStyle}>
                      {dict.settings.appearance.visualizer.themes[visualizerConfig.theme]?.label ||
                        THEME_ITEMS.find((t) => t.id === visualizerConfig.theme)?.label ||
                        "Тема плеера"}
                    </span>
                    {visualizerConfig.theme !== DEFAULT_VISUALIZER_CONFIG.theme && (
                      <button
                        type="button"
                        onClick={() =>
                          updateVisualizer({
                            theme: DEFAULT_VISUALIZER_CONFIG.theme,
                          })
                        }
                        className="btn btn--secondary btn--sm"
                        style={optionResetBtnStyle}
                        title={dict.settings.appearance.colorScheme.resetTheme}
                        aria-label="Сбросить палитру спектра"
                      >
                        <RotateCcw size={11} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="player-themes-selector" style={{ padding: "var(--space-2) 2px" }}>
                  {THEME_ITEMS.map((item) => {
                    const isSel = visualizerConfig.theme === item.id;
                    const itemLabel =
                      dict.settings.appearance.visualizer.themes[item.id]?.label || item.label;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateVisualizer({ theme: item.id })}
                        className={`color-circle ${isSel ? "color-circle--active" : ""}`}
                        title={itemLabel}
                        aria-label={itemLabel}
                        style={{
                          background: THEME_SWATCH[item.id],
                          border: isSel
                            ? "2px solid #ffffff"
                            : "1.5px solid rgba(255, 255, 255, 0.18)",
                          boxShadow: isSel
                            ? "0 0 14px rgba(255, 255, 255, 0.4), 0 2px 6px rgba(0, 0, 0, 0.4)"
                            : "none",
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Карточка переключения: кликабельная иконка вкл/выкл */}
              <div style={{ ...optionCardStyle, alignItems: "center", justifyContent: "center", height: "100%", boxSizing: "border-box", padding: "6px 10px" }} className="theme-card">
                <button
                  type="button"
                  onClick={() => updateVisualizer({ enabled: !visualizerConfig.enabled })}
                  className={`viz-power-btn ${
                    visualizerConfig.enabled ? "viz-power-btn--active" : ""
                  }`}
                  title={visualizerConfig.enabled ? dict.settings.appearance.visualizer.toggleDisableTitle : dict.settings.appearance.visualizer.toggleEnableTitle}
                  aria-label={visualizerConfig.enabled ? dict.settings.appearance.visualizer.toggleOff : dict.settings.appearance.visualizer.toggleOn}
                  aria-pressed={visualizerConfig.enabled}
                >
                  <Power size={18} />
                </button>
              </div>
            </div>

            {/* Нижний ряд: расположение (уже) + стили (шире) */}
            <div
              className="viz-grid-main"
              style={lockedStyle}
              inert={controlsLocked}
              aria-disabled={controlsLocked}
              >
              <div style={{ ...optionCardStyle, height: "100%", boxSizing: "border-box" }} className="theme-card">
                <div style={optionBlockHeaderStyle}>
                  <div style={optionBlockTitleStyle}>
                    <SettingsIcon><Monitor size={14} className="t-accent" /></SettingsIcon>
                    <span style={optionBlockTitleTextStyle}>{dict.settings.appearance.visualizer.placement}</span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateRows: "repeat(3, 1fr)", gap: "var(--space-4)", flex: 1 }}>
                  {PLACEMENT_ITEMS.map((item) => {
                    const isSel = visualizerConfig.placement === item.id;
                    const itemLabel = dict.settings.appearance.visualizer.placements[item.id]?.label || item.label;
                    const itemDesc = dict.settings.appearance.visualizer.placements[item.id]?.desc || item.desc;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateVisualizer({ placement: item.id })}
                        style={{ ...optionBtnStyle(isSel, "6px 8px"), height: "100%", minHeight: 38, boxSizing: "border-box" }}
                        title={itemDesc}
                        >
                        <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {itemLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ ...optionCardStyle, height: "100%", boxSizing: "border-box" }} className="theme-card">
                <div style={optionBlockHeaderStyle}>
                  <div style={optionBlockTitleStyle}>
                    <SettingsIcon><Layers size={14} className="t-accent" /></SettingsIcon>
                    <span style={optionBlockTitleTextStyle}>{dict.settings.appearance.visualizer.style}</span>
                  </div>
                  <span style={optionValueBadgeStyle}>
                    {dict.settings.appearance.visualizer.modes[visualizerConfig.mode]?.label || visualizerConfig.mode}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gridAutoRows: "1fr", gap: "var(--space-4)", flex: 1 }}>
                  {MODE_ITEMS.map((item) => {
                    const isSel = visualizerConfig.mode === item.id;
                    const itemLabel = dict.settings.appearance.visualizer.modes[item.id]?.label || item.label;
                    const itemDesc = dict.settings.appearance.visualizer.modes[item.id]?.desc || item.desc;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateVisualizer({ mode: item.id })}
                        style={{ ...optionBtnStyle(isSel, "6px 6px"), height: "100%", minHeight: 38, boxSizing: "border-box" }}
                        title={itemDesc}
                        >
                        <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                          {itemLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* {dict.settings.appearance.visualizer.height}: всегда смонтирована (не прыгает окно),
                активна только для расположения над таймлайном */}
            {(() => {
              const hMin = 14;
              const hMax = 36;
              const hDef = 22;
              const hVal = visualizerConfig.height || hDef;
              const hPct = Math.round(((hVal - hMin) / (hMax - hMin)) * 100);
              const isDefault = hVal === hDef;
              const heightActive = visualizerConfig.enabled && visualizerConfig.placement === "above_timeline";
              return (
                <div
                  style={{
                    ...optionCardStyle,
                    flexDirection: "row",
                    alignItems: "center",
                    padding: "10px 14px",
                    gap: 14,
                    opacity: heightActive ? 1 : 0.45,
                    pointerEvents: heightActive ? "auto" : "none",
                    filter: heightActive ? "none" : "saturate(0.5)",
                    transition: "opacity var(--t-fast) var(--ease-smooth), filter var(--t-fast) var(--ease-smooth)",
                  }}
                  inert={!heightActive}
                  aria-disabled={!heightActive} className="theme-card"
                  >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexShrink: 0, lineHeight: 1 }}>
                    <Ruler size={15} className="t-accent" />
                    <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1, whiteSpace: "nowrap" }}>
                      {dict.settings.appearance.visualizer.height}
                    </span>
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0, height: 20 }}>
                    <input
                      type="range"
                      min={hMin}
                      max={hMax}
                      step={2}
                      value={hVal}
                      onChange={(e) => updateVisualizer({ height: Number(e.target.value) })}
                      className="ui-premium-slider"
                      style={{
                        "--track-fill": `linear-gradient(to right, var(--accent) 0%, var(--accent) ${hPct}%, rgba(255, 255, 255, 0.12) ${hPct}%, rgba(255, 255, 255, 0.12) 100%)`,
                      } as React.CSSProperties}
                      aria-label={dict.settings.appearance.visualizer.heightAboveTimelineAria}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexShrink: 0, lineHeight: 1 }}>
                    <span style={{ fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--accent-text)", minWidth: 44, textAlign: "left", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                      {hVal} px
                    </span>
                    <button
                      type="button"
                      onClick={() => updateVisualizer({ height: hDef })}
                      className="btn btn--secondary btn--sm"
                      style={{
                        ...optionResetBtnStyle,
                        opacity: isDefault ? 0 : 1,
                        visibility: isDefault ? "hidden" : "visible",
                        pointerEvents: isDefault ? "none" : "auto",
                        transform: isDefault ? "scale(0.85)" : "scale(1)",
                        transition: "opacity var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth), visibility var(--t-fast) var(--ease-smooth)",
                      }}

                      tabIndex={isDefault ? -1 : 0}
                      >
                      <RotateCcw size={11} />
                    </button>
                  </div>
                </div>
              );
            })()}


          </>
      </div>
    </AccordionSection>
  );
};
