import { useTranslation } from "../../i18n/LanguageContext";
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
import { AccordionSection } from "./AccordionSection";
import {
  optionCardStyle,
  optionResetBtnStyle,
  optionBtnStyle,
  optionSectionDescStyle,
  optionBlockHeaderStyle,
  optionBlockTitleStyle,
  optionBlockTitleTextStyle,
  optionValueBadgeStyle,
} from "./optionCardStyles";
import {
  VisualizerConfig,
  getVisualizerConfig,
  saveVisualizerConfig,
} from "../player/AudioVisualizer";

interface VisualizerSettingsSectionProps {
  isOpen: boolean;
  onToggle: () => void;
}

import {
  PLACEMENT_ITEMS,
  MODE_ITEMS,
  THEME_ITEMS,
  THEME_SWATCH,
} from "./visualizerConstants";
import { VisualizerPreviewCard } from "./VisualizerPreviewCard";

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
      icon={<AudioWaveform size={16} />}
      title={dict.settings.appearance.controlButtons.visualizer}
      badge={
        visualizerConfig.enabled ? (
          <span
            style={{
              fontSize: "0.72rem",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-glow, rgba(127, 199, 255, 0.2))",
              color: "var(--accent, #7fc7ff)",
              fontWeight: 600,
              marginLeft: 8,
            }}
          >
            {visualizerConfig.placement === "above_timeline"
              ? dict.settings.appearance.visualizer.aboveTimeline
              : visualizerConfig.placement === "inside_timeline"
              ? dict.settings.appearance.visualizer.inTimeline
              : dict.settings.appearance.visualizer.inToolbar}
          </span>
        ) : (
          <span
            style={{
              fontSize: "0.72rem",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(255, 255, 255, 0.06)",
              color: "var(--text-muted)",
              fontWeight: 500,
              marginLeft: 8,
            }}
          >
            {dict.settings.appearance.visualizer.off}
          </span>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                style={{ ...optionCardStyle, padding: "8px 12px", gap: 6, ...lockedStyle }}
                inert={controlsLocked}
                aria-disabled={controlsLocked}
              >
                <div style={{ ...optionBlockHeaderStyle, marginBottom: 4 }}>
                  <div style={optionBlockTitleStyle}>
                    <Palette size={14} style={{ color: "var(--accent)" }} />
                    <span style={optionBlockTitleTextStyle}>{dict.settings.appearance.visualizer.palette}</span>
                  </div>
                  <span style={optionValueBadgeStyle}>
                    {dict.settings.appearance.visualizer.themes[visualizerConfig.theme]?.desc || ""}
                  </span>
                </div>
                <div className="player-themes-selector" style={{ padding: "2px" }}>
                  {THEME_ITEMS.map((item) => {
                    const isSel = visualizerConfig.theme === item.id;
                    const itemLabel = dict.settings.appearance.visualizer.themes[item.id]?.label || item.label;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateVisualizer({ theme: item.id })}
                        className="player-theme-btn"
                        aria-label={itemLabel}
                        style={{
                          height: 30,
                          padding: isSel ? "0 12px 0 5px" : "0 5px",
                          border: isSel
                            ? "1.5px solid var(--accent)"
                            : "1.5px solid rgba(255, 255, 255, 0.10)",
                          background: isSel
                            ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)"
                            : "rgba(255, 255, 255, 0.04)",
                          color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                          boxShadow: isSel
                            ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px var(--accent)"
                            : "none",
                        }}
                      >
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: THEME_SWATCH[item.id],
                            border: isSel
                              ? "1.5px solid rgba(255, 255, 255, 0.40)"
                              : "1.5px solid rgba(255, 255, 255, 0.22)",
                            boxShadow: isSel
                              ? "0 0 8px rgba(255, 255, 255, 0.25), 0 1px 4px rgba(0, 0, 0, 0.45)"
                              : "0 1px 3px rgba(0, 0, 0, 0.35)",
                            flexShrink: 0,
                            transition:
                              "border-color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
                          }}
                        />
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            maxWidth: isSel ? 140 : 0,
                            opacity: isSel ? 1 : 0,
                            marginLeft: isSel ? 7 : 0,
                            transform: isSel ? "translateX(0)" : "translateX(-6px)",
                            transition:
                              "max-width 0.25s cubic-bezier(0.2, 1.15, 0.3, 1), opacity 0.2s ease, transform 0.25s cubic-bezier(0.2, 1.15, 0.3, 1), margin-left 0.25s cubic-bezier(0.2, 1.15, 0.3, 1)",
                            pointerEvents: isSel ? "auto" : "none",
                          }}
                        >
                          <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                            {itemLabel}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Карточка переключения: кликабельная иконка вкл/выкл */}
              <div style={{ ...optionCardStyle, alignItems: "center", justifyContent: "center", height: "100%", boxSizing: "border-box", padding: "6px 10px" }}>
                <button
                  type="button"
                  onClick={() => updateVisualizer({ enabled: !visualizerConfig.enabled })}
                  className="viz-power-btn"
                  title={visualizerConfig.enabled ? dict.settings.appearance.visualizer.toggleDisableTitle : dict.settings.appearance.visualizer.toggleEnableTitle}
                  aria-label={visualizerConfig.enabled ? dict.settings.appearance.visualizer.toggleOff : dict.settings.appearance.visualizer.toggleOn}
                  aria-pressed={visualizerConfig.enabled}
                  style={{
                    color: visualizerConfig.enabled ? "var(--accent)" : "var(--text-muted)",
                    transition: "color var(--t-fast) var(--ease-smooth)",
                  }}
                >
                  <Power size={20} />
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
              <div style={{ ...optionCardStyle, height: "100%", boxSizing: "border-box" }}>
                <div style={optionBlockHeaderStyle}>
                  <div style={optionBlockTitleStyle}>
                    <Monitor size={14} style={{ color: "var(--accent)" }} />
                    <span style={optionBlockTitleTextStyle}>{dict.settings.appearance.visualizer.placement}</span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateRows: "repeat(3, 1fr)", gap: 8, flex: 1 }}>
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
                        <span style={{ fontSize: "0.80rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {itemLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ ...optionCardStyle, height: "100%", boxSizing: "border-box" }}>
                <div style={optionBlockHeaderStyle}>
                  <div style={optionBlockTitleStyle}>
                    <Layers size={14} style={{ color: "var(--accent)" }} />
                    <span style={optionBlockTitleTextStyle}>{dict.settings.appearance.visualizer.style}</span>
                  </div>
                  <span style={optionValueBadgeStyle}>
                    {dict.settings.appearance.visualizer.modes[visualizerConfig.mode]?.label || visualizerConfig.mode}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gridAutoRows: "1fr", gap: 8, flex: 1 }}>
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
                        <span style={{ fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
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
                  aria-disabled={!heightActive}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, lineHeight: 1 }}>
                    <Ruler size={15} style={{ color: "var(--accent)" }} />
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1, whiteSpace: "nowrap" }}>
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
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, lineHeight: 1 }}>
                    <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "var(--accent)", minWidth: 44, textAlign: "left", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
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
                      title={dict.settings.appearance.visualizer.reset22}
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
