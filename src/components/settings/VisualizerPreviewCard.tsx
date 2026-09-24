import { useTranslation } from "../../i18n/LanguageContext";
import React, { useEffect, useRef } from "react";
import {
  VisualizerConfig,
  VisualizerAnimState,
  createInitialAnimState,
  getVisualizerThemeColors,
  renderVisualizerFrame,
} from "../AudioVisualizer";

interface VisualizerPreviewCardProps {
  config: VisualizerConfig;
  isVisible: boolean;
}

/**
 * Интерактивная карточка предпросмотра аудио-визуализатора в стиле превью неонового свечения.
 */
export const VisualizerPreviewCard: React.FC<VisualizerPreviewCardProps> = ({
  config,
  isVisible,
}) => {
  const { dict } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animStateRef = useRef<VisualizerAnimState>(createInitialAnimState());

  // Сброс буфера капсул при смене режима визуализации для исключения конфликтов интерполяции
  useEffect(() => {
    if (animStateRef.current) {
      animStateRef.current.bars = new Array(48).fill(2);
    }
  }, [config.mode]);

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

      const dt = Math.max(0.001, Math.min(64, Math.max(0, time - lastTime))) / 1000;
      lastTime = time;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        try {
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
        } catch (e) {
          console.error("Ошибка рендеринга предпросмотра визуализатора:", e);
        } finally {
          ctx.restore();
        }
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

  return (
    <div className="settings-preview-card" style={{ marginBottom: 0 }}>
      {/* Левая информационная часть */}
      <div className="settings-preview-card__info">
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
            {dict.settings.appearance.visualizer.previewLeft}
          </span>
          <span
            style={{
              fontSize: "0.80rem",
              fontWeight: 700,
              color: !config.enabled ? "var(--text-muted)" : themeColors.primary,
              textShadow: !config.enabled ? "none" : `0 0 10px ${themeColors.glow}`,
              transition:
                "color var(--t-fast) var(--ease-smooth), text-shadow var(--t-fast) var(--ease-smooth)",
            }}
          >
            {!config.enabled
              ? dict.settings.appearance.visualizer.off
              : `${dict.settings.appearance.visualizer.modes[config.mode]?.label || config.mode} • ${dict.settings.appearance.visualizer.themes[config.theme]?.label || config.theme}`}
          </span>
        </div>
        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.25 }}>
          {!config.enabled
            ? dict.settings.appearance.visualizer.previewOffStatus
            : `${dict.settings.appearance.visualizer.placements[config.placement]?.label || "On player bar"} • ${
                config.placement === "above_timeline"
                  ? dict.settings.appearance.visualizer.detailAbove(config.height || 22)
                  : config.placement === "inside_timeline"
                  ? dict.settings.appearance.visualizer.detailInside
                  : dict.settings.appearance.visualizer.detailToolbar
              }`}
        </span>
      </div>

      {/* Чистое превью визуализатора без лишних кнопок управления */}
      <div
        className="settings-preview-card__mini-player"
        style={{
          background: "var(--bg-pill)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid var(--border-pill)",
          borderRadius: "var(--radius-controls, 16px)",
          padding: "0 24px",
          height: 60,
          boxSizing: "border-box",
          boxShadow: "var(--shadow-pill, 0 4px 20px rgba(0, 0, 0, 0.45))",
          transition: "all var(--t-fast) var(--ease-smooth)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 120,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
            position: "relative",
            transition: "width var(--t-fast) var(--ease-smooth)",
          }}
        >
          {/* 1. Над таймлайном */}
          {config.enabled && config.placement === "above_timeline" && (
            <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 6 }}>
              <div
                style={{
                  width: "100%",
                  height: 32,
                  borderRadius: "var(--radius-sm, 4px)",
                  overflow: "hidden",
                  display: "flex",
                }}
              >
                <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
              </div>
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: 4,
                  background: "rgba(255, 255, 255, 0.15)",
                  borderRadius: 4,
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
                    background: themeColors.primary,
                    borderRadius: 4,
                    boxShadow: `0 0 6px ${themeColors.glow}`,
                  }}
                />
              </div>
            </div>
          )}

          {/* 2. В таймлайне (SoundCloud Style) */}
          {config.enabled && config.placement === "inside_timeline" && (
            <div
              style={{
                position: "relative",
                width: "100%",
                height: 32,
                background: "rgba(255, 255, 255, 0.08)",
                borderRadius: "var(--radius-md, 6px)",
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
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: "55%",
                  background: `linear-gradient(90deg, ${themeColors.glow}40 0%, ${themeColors.glow}10 100%)`,
                  borderRight: `2px solid ${themeColors.primary}`,
                  boxShadow: `0 0 8px ${themeColors.glow}`,
                  pointerEvents: "none",
                }}
              />
            </div>
          )}

          {/* 3. Режим в тулбаре */}
          {config.enabled && config.placement === "toolbar" && (
            <div
              style={{
                width: 120,
                height: 36,
                borderRadius: "var(--radius-md, 8px)",
                overflow: "hidden",
                display: "flex",
                background: "rgba(0, 0, 0, 0.35)",
                border: `1px solid ${themeColors.primary}44`,
                boxShadow: `0 0 8px ${themeColors.glow}20`,
                flexShrink: 0,
              }}
            >
              <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
            </div>
          )}

          {/* 4. Обычный таймлайн (когда выключен) */}
          {!config.enabled && (
            <div
              style={{
                position: "relative",
                width: "100%",
                height: 4,
                background: "rgba(255, 255, 255, 0.15)",
                borderRadius: 4,
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
                  background: "rgba(255, 255, 255, 0.4)",
                  borderRadius: 4,
                  boxShadow: "none",
                  transition:
                    "background-color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
