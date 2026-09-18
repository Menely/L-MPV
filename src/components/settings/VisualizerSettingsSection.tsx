import React, { useState, useEffect, useRef } from "react";
import { AudioWaveform, RotateCcw, RotateCw, Play, Power, Monitor, Layers, Palette, Ruler } from "lucide-react";
import { AccordionSection } from "../SettingsModal";
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
  ocean: "Глубокий океан",
  crimson: "Малиновый",
  mint: "Мятная волна",
  violet: "Ультрафиолет",
  gold: "Золотой песок",
};

const PLACEMENT_LABELS: Record<string, string> = {
  above_timeline: "Над таймлайном",
  inside_timeline: "В таймлайне",
  toolbar: "В панели кнопок",
  off: "Отключен",
};

const PLACEMENT_ITEMS = [
  { id: "above_timeline" as const, label: "Над таймлайном", desc: "Панорамная волна" },
  { id: "inside_timeline" as const, label: "В таймлайне", desc: "SoundCloud стиль" },
  { id: "toolbar" as const, label: "В панели кнопок", desc: "Компактный виджет" },
];

const MODE_ITEMS = [
  { id: "waveform" as const, label: "Плавная волна", desc: "Waveform Безье" },
  { id: "spectrum" as const, label: "Частотный спектр", desc: "Спектр с пиками" },
  { id: "bars" as const, label: "Ритм-бары", desc: "Капсулы эквалайзера" },
  { id: "matrix" as const, label: "LED-матрица", desc: "Диодные столбики" },
  { id: "ribbon" as const, label: "Жидкая лента", desc: "Шелковая волна" },
  { id: "particles" as const, label: "Звездная пыль", desc: "Салют аудио-частиц" },
  { id: "circular" as const, label: "Радиальный радар", desc: "Кольцевой пульсар" },
  { id: "blob" as const, label: "Плазменная сфера", desc: "Органическая капля" },
  { id: "strings" as const, label: "Резонанс струн", desc: "3 осциллографа" },
];

const THEME_ITEMS = [
  { id: "accent" as const, label: "Тема плеера", desc: "Акцент и Glow" },
  { id: "pastel" as const, label: "Пастельная аура", desc: "Лаванда и мята" },
  { id: "neon" as const, label: "Кибернеон", desc: "Бирюза и фуксия" },
  { id: "sunset" as const, label: "Огненный закат", desc: "Янтарь и рубин" },
  { id: "aurora" as const, label: "Северное сияние", desc: "Изумруд и бирюза" },
  { id: "ocean" as const, label: "Глубокий океан", desc: "Синева и глубина" },
  { id: "crimson" as const, label: "Малиновый", desc: "Рубин и роза" },
  { id: "mint" as const, label: "Мятная волна", desc: "Мята и теал" },
  { id: "violet" as const, label: "Ультрафиолет", desc: "Фиолет и маджента" },
  { id: "gold" as const, label: "Золотой песок", desc: "Золото и янтарь" },
];

