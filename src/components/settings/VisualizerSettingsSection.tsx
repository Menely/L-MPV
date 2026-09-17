import React, { useState, useEffect, useRef } from "react";
import { AudioWaveform, RotateCcw, RotateCw, Play } from "lucide-react";
import { AccordionSection } from "../SettingsModal";
import {
  VisualizerConfig,
  VisualizerMode,
  VisualizerTheme,
  VisualizerAnimState,
  createInitialAnimState,
  getVisualizerConfig,
  getVisualizerThemeColors,
  renderVisualizerFrame,
  saveVisualizerConfig,
} from "../AudioVisualizer";

interface VisualizerSettingsSectionProps {
  isOpen: boolean;
  onToggle: () => void;
}

const MODE_LABELS: Record<VisualizerMode, string> = {
  waveform: "Плавная волна",
  spectrum: "Частотный спектр",
  bars: "Ритм-бары",
  matrix: "LED-матрица",
  ribbon: "Жидкая лента",
  particles: "Звездная пыль",
  circular: "Радиальный радар",
  blob: "Плазменная сфера",
  strings: "Резонанс струн",
};

const THEME_LABELS: Record<VisualizerTheme, string> = {
  accent: "Тема плеера",
  pastel: "Пастельная аура",
  neon: "Кибернеон",
  sunset: "Огненный закат",
  aurora: "Северное сияние",
};

const PLACEMENT_LABELS: Record<string, string> = {
  above_timeline: "Над таймлайном",
  inside_timeline: "В таймлайне",
  toolbar: "В панели кнопок",
  off: "Отключен",
};

/**
 * Интерактивная карточка предпросмотра аудио-визуализатора в стиле превью неонового свечения.
 */
