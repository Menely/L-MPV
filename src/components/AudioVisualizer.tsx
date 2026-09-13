import React, { useRef, useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerState, usePlayerProgress } from "../contexts/PlayerStateContext";

export type VisualizerMode = "waveform" | "spectrum" | "bars";
export type VisualizerPlacement = "above_timeline" | "toolbar" | "off";
export type VisualizerTheme = "accent" | "pastel" | "neon";

export interface VisualizerConfig {
  enabled: boolean;
  placement: VisualizerPlacement;
  mode: VisualizerMode;
  theme: VisualizerTheme;
  height: number;
}

export const DEFAULT_VISUALIZER_CONFIG: VisualizerConfig = {
  enabled: false,
  placement: "above_timeline",
  mode: "waveform",
  theme: "accent",
  height: 22,
};

const VISUALIZER_STORAGE_KEY = "l-mpv-visualizer-settings";

export function getVisualizerConfig(): VisualizerConfig {
  try {
    const raw = localStorage.getItem(VISUALIZER_STORAGE_KEY);
    if (raw) return { ...DEFAULT_VISUALIZER_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    console.error("Ошибка чтения настроек визуализатора:", e);
  }
  return DEFAULT_VISUALIZER_CONFIG;
}

export function saveVisualizerConfig(config: VisualizerConfig): void {
  try {
    localStorage.setItem(VISUALIZER_STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
  } catch (e) {
    console.error("Ошибка сохранения настроек визуализатора:", e);
  }
}

interface AudioVisualizerProps {
  placement: "above_timeline" | "toolbar";
  className?: string;
  onCycleMode?: () => void;
}

interface ActiveVisualizerProps extends AudioVisualizerProps {
  config: VisualizerConfig;
  onConfigChange: (newConfig: VisualizerConfig) => void;
}

/**
 * Внутренний компонент рендеринга активного визуализатора на Canvas.
 * Монтируется только когда визуализатор действительно включен и соответствует размещению.
 */
const ActiveVisualizer: React.FC<ActiveVisualizerProps> = React.memo(({
  placement,
  className = "",
  config,
  onConfigChange,
  onCycleMode,
}) => {
  const { mediaInfo, hasMedia, isIdle } = usePlayerState();
  const { duration } = usePlayerProgress();

  const [isDocVisible, setIsDocVisible] = useState(() => !document.hidden);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const realSpectrumRef = useRef<number[]>(new Array(32).fill(0));
  const isFetchingRef = useRef<boolean>(false);

  useEffect(() => {
    const onVisibilityChange = () => setIsDocVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const isPaused = !hasMedia || (mediaInfo?.paused ?? true) || duration <= 0;
  const rawVolume = mediaInfo?.volume ?? 100;
  const speed = mediaInfo?.speed ?? 1.0;
  const shouldBeActive = !isPaused && !isIdle && isDocVisible;

  // Управление аппаратным захватом звука через WASAPI
  useEffect(() => {
    invoke("set_visualizer_active", { active: shouldBeActive }).catch(() => {});
    return () => {
      invoke("set_visualizer_active", { active: false }).catch(() => {});
    };
  }, [shouldBeActive]);

  const animStateRef = useRef({
    phase: 0,
    currentAmp: 0,
    bars: new Array(48).fill(0),
    peaks: new Array(48).fill(0),
    peakVels: new Array(48).fill(0),
  });

  const handleToggleStyle = useCallback((e: React.MouseEvent) => {
    if (placement !== "toolbar" && !onCycleMode) return;
    e.stopPropagation();

    const modes: VisualizerMode[] = ["waveform", "spectrum", "bars"];
    const nextMode = modes[(modes.indexOf(config.mode) + 1) % modes.length];
    const updated = { ...config, mode: nextMode };
    onConfigChange(updated);
    saveVisualizerConfig(updated);
    if (onCycleMode) onCycleMode();
  }, [config, placement, onCycleMode, onConfigChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let animId: number;
    let lastTime = performance.now();

    const updateCanvasSize = () => {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(20, Math.floor(rect.width));
      const h = Math.max(12, Math.floor(rect.height));

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
    };

    updateCanvasSize();
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(container);

    const render = (time: number) => {
      const dt = Math.min(64, time - lastTime) / 1000;
      lastTime = time;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // Энергосбережение при невидимом интерфейсе
      if (isIdle || !isDocVisible) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        animId = requestAnimationFrame(render);
        return;
      }

      // Асинхронное получение спектра без задержки рендера
      if (shouldBeActive && !isFetchingRef.current) {
        isFetchingRef.current = true;
        invoke<number[]>("get_audio_spectrum")
          .then((data) => {
            if (data?.length) realSpectrumRef.current = data;
          })
          .catch(() => {})
          .finally(() => {
            isFetchingRef.current = false;
          });
      } else if (!shouldBeActive) {
        const spec = realSpectrumRef.current;
        for (let i = 0; i < 32; i++) spec[i] *= 0.88;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const state = animStateRef.current;
      const rawSpectrum = realSpectrumRef.current;

      const isAudible = shouldBeActive && rawVolume > 0;

      // Адаптивное усиление для тихой громкости (Volume Gain Compensation):
      // Если звук убавлен (например, 10-30%), масштабируем полосы спектра так,
      // чтобы анимация оставалась насыщенной и подвижной.
      const volumeGain = rawVolume > 0 && rawVolume < 75 ? Math.min(3.5, 75.0 / Math.max(10.0, rawVolume)) : 1.0;
      const spectrum = rawSpectrum.map((v) => Math.min(1.0, v * volumeGain));

      const bassEnergy = Math.max(spectrum[0] || 0, spectrum[1] || 0, spectrum[2] || 0, spectrum[3] || 0);
      const midEnergy = Math.max(spectrum[8] || 0, spectrum[10] || 0, spectrum[12] || 0);
      const totalAudioEnergy = Math.max(bassEnergy * 1.1, midEnergy);

      const targetAmp = !isAudible ? 0.0 : Math.min(1.0, totalAudioEnergy * 1.35 + 0.12);
      state.currentAmp += (targetAmp - state.currentAmp) * Math.min(1.0, dt * 10.0);

      if (!isPaused && state.currentAmp > 0.005) {
        state.phase += dt * (2.0 * Math.max(0.25, Math.min(3.0, speed)) + bassEnergy * 3.5);
      }

      // Определение цветов темы
      let primary = "#7fc7ff";
      let secondary = "#93c5fd";
      let glow = "rgba(127, 199, 255, 0.5)";

      if (config.theme === "pastel") {
        primary = "#c4b5fd";
        secondary = "#6ee7b7";
        glow = "rgba(196, 181, 253, 0.4)";
      } else if (config.theme === "neon") {
        primary = "#00E5FF";
        secondary = "#FF2A5F";
        glow = "rgba(0, 229, 255, 0.6)";
      } else {
        const cs = getComputedStyle(document.documentElement);
        primary = cs.getPropertyValue("--accent").trim() || "#7fc7ff";
        glow = cs.getPropertyValue("--accent-glow").trim() || "rgba(127, 199, 255, 0.5)";
      }

      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, primary);
      gradient.addColorStop(0.5, secondary);
      gradient.addColorStop(1, primary);

      // 1. Waveform (Органическая спектральная волна)
      if (config.mode === "waveform") {
        const centerY = h / 2;
        const maxWaveHeight = (h / 2) * 0.85;
        const baseAmp = state.currentAmp * maxWaveHeight;

        // Мягкая фоновая волна
        if (state.currentAmp > 0.04) {
          ctx.beginPath();
          const segs = Math.max(24, Math.floor(w / 12));
          for (let i = 0; i <= segs; i++) {
            const x = (i / segs) * w;
            const p = i / segs;
            const env = Math.sin(p * Math.PI);
            const specIdx = Math.min(31, Math.floor(p * 32));
            const bandVal = spectrum[specIdx] || 0;
            const wave = Math.sin(p * 6.0 - state.phase * 1.0) * 0.4 +
                         Math.cos(p * 11.0 + state.phase * 1.4) * 0.2 +
                         bandVal * 0.45;
            const y = centerY + wave * baseAmp * 0.65 * env;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = primary;
          ctx.globalAlpha = 0.25;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }

        // Главная светящаяся волна
        ctx.beginPath();
        const mainSegs = Math.max(32, Math.floor(w / 8));
        for (let i = 0; i <= mainSegs; i++) {
          const x = (i / mainSegs) * w;
          const p = i / mainSegs;
          const env = Math.sin(p * Math.PI);
          const specIdx = Math.min(31, Math.floor(p * 32));
          const bandVal = spectrum[specIdx] || 0;
          const harmonic = Math.sin(p * 7.5 + state.phase * 1.6) * 0.4 +
                           Math.sin(p * 14.0 - state.phase * 0.9) * 0.2 +
                           bandVal * 0.65;
          const y = centerY + harmonic * baseAmp * env;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }

        ctx.globalAlpha = isPaused ? 0.35 : 0.95;
        ctx.strokeStyle = gradient;
        ctx.lineWidth = isPaused ? 1.0 : 2.2;
        ctx.shadowColor = glow;
        ctx.shadowBlur = isPaused ? 0 : 9;
        ctx.stroke();

      // 2. Spectrum (Студийный 32-полосный эквалайзер)
      } else if (config.mode === "spectrum") {
        const barCount = placement === "toolbar" ? 14 : Math.min(36, Math.max(18, Math.floor(w / 16)));
        const gap = 2.5;
        const barWidth = Math.max(2, (w - gap * (barCount - 1)) / barCount);
        const maxHeight = h * 0.90;

        for (let i = 0; i < barCount; i++) {
          const specIdx = Math.min(31, Math.floor((i / barCount) * 32));
          const val = spectrum[specIdx] || 0;
          const targetH = isAudible ? Math.max(2, val * maxHeight) : 2;

          const attackSpeed = targetH > (state.bars[i] || 2) ? 24.0 : 12.0;
          state.bars[i] = (state.bars[i] || 2) + (targetH - (state.bars[i] || 2)) * Math.min(1.0, dt * attackSpeed);
          const curH = state.bars[i];

          // Студийные пиковые маркеры с гравитацией (Peak Hold & Drop)
          if (curH >= (state.peaks[i] || 0)) {
            state.peaks[i] = curH;
            state.peakVels[i] = 0;
          } else {
            state.peakVels[i] = (state.peakVels[i] || 0) + dt * 40.0;
            state.peaks[i] = Math.max(2, (state.peaks[i] || 0) - (state.peakVels[i] || 0) * dt);
          }

          const x = i * (barWidth + gap);
          const y = h - curH;

          ctx.fillStyle = gradient;
          ctx.globalAlpha = isPaused ? 0.3 : 0.88;
          ctx.shadowColor = glow;
          ctx.shadowBlur = isPaused ? 0 : 7;

          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, curH, [3, 3, 1, 1]);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, barWidth, curH);
          }

          if (!isPaused && state.peaks[i] > 3) {
            ctx.fillStyle = secondary;
            ctx.globalAlpha = 0.95;
            ctx.fillRect(x, Math.max(0, h - state.peaks[i] - 2.5), barWidth, 1.8);
          }
        }

      // 3. Bars (Ритм-капсулы)
      } else if (config.mode === "bars") {
        const barCount = placement === "toolbar" ? 12 : Math.min(32, Math.max(16, Math.floor(w / 18)));
        const gap = 3;
        const barWidth = Math.max(3, (w - gap * (barCount - 1)) / barCount);
        const centerY = h / 2;
        const maxHalfH = (h / 2) * 0.88;

        for (let i = 0; i < barCount; i++) {
          const specIdx = Math.min(31, Math.floor((i / barCount) * 32));
          const val = spectrum[specIdx] || 0;
          const targetHalfH = isAudible ? Math.max(2, val * maxHalfH) : 2;

          const attackSpeed = targetHalfH > (state.bars[i] || 2) ? 22.0 : 12.0;
          state.bars[i] = (state.bars[i] || 2) + (targetHalfH - (state.bars[i] || 2)) * Math.min(1.0, dt * attackSpeed);
          const curHalfH = state.bars[i];

          const x = i * (barWidth + gap);
          const y = centerY - curHalfH;
          const barH = curHalfH * 2;

          ctx.fillStyle = gradient;
          ctx.globalAlpha = isPaused ? 0.35 : 0.92;
          ctx.shadowColor = glow;
          ctx.shadowBlur = isPaused ? 0 : 7;

          const radius = Math.min(barWidth / 2, curHalfH);
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barH, radius);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, barWidth, barH);
          }
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
    };
  }, [config.mode, config.theme, isPaused, rawVolume, speed, placement, shouldBeActive]);

  const height = placement === "toolbar" ? 22 : (config.height || 22);

  return (
    <div
      ref={containerRef}
      className={`audio-visualizer audio-visualizer--${placement} ${className}`}
      style={{ height: `${height}px` }}
      onClick={placement === "toolbar" ? handleToggleStyle : undefined}
    >
      <canvas ref={canvasRef} className="audio-visualizer__canvas" />
    </div>
  );
});

ActiveVisualizer.displayName = "ActiveVisualizer";

/**
 * Высокопроизводительный компонент-контроллер аудио-визуализатора.
 * Если визуализатор выключен или не соответствует указанному расположению,
 * компонент возвращает null без создания хуков Canvas, слушателей и IPC-запросов.
 */
export const AudioVisualizer = React.memo(({ placement, className = "", onCycleMode }: AudioVisualizerProps) => {
  const [config, setConfig] = useState<VisualizerConfig>(() => getVisualizerConfig());

  useEffect(() => {
    const handleSettingsUpdate = () => setConfig(getVisualizerConfig());
    window.addEventListener("l-mpv-settings-changed", handleSettingsUpdate);
    return () => window.removeEventListener("l-mpv-settings-changed", handleSettingsUpdate);
  }, []);

  if (!config.enabled || config.placement !== placement) {
    return null;
  }

  return (
    <ActiveVisualizer
      placement={placement}
      className={className}
      config={config}
      onConfigChange={setConfig}
      onCycleMode={onCycleMode}
    />
  );
});

AudioVisualizer.displayName = "AudioVisualizer";