/** Градиент-индикатор палитры для кнопок выбора темы. */
const THEME_SWATCH: Record<VisualizerTheme, string> = {
  accent: "var(--accent)",
  pastel: "linear-gradient(135deg, #c4b5fd 0%, #6ee7b7 55%, #fbcfe8 100%)",
  neon: "linear-gradient(135deg, #00E5FF 0%, #FF2A5F 55%, #FFE600 100%)",
  sunset: "linear-gradient(135deg, #FFB300 0%, #FF5722 55%, #E91E63 100%)",
  aurora: "linear-gradient(135deg, #00F5D4 0%, #00BB77 55%, #0077B6 100%)",
  ocean: "linear-gradient(135deg, #38BDF8 0%, #0EA5E9 55%, #6366F1 100%)",
  crimson: "linear-gradient(135deg, #FB7185 0%, #E11D48 55%, #881337 100%)",
  mint: "linear-gradient(135deg, #5EEAD4 0%, #10B981 55%, #065F46 100%)",
  violet: "linear-gradient(135deg, #A78BFA 0%, #8B5CF6 55%, #5B21B6 100%)",
  gold: "linear-gradient(135deg, #FDE68A 0%, #F59E0B 55%, #92400E 100%)",
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

  // Фиксированная сцена 30px: canvas любого режима/расположения центрируется
  // внутри, карточка превью не меняет высоту -> окно настроек не скачет.
  const previewHeight =
    config.placement === "above_timeline"
      ? Math.min(26, Math.max(16, (config.height || 22) * 0.85))
      : 16;
  const TOOLBAR_WIDGET_H = 26;

  return (
    <div
      style={{
        ...optionCardStyle,
        flexDirection: "row",
        alignItems: "center",
        padding: "10px 14px",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 180, minHeight: 56, justifyContent: "center" }}>
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
              transition: "color var(--t-fast) var(--ease-smooth), text-shadow var(--t-fast) var(--ease-smooth)",
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
        }}
      >
        {/* Фиксированная сцена таймлайна: все расположения центрируются в 30px */}
        <div
          style={{
            width: "100%",
            height: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
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
                transition: "background-color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
              }}
            />
          </div>
        )}
        </div>

        {/* Строка кнопок управления: фиксированная высота */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            height: 28,
            flexShrink: 0,
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
                  transition: "filter var(--t-fast) var(--ease-smooth), color var(--t-fast) var(--ease-smooth)",
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

          {/* Расположение 3: Виджет в тулбаре (фиксированная высота) */}
          {config.enabled && config.placement === "toolbar" ? (
            <div
              style={{
                width: "68px",
                height: `${TOOLBAR_WIDGET_H}px`,
                borderRadius: "4px",
                overflow: "hidden",
                display: "flex",
                background: "rgba(0, 0, 0, 0.25)",
                border: "1px solid var(--border)",
                flexShrink: 0,
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
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={optionSectionDescStyle}>
          Интерактивные пастельные, неоновые или закатные аудио-волны и спектральные эффекты над таймлайном, в тулбаре или прямо внутри полосы прогресса (SoundCloud Style).
        </span>

        {/* Интерактивный предпросмотр аудио-визуализатора */}
        <VisualizerPreviewCard config={visualizerConfig} isVisible={isOpen} />

        {/* Включение: компактная строка, когда выключено */}
        {!visualizerConfig.enabled && (
          <label style={{ ...optionCardStyle, flexDirection: "row", alignItems: "center", padding: "10px 14px", gap: 10, cursor: "pointer", userSelect: "none" }}>
            <Power size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Включить аудио-визуалайзер
              </span>
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                Живой спектр звука на панели плеера во время воспроизведения
              </span>
            </div>
            <input
              type="checkbox"
              className="ui-checkbox"
              checked={visualizerConfig.enabled}
              onChange={(e) => updateVisualizer({ enabled: e.target.checked })}
              aria-label="Включить аудио-визуалайзер"
            />
          </label>
        )}

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
                    <span style={optionBlockTitleTextStyle}>Цветовая палитра</span>
                  </div>
                  <span style={optionValueBadgeStyle}>
                    {THEME_ITEMS.find((t) => t.id === visualizerConfig.theme)?.desc || ""}
                  </span>
                </div>
                <div className="player-themes-selector" style={{ padding: "2px" }}>
                  {THEME_ITEMS.map((item) => {
                    const isSel = visualizerConfig.theme === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateVisualizer({ theme: item.id })}
                        className="player-theme-btn"
                        title={`${item.label} — ${item.desc}`}
                        aria-label={item.label}
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
                            {item.label}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Карточка включения: только кликабельная иконка */}
              <div style={{ ...optionCardStyle, alignItems: "center", justifyContent: "center", height: "100%", boxSizing: "border-box", padding: "6px 10px" }}>
                <button
                  type="button"
                  onClick={() => updateVisualizer({ enabled: false })}
                  className="viz-power-btn"
                  title="Выключить визуализатор"
                  aria-label="Выключить аудио-визуалайзер"
                  aria-pressed={visualizerConfig.enabled}
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
              <div style={optionCardStyle}>
                <div style={optionBlockHeaderStyle}>
                  <div style={optionBlockTitleStyle}>
                    <Monitor size={14} style={{ color: "var(--accent)" }} />
                    <span style={optionBlockTitleTextStyle}>Расположение</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {PLACEMENT_ITEMS.map((item) => {
                    const isSel = visualizerConfig.placement === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateVisualizer({ placement: item.id })}
                        style={optionBtnStyle(isSel, "8px 6px")}
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

              <div style={optionCardStyle}>
                <div style={optionBlockHeaderStyle}>
                  <div style={optionBlockTitleStyle}>
                    <Layers size={14} style={{ color: "var(--accent)" }} />
                    <span style={optionBlockTitleTextStyle}>Стиль визуализации</span>
                  </div>
                  <span style={optionValueBadgeStyle}>
                    {MODE_LABELS[visualizerConfig.mode] || visualizerConfig.mode}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                  {MODE_ITEMS.map((item) => {
                    const isSel = visualizerConfig.mode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateVisualizer({ mode: item.id })}
                        style={optionBtnStyle(isSel, "8px 6px")}
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
            </div>

            {/* Высота волн: всегда смонтирована (не прыгает окно),
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
                      Высота волн
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
                      aria-label="Высота волн над таймлайном"
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
                      title="Сбросить на 22px"
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