const VisualizerPreviewCard: React.FC<{ config: VisualizerConfig; isVisible: boolean }> = ({
  config,
  isVisible,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animStateRef = useRef<VisualizerAnimState>(createInitialAnimState());

  useEffect(() => {
    if (!isVisible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number;
    let lastTime = performance.now();

    const updateSize = () => {
      if (!canvas || !canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(20, Math.floor(rect.width));
      const h = Math.max(12, Math.floor(rect.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    if (canvas.parentElement) {
      ro.observe(canvas.parentElement);
    }

    const render = (time: number) => {
      // Энергосбережение: пропуск отрисовки если документ или вкладка скрыта
      if (document.hidden) {
        animId = requestAnimationFrame(render);
        return;
      }

      const dt = Math.min(64, time - lastTime) / 1000;
      lastTime = time;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        if (config.enabled) {
          // Реалистичный синтез живого динамичного ритма для предпросмотра
          const t = time / 1000;
          const spectrum = new Array(32);
          const beat = Math.pow(Math.sin(t * 3.4), 6) * 0.55 + 0.35;
          for (let i = 0; i < 32; i++) {
            const wave = Math.sin(t * 4.8 + i * 0.42) * 0.25 + Math.cos(t * 2.6 - i * 0.2) * 0.2;
            const rollOff = Math.exp(-i / 18);
            spectrum[i] = Math.max(0.06, Math.min(1.0, (beat * rollOff + wave + 0.32) * 0.9));
          }

          renderVisualizerFrame(
            ctx,
            w,
            h,
            config,
            animStateRef.current,
            spectrum,
            dt,
            {
              isAudible: true,
              isPaused: false,
              speed: 1.0,
            }
          );
        }

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [config, isVisible]);

  const themeColors = getVisualizerThemeColors(config.theme);

  const previewHeight = config.placement === "above_timeline"
    ? Math.min(26, Math.max(16, (config.height || 22) * 0.85))
    : config.placement === "toolbar"
    ? (config.mode === "circular" || config.mode === "blob" ? 28 : 20)
    : 16;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        marginBottom: 4,
        background: "rgba(0, 0, 0, 0.35)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--text-primary)" }}>
            Предпросмотр:
          </span>
          <span
            style={{
              fontSize: "0.82rem",
              fontWeight: 700,
              color: !config.enabled ? "var(--text-muted)" : themeColors.primary,
              textShadow: !config.enabled ? "none" : `0 0 10px ${themeColors.glow}`,
              transition: "all var(--t-fast) var(--ease-smooth)",
            }}
          >
            {!config.enabled
              ? "Off (Выключен)"
              : `${MODE_LABELS[config.mode] || config.mode} • ${THEME_LABELS[config.theme] || config.theme}`}
          </span>
        </div>
        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
          {!config.enabled
            ? "Визуализатор отключен. Включите его ниже для отображения живого спектра на панели плеера"
            : `${PLACEMENT_LABELS[config.placement] || "На панели плеера"} • ${
                config.placement === "above_timeline"
                  ? `Панорамная волна над полосой прогресса (${config.height || 22}px)`
                  : config.placement === "inside_timeline"
                  ? "Интеграция внутрь таймлайна (SoundCloud Style)"
                  : "Компактный аудиоплеер-виджет в строке кнопок"
              }`}
        </span>
      </div>

      {/* Миниатюрная панель плеера с предпросмотром */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-pill, rgba(13, 17, 23, 0.88))",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid var(--border-pill)",
          borderRadius: "var(--radius-controls, 16px)",
          padding: "8px 14px 10px",
          boxShadow: "var(--shadow-pill, 0 4px 20px rgba(0, 0, 0, 0.45))",
          width: "210px",
          flexShrink: 0,
          gap: 6,
          boxSizing: "border-box",
          transition: "border-radius var(--t-spring) var(--ease-spring-smooth)",
        }}
      >
        {/* Расположение 1: Над таймлайном */}
        {config.enabled && config.placement === "above_timeline" && (
          <div
            style={{
              width: "100%",
              height: `${previewHeight}px`,
              borderRadius: "var(--radius-xs, 4px)",
              overflow: "hidden",
              display: "flex",
            }}
          >
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
          </div>
        )}

        {/* Расположение 2: В таймлайне (SoundCloud Style) */}
        {config.enabled && config.placement === "inside_timeline" ? (
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "18px",
              background: "rgba(255, 255, 255, 0.08)",
              borderRadius: "var(--radius-xs, 4px)",
              overflow: "hidden",
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                display: "block",
              }}
            />
            {/* Наложение прогресса */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "55%",
                background: "var(--accent-glow, rgba(127, 199, 255, 0.2))",
                borderRight: "2px solid var(--accent)",
                pointerEvents: "none",
              }}
            />
          </div>
        ) : (
          /* Обычная полоска таймлайна (когда визуализатор не внутри таймлайна) */
          <div
            style={{
              position: "relative",
              width: "100%",
              height: 3,
              background: "rgba(255, 255, 255, 0.15)",
              borderRadius: 3,
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
                background: config.enabled ? "var(--accent)" : "rgba(255, 255, 255, 0.4)",
                borderRadius: 3,
                boxShadow: config.enabled ? "0 0 6px var(--accent-glow)" : "none",
                transition: "all var(--t-fast) var(--ease-smooth)",
              }}
            />
          </div>
        )}

        {/* Строка кнопок управления */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            marginTop: 2,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <RotateCcw
              size={13}
              style={{
                color: "var(--text-secondary)",
                opacity: config.enabled ? 0.85 : 0.4,
                cursor: "default",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: config.enabled ? "var(--accent)" : "var(--text-muted)",
                cursor: "default",
              }}
            >
              <Play
                size={18}
                fill="currentColor"
                style={{
                  filter: config.enabled ? "drop-shadow(0 0 5px var(--accent-glow))" : "none",
                  transition: "all var(--t-fast) var(--ease-smooth)",
                }}
              />
            </div>
            <RotateCw
              size={13}
              style={{
                color: "var(--text-secondary)",
                opacity: config.enabled ? 0.85 : 0.4,
                cursor: "default",
              }}
            />
          </div>

          {/* Расположение 3: Виджет в тулбаре */}
          {config.enabled && config.placement === "toolbar" ? (
            <div
              style={{
                width: "68px",
                height: `${previewHeight}px`,
                borderRadius: "4px",
                overflow: "hidden",
                display: "flex",
                background: "rgba(0, 0, 0, 0.25)",
                border: "1px solid var(--border)",
              }}
            >
              <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
            </div>
          ) : (
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", opacity: 0.6 }}>
              01:24 / 03:45
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-glow, rgba(127, 199, 255, 0.2))",
              color: "var(--accent, #7fc7ff)",
              fontWeight: 600,
              marginLeft: 8,
            }}
          >
            {visualizerConfig.placement === "above_timeline"
              ? "Над таймлайном"
              : visualizerConfig.placement === "inside_timeline"
              ? "В таймлайне"
              : "В тулбаре"}
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
            Выкл
          </span>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 10 }}>
        <span style={{ fontSize: "0.80rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
          Интерактивные пастельные, неоновые или закатные аудио-волны и спектральные эффекты над таймлайном, в тулбаре или прямо внутри полосы прогресса (SoundCloud Style).
        </span>

        {/* Интерактивный предпросмотр аудио-визуализатора */}
        <VisualizerPreviewCard config={visualizerConfig} isVisible={isOpen} />

        {/* Чекбокс включения */}
        <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
          <input
            type="checkbox"
            className="ui-checkbox"
            checked={visualizerConfig.enabled}
            onChange={(e) => updateVisualizer({ enabled: e.target.checked })}
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[
                  { id: "above_timeline" as const, label: "Над таймлайном", desc: "Панорамная волна" },
                  { id: "inside_timeline" as const, label: "В таймлайне", desc: "SoundCloud стиль" },
                  { id: "toolbar" as const, label: "В панели кнопок", desc: "Компактный виджет" },
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
                      <span style={{ fontSize: "0.70rem", color: isSel ? "var(--accent-hover)" : "var(--text-muted)" }}>
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Стиль визуализации (9 режимов) */}
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                Стиль визуализации (9 режимов):
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[
                  { id: "waveform" as const, label: "Плавная волна", desc: "Waveform Безье" },
                  { id: "spectrum" as const, label: "Частотный спектр", desc: "Спектр с пиками" },
                  { id: "bars" as const, label: "Ритм-бары", desc: "Капсулы эквалайзера" },
                  { id: "matrix" as const, label: "LED-матрица", desc: "Диодные столбики" },
                  { id: "ribbon" as const, label: "Жидкая лента", desc: "Шелковая волна" },
                  { id: "particles" as const, label: "Звездная пыль", desc: "Салют аудио-частиц" },
                  { id: "circular" as const, label: "Радиальный радар", desc: "Кольцевой пульсар" },
                  { id: "blob" as const, label: "Плазменная сфера", desc: "Органическая капля" },
                  { id: "strings" as const, label: "Резонанс струн", desc: "3 осциллографа" },
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

            {/* Цветовая схема (5 палитр) */}
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                Цветовая палитра:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8 }}>
                {[
                  { id: "accent" as const, label: "Тема плеера", desc: "Акцент и Glow" },
                  { id: "pastel" as const, label: "Пастельная аура", desc: "Лаванда и мята" },
                  { id: "neon" as const, label: "Кибернеон", desc: "Бирюза и фуксия" },
                  { id: "sunset" as const, label: "Огненный закат", desc: "Янтарь и рубин" },
                  { id: "aurora" as const, label: "Северное сияние", desc: "Изумруд и бирюза" },
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
                    className="btn btn--secondary btn--sm"
                    style={{
                      height: 26,
                      padding: "0 8px",
                      borderRadius: "var(--radius-sm)",
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
