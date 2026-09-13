import React, { useState, useEffect } from "react";
import { AudioWaveform, RotateCcw } from "lucide-react";
import { AccordionSection } from "./SettingsModal";
import {
  VisualizerConfig,
  getVisualizerConfig,
  saveVisualizerConfig,
} from "./AudioVisualizer";

interface VisualizerSettingsSectionProps {
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Изолированная секция настроек аудио-визуализатора для окна настроек (SettingsModal).
 */
export const VisualizerSettingsSection: React.FC<VisualizerSettingsSectionProps> = ({
  isOpen,
  onToggle,
}) => {
  const [visualizerConfig, setVisualizerConfig] = useState<VisualizerConfig>(() =>
    getVisualizerConfig()
  );

  useEffect(() => {
    const handleSettingsUpdate = () => {
      setVisualizerConfig(getVisualizerConfig());
    };
    window.addEventListener("l-mpv-settings-changed", handleSettingsUpdate);
    return () => {
      window.removeEventListener("l-mpv-settings-changed", handleSettingsUpdate);
    };
  }, []);

  const updateVisualizer = (partial: Partial<VisualizerConfig>) => {
    setVisualizerConfig((prev) => {
      const updated = { ...prev, ...partial };
      saveVisualizerConfig(updated);
      return updated;
    });
  };

  return (
    <AccordionSection
      isOpen={isOpen}
      onToggle={onToggle}
      icon={<AudioWaveform size={16} />}
      title="Аудио-визуалайзер на панели"
      badge={
        visualizerConfig.enabled ? (
          <span
            style={{
              fontSize: "0.72rem",
              padding: "2px 8px",
              borderRadius: "10px",
              background: "var(--accent-glow, rgba(127, 199, 255, 0.2))",
              color: "var(--accent, #7fc7ff)",
              fontWeight: 600,
              marginLeft: 8,
            }}
          >
            {visualizerConfig.placement === "above_timeline" ? "Над таймлайном" : "В тулбаре"}
          </span>
        ) : (
          <span
            style={{
              fontSize: "0.72rem",
              padding: "2px 8px",
              borderRadius: "10px",
              background: "rgba(255, 255, 255, 0.06)",
              color: "var(--text-muted)",
              fontWeight: 500,
              marginLeft: 8,
            }}
          >
            Выкл
          </span>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 10 }}>
        <span style={{ fontSize: "0.80rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
          Интерактивные пастельные или неоновые аудио-волны (Spectrum / Waveform / Bars) прямо над таймлайном или в тулбаре во время воспроизведения музыки и видео.
        </span>

        {/* Чекбокс включения */}
        <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
          <input
            type="checkbox"
            checked={visualizerConfig.enabled}
            onChange={(e) => updateVisualizer({ enabled: e.target.checked })}
            style={{
              width: 18,
              height: 18,
              accentColor: "var(--accent)",
              cursor: "pointer",
            }}
          />
          <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
            Включить аудио-визуалайзер
          </span>
        </label>

        {visualizerConfig.enabled && (
          <>
            {/* Расположение */}
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                Расположение на панели:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { id: "above_timeline" as const, label: "Над таймлайном", desc: "Полноширинная панорамная волна" },
                  { id: "toolbar" as const, label: "В панели кнопок", desc: "Компактный виджет в тулбаре" },
                ].map((item) => {
                  const isSel = visualizerConfig.placement === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateVisualizer({ placement: item.id })}
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
                        background: isSel ? "var(--accent-glow)" : "rgba(255, 255, 255, 0.04)",
                        color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                        boxShadow: isSel ? "0 0 10px var(--accent-glow), inset 0 0 0 1px var(--accent)" : "none",
                        transition: "all var(--t-fast) var(--ease-smooth)",
                      }}
                    >
                      <span style={{ fontSize: "0.84rem", fontWeight: 600 }}>{item.label}</span>
                      <span style={{ fontSize: "0.72rem", color: isSel ? "var(--accent-hover)" : "var(--text-muted)" }}>
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Стиль визуализации */}
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                Стиль волн и спектра:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { id: "waveform" as const, label: "Плавная волна", desc: "Waveform Безье" },
                  { id: "spectrum" as const, label: "Частотный спектр", desc: "Спектр с пиками" },
                  { id: "bars" as const, label: "Ритм-бары", desc: "Капсулы эквалайзера" },
                ].map((item) => {
                  const isSel = visualizerConfig.mode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateVisualizer({ mode: item.id })}
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
                        background: isSel ? "var(--accent-glow)" : "rgba(255, 255, 255, 0.04)",
                        color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                        boxShadow: isSel ? "0 0 10px var(--accent-glow), inset 0 0 0 1px var(--accent)" : "none",
                        transition: "all var(--t-fast) var(--ease-smooth)",
                      }}
                    >
                      <span style={{ fontSize: "0.84rem", fontWeight: 600 }}>{item.label}</span>
                      <span style={{ fontSize: "0.70rem", color: isSel ? "var(--accent-hover)" : "var(--text-muted)" }}>
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Цветовая схема */}
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                Цветовая палитра:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { id: "accent" as const, label: "Тема плеера", desc: "Акцент и Glow" },
                  { id: "pastel" as const, label: "Пастельная аура", desc: "Лаванда и мята" },
                  { id: "neon" as const, label: "Кибернеон", desc: "Бирюза и фуксия" },
                ].map((item) => {
                  const isSel = visualizerConfig.theme === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateVisualizer({ theme: item.id })}
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
                        background: isSel ? "var(--accent-glow)" : "rgba(255, 255, 255, 0.04)",
                        color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                        boxShadow: isSel ? "0 0 10px var(--accent-glow), inset 0 0 0 1px var(--accent)" : "none",
                        transition: "all var(--t-fast) var(--ease-smooth)",
                      }}
                    >
                      <span style={{ fontSize: "0.84rem", fontWeight: 600 }}>{item.label}</span>
                      <span style={{ fontSize: "0.70rem", color: isSel ? "var(--accent-hover)" : "var(--text-muted)" }}>
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Высота над таймлайном */}
            {visualizerConfig.placement === "above_timeline" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    Высота волн над таймлайном:
                  </span>
                  <span style={{ fontSize: "0.82rem", color: "var(--accent)", fontWeight: 600 }}>
                    {visualizerConfig.height || 22} px
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="range"
                    min="14"
                    max="36"
                    step="2"
                    value={visualizerConfig.height || 22}
                    onChange={(e) => updateVisualizer({ height: Number(e.target.value) })}
                    style={{ flex: 1, cursor: "pointer", accentColor: "var(--accent)" }}
                  />
                  <button
                    type="button"
                    onClick={() => updateVisualizer({ height: 22 })}
                    className="control-btn"
                    title="Сбросить высоту по умолчанию (22px)"
                    style={{
                      width: "auto",
                      height: 26,
                      padding: "0 8px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: "0.74rem",
                    }}
                  >
                    <RotateCcw size={12} />
                    <span>22px</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AccordionSection>
  );
};
