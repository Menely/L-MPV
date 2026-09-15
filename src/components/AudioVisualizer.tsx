import React, { useRef, useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerState, usePlayerProgress } from "../contexts/PlayerStateContext";

export type VisualizerMode =
  | "waveform"
  | "spectrum"
  | "bars"
  | "matrix"
  | "ribbon"
  | "particles"
  | "circular"
  | "blob"
  | "strings";

export type VisualizerPlacement = "above_timeline" | "toolbar" | "inside_timeline" | "off";
export type VisualizerTheme = "accent" | "pastel" | "neon" | "sunset" | "aurora";

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
  placement: "above_timeline" | "toolbar" | "inside_timeline";
  className?: string;
  onCycleMode?: () => void;
}

interface ActiveVisualizerProps extends AudioVisualizerProps {
  config: VisualizerConfig;
  onConfigChange: (newConfig: VisualizerConfig) => void;
}

export interface VisualizerParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface VisualizerAnimState {
  phase: number;
  currentAmp: number;
  bars: number[];
  peaks: number[];
  peakVels: number[];
  particles: VisualizerParticle[];
}

export function createInitialAnimState(): VisualizerAnimState {
  return {
    phase: 0,
    currentAmp: 0,
    bars: new Array(48).fill(0),
    peaks: new Array(48).fill(0),
    peakVels: new Array(48).fill(0),
    particles: [],
  };
}

/**
 * Определение цветов палитры темы для визуализатора.
 */
export function getVisualizerThemeColors(theme: VisualizerTheme): {
  primary: string;
  secondary: string;
  tertiary: string;
  glow: string;
} {
  if (theme === "pastel") {
    return {
      primary: "#c4b5fd",
      secondary: "#6ee7b7",
      tertiary: "#fbcfe8",
      glow: "rgba(196, 181, 253, 0.4)",
    };
  } else if (theme === "neon") {
    return {
      primary: "#00E5FF",
      secondary: "#FF2A5F",
      tertiary: "#FFE600",
      glow: "rgba(0, 229, 255, 0.6)",
    };
  } else if (theme === "sunset") {
    return {
      primary: "#FFB300",
      secondary: "#FF5722",
      tertiary: "#E91E63",
      glow: "rgba(255, 87, 34, 0.55)",
    };
  } else if (theme === "aurora") {
    return {
      primary: "#00F5D4",
      secondary: "#00BB77",
      tertiary: "#0077B6",
      glow: "rgba(0, 245, 212, 0.55)",
    };
  } else {
    let primary = "#7fc7ff";
    let secondary = "#93c5fd";
    let tertiary = "#38bdf8";
    let glow = "rgba(127, 199, 255, 0.5)";
    if (typeof document !== "undefined") {
      const cs = getComputedStyle(document.documentElement);
      primary = cs.getPropertyValue("--accent").trim() || primary;
      secondary = cs.getPropertyValue("--accent-hover").trim() || secondary;
      tertiary = cs.getPropertyValue("--accent-active").trim() || tertiary;
      glow = cs.getPropertyValue("--accent-glow").trim() || glow;
    }
    return { primary, secondary, tertiary, glow };
  }
}

/**
 * Единый движок рендеринга 9 режимов аудио-визуализатора.
 * Используется как на панели плеера, так и в интерактивном окне предпросмотра в настройках.
 */
export function renderVisualizerFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  config: VisualizerConfig,
  state: VisualizerAnimState,
  spectrum: number[],
  dt: number,
  options: {
    isAudible: boolean;
    isPaused: boolean;
    speed?: number;
  }
): void {
  if (!w || !h || w <= 0 || h <= 0 || isNaN(w) || isNaN(h)) return;

  const { isAudible, isPaused, speed = 1.0 } = options;
  const placement = config.placement;

  const bassEnergy = Math.max(spectrum[0] || 0, spectrum[1] || 0, spectrum[2] || 0, spectrum[3] || 0);
  const midEnergy = Math.max(spectrum[8] || 0, spectrum[10] || 0, spectrum[12] || 0);
  const totalAudioEnergy = Math.max(bassEnergy * 1.35, midEnergy * 1.25);

  const targetAmp = !isAudible ? 0.0 : Math.min(1.0, totalAudioEnergy * 1.75 + 0.22);
  state.currentAmp += (targetAmp - state.currentAmp) * Math.min(1.0, dt * 14.0);

  if (!isPaused && state.currentAmp > 0.005) {
    state.phase += dt * (2.8 * Math.max(0.25, Math.min(3.0, speed)) + bassEnergy * 5.2);
  }

  const { primary, secondary, tertiary, glow } = getVisualizerThemeColors(config.theme);

  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, primary);
  gradient.addColorStop(0.5, secondary);
  gradient.addColorStop(1, tertiary);

  // 1. Waveform (Органическая спектральная волна)
  if (config.mode === "waveform") {
    const centerY = h / 2;
    const maxWaveHeight = (h / 2) * 0.92;
    const baseAmp = state.currentAmp * maxWaveHeight;

    if (state.currentAmp > 0.04) {
      ctx.beginPath();
      const segs = Math.max(24, Math.floor(w / 12));
      for (let i = 0; i <= segs; i++) {
        const x = (i / segs) * w;
        const p = i / segs;
        const env = Math.sin(p * Math.PI);
        const specIdx = Math.min(31, Math.floor(p * 32));
        const bandVal = spectrum[specIdx] || 0;
        const wave = Math.sin(p * 6.5 - state.phase * 1.2) * 0.45 +
                     Math.cos(p * 12.0 + state.phase * 1.6) * 0.25 +
                     bandVal * 0.65;
        const y = centerY + wave * baseAmp * 0.7 * env;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = primary;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.beginPath();
    const mainSegs = Math.max(32, Math.floor(w / 8));
    for (let i = 0; i <= mainSegs; i++) {
      const x = (i / mainSegs) * w;
      const p = i / mainSegs;
      const env = Math.sin(p * Math.PI);
      const specIdx = Math.min(31, Math.floor(p * 32));
      const bandVal = spectrum[specIdx] || 0;
      const harmonic = Math.sin(p * 8.0 + state.phase * 1.8) * 0.45 +
                       Math.sin(p * 15.0 - state.phase * 1.1) * 0.25 +
                       bandVal * 0.85;
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
    const maxHeight = h * 0.94;

    for (let i = 0; i < barCount; i++) {
      const specIdx = Math.min(31, Math.floor((i / barCount) * 32));
      const val = spectrum[specIdx] || 0;
      const targetH = isAudible ? Math.min(maxHeight, Math.max(2, val * maxHeight * 1.2)) : 2;

      const attackSpeed = targetH > (state.bars[i] || 2) ? 26.0 : 13.0;
      state.bars[i] = (state.bars[i] || 2) + (targetH - (state.bars[i] || 2)) * Math.min(1.0, dt * attackSpeed);
      const curH = state.bars[i];

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
    const maxHalfH = (h / 2) * 0.92;

    for (let i = 0; i < barCount; i++) {
      const specIdx = Math.min(31, Math.floor((i / barCount) * 32));
      const val = spectrum[specIdx] || 0;
      const targetHalfH = isAudible ? Math.min(maxHalfH, Math.max(2, val * maxHalfH * 1.2)) : 2;

      const attackSpeed = targetHalfH > (state.bars[i] || 2) ? 24.0 : 13.0;
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

  // 4. Matrix (Светодиодная LED-матрица)
  } else if (config.mode === "matrix") {
    const barCount = placement === "toolbar" ? 14 : Math.min(48, Math.max(16, Math.floor(w / 14)));
    const gapX = 2.5;
    const barWidth = Math.max(2, (w - gapX * (barCount - 1)) / barCount);
    const gapY = 2.0;
    const dotHeight = Math.max(2, Math.min(barWidth, 4.0));
    const numDots = Math.max(3, Math.floor((h - gapY) / (dotHeight + gapY)));

    for (let i = 0; i < barCount; i++) {
      const specIdx = Math.min(31, Math.floor((i / barCount) * 32));
      const val = spectrum[specIdx] || 0;
      const targetVal = isAudible ? Math.min(1.0, val * 1.25) : 0.05;

      const attackSpeed = targetVal > (state.bars[i] || 0) ? 26.0 : 13.0;
      state.bars[i] = (state.bars[i] || 0) + (targetVal - (state.bars[i] || 0)) * Math.min(1.0, dt * attackSpeed);
      const curVal = state.bars[i];
      const activeDots = Math.min(numDots, Math.max(0, Math.round(curVal * numDots)));

      const x = i * (barWidth + gapX);

      for (let d = 0; d < numDots; d++) {
        const y = h - (d + 1) * (dotHeight + gapY);
        const isActive = d < activeDots;

        if (isActive) {
          ctx.fillStyle = gradient;
          ctx.globalAlpha = isPaused ? 0.35 : 0.92;
          ctx.shadowColor = glow;
          ctx.shadowBlur = isPaused ? 0 : 5;
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
          ctx.globalAlpha = 0.35;
          ctx.shadowBlur = 0;
        }

        const r = Math.min(1.5, dotHeight / 2);
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, dotHeight, r);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, dotHeight);
        }
      }
    }

  // 5. Ribbon (Жидкая заполненная лента)
  } else if (config.mode === "ribbon") {
    const segs = Math.max(24, Math.floor(w / 10));
    const points: { x: number; y: number }[] = [];

    for (let i = 0; i <= segs; i++) {
      const p = i / segs;
      const x = p * w;
      const env = Math.sin(p * Math.PI);
      const specIdx = Math.min(31, Math.floor(p * 32));
      const bandVal = spectrum[specIdx] || 0;
      const wave = Math.sin(p * 7.5 + state.phase * 2.0) * 0.4 +
                   Math.cos(p * 14.0 - state.phase * 1.4) * 0.25 +
                   bandVal * 0.85;
      const curH = Math.max(1, wave * (h * 0.88) * state.currentAmp * env);
      points.push({ x, y: h - curH });
    }

    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.lineTo(w, h);
    ctx.closePath();

    const ribbonGrad = ctx.createLinearGradient(0, 0, 0, h);
    ribbonGrad.addColorStop(0, primary);
    ribbonGrad.addColorStop(0.5, secondary);
    ribbonGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = ribbonGrad;
    ctx.globalAlpha = isPaused ? 0.2 : 0.65;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = isPaused ? 1.0 : 2.0;
    ctx.globalAlpha = isPaused ? 0.35 : 0.95;
    ctx.shadowColor = glow;
    ctx.shadowBlur = isPaused ? 0 : 8;
    ctx.stroke();

  // 6. Particles (Звездный салют частиц)
  } else if (config.mode === "particles") {
    ctx.beginPath();
    ctx.moveTo(0, h - 1);
    ctx.lineTo(w, h - 1);
    ctx.strokeStyle = primary;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (isAudible && state.particles.length < 50 && Math.random() < (totalAudioEnergy * 1.8 + 0.3)) {
      const bandIdx = Math.floor(Math.random() * 32);
      const bandVal = spectrum[bandIdx] || 0;
      const spawnCount = bandVal > 0.4 ? 2 : 1;
      for (let k = 0; k < spawnCount; k++) {
        const x = (bandIdx / 32) * w + (Math.random() - 0.5) * (w / 32);
        state.particles.push({
          x,
          y: h - 2,
          vx: (Math.random() - 0.5) * 24,
          vy: -(Math.random() * 22 + bandVal * 45 + 14),
          size: Math.random() * 2.2 + 1.2,
          alpha: 1.0,
          life: 0,
          maxLife: Math.random() * 0.7 + 0.5,
          color: Math.random() > 0.6 ? primary : (Math.random() > 0.5 ? secondary : tertiary),
        });
      }
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife || p.y < 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);

      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha * (isPaused ? 0.25 : 0.9);
      ctx.shadowColor = glow;
      ctx.shadowBlur = isPaused ? 0 : 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

  // 7. Circular (Радиальный пульсар)
  } else if (config.mode === "circular") {
    const ringCount = placement === "toolbar" ? 1 : Math.max(1, Math.min(5, Math.floor(w / 140)));
    const rayCount = 24;
    const cy = h / 2;
    const baseR = placement === "toolbar" ? 7.5 : Math.max(3, Math.min(h * 0.35, 16));
    const maxRay = placement === "toolbar" ? 7.5 : Math.max(2, Math.min(h * 0.45, 18));

    for (let rIdx = 0; rIdx < ringCount; rIdx++) {
      const cx = ringCount === 1 ? w / 2 : (rIdx + 0.5) * (w / ringCount);

      const pulseR = baseR * (0.6 + bassEnergy * 0.4);
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.fillStyle = primary;
      ctx.globalAlpha = isPaused ? 0.25 : 0.45;
      ctx.shadowColor = glow;
      ctx.shadowBlur = isPaused ? 0 : 6;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
      ctx.strokeStyle = secondary;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = isPaused ? 0.3 : 0.75;
      ctx.stroke();

      for (let j = 0; j < rayCount; j++) {
        const angle = (j / rayCount) * Math.PI * 2 + state.phase * 0.6;
        const specIdx = Math.min(31, Math.floor((j / rayCount) * 32));
        const val = spectrum[specIdx] || 0;
        const rayLen = isAudible ? val * maxRay * 1.3 : 1;

        const x1 = cx + Math.cos(angle) * (baseR + 1);
        const y1 = cy + Math.sin(angle) * (baseR + 1);
        const x2 = cx + Math.cos(angle) * (baseR + 1 + rayLen);
        const y2 = cy + Math.sin(angle) * (baseR + 1 + rayLen);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = isPaused ? 0.25 : 0.88;
        ctx.stroke();
      }
    }

  // 8. Blob (Органическая плазма)
  } else if (config.mode === "blob") {
    const blobCount = placement === "toolbar" ? 1 : Math.max(1, Math.min(3, Math.floor(w / 220)));
    const cy = h / 2;
    const numPoints = 16;
    const baseR = placement === "toolbar" ? 8.5 : Math.max(4, Math.min(h * 0.4, 20));

    for (let b = 0; b < blobCount; b++) {
      const cx = blobCount === 1 ? w / 2 : (b + 0.5) * (w / blobCount);
      const points: { x: number; y: number }[] = [];

      for (let j = 0; j < numPoints; j++) {
        const angle = (j / numPoints) * Math.PI * 2;
        const specIdx = Math.min(31, Math.floor((j / numPoints) * 32));
        const val = spectrum[specIdx] || 0;
        const distortion = Math.sin(angle * 3.0 + state.phase * 2.2 + b) * 0.25 +
                           val * 0.55 * state.currentAmp;
        const maxR = (h / 2) - 1.5;
        const r = Math.min(maxR, Math.max(3, baseR * (1.0 + distortion)));
        points.push({
          x: cx + Math.cos(angle + state.phase * 0.4) * r,
          y: cy + Math.sin(angle + state.phase * 0.4) * r,
        });
      }

      ctx.beginPath();
      ctx.moveTo((points[0].x + points[numPoints - 1].x) / 2, (points[0].y + points[numPoints - 1].y) / 2);
      for (let j = 0; j < numPoints; j++) {
        const next = points[(j + 1) % numPoints];
        const xc = (points[j].x + next.x) / 2;
        const yc = (points[j].y + next.y) / 2;
        ctx.quadraticCurveTo(points[j].x, points[j].y, xc, yc);
      }
      ctx.closePath();

      ctx.fillStyle = gradient;
      ctx.globalAlpha = isPaused ? 0.25 : 0.55;
      ctx.shadowColor = glow;
      ctx.shadowBlur = isPaused ? 0 : 8;
      ctx.fill();

      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = isPaused ? 0.35 : 0.9;
      ctx.stroke();
    }

  // 9. Strings (Резонансные осциллографические струны)
  } else if (config.mode === "strings") {
    const stringDefs = [
      { yRel: 0.26, energy: Math.max(spectrum[18] || 0, spectrum[24] || 0, spectrum[28] || 0), color: tertiary, freq: 16.0, speed: 2.2, width: 1.4 },
      { yRel: 0.50, energy: midEnergy, color: secondary, freq: 10.0, speed: 1.6, width: 1.8 },
      { yRel: 0.74, energy: bassEnergy, color: primary, freq: 5.5, speed: 1.1, width: 2.2 },
    ];

    const segs = Math.max(24, Math.floor(w / 10));

    stringDefs.forEach((str) => {
      const centerY = h * str.yRel;
      const amp = isAudible ? Math.min(h * 0.32, str.energy * (h * 0.38) * 1.3 + 1.5) : 1;

      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const p = i / segs;
        const x = p * w;
        const env = Math.sin(p * Math.PI);
        const wave = Math.sin(p * str.freq + state.phase * str.speed) * 0.65 +
                     Math.cos(p * (str.freq * 1.8) - state.phase * (str.speed * 0.8)) * 0.35;
        const y = centerY + wave * amp * env;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }

      ctx.strokeStyle = str.color;
      ctx.lineWidth = isPaused ? 1.0 : str.width;
      ctx.globalAlpha = isPaused ? 0.3 : 0.92;
      ctx.shadowColor = glow;
      ctx.shadowBlur = isPaused ? 0 : 7;
      ctx.stroke();
    });
  }
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

  // Управление аппаратным захватом звука через WASAPI.
  // acquire/release вместо прямого set_active: бэкенд ведёт счётчик потребителей,
  // поэтому размонтирование одного Canvas-инстанса не глушит захват другого
  // (раньше два инстанса визуализатора конфликтовали: unmount одного
  // отправлял set_visualizer_active(false) и останавливал спектр второго).
  useEffect(() => {
    invoke("acquire_visualizer").catch(() => {});
    return () => {
      invoke("release_visualizer").catch(() => {});
    };
  }, []);

  // Динамическое включение/выключение по фактическому состоянию (пауза/IDLE/видимость)
  useEffect(() => {
    invoke("set_visualizer_active", { active: shouldBeActive }).catch(() => {});
  }, [shouldBeActive]);

  const animStateRef = useRef<VisualizerAnimState>(createInitialAnimState());

  const handleToggleStyle = useCallback((e: React.MouseEvent) => {
    if (placement !== "toolbar" && !onCycleMode) return;
    e.stopPropagation();

    const modes: VisualizerMode[] = [
      "waveform",
      "spectrum",
      "bars",
      "matrix",
      "ribbon",
      "particles",
      "circular",
      "blob",
      "strings",
    ];
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

      const rawSpectrum = realSpectrumRef.current;
      const isAudible = shouldBeActive && rawVolume > 0;
      const baseBoost = 1.6;
      const volumeGain = rawVolume > 0 && rawVolume < 85 ? Math.min(5.5, (85.0 / Math.max(10.0, rawVolume)) * 1.6) : baseBoost;
      const spectrum = rawSpectrum.map((v) => Math.min(1.0, Math.pow(v, 0.85) * volumeGain));

      renderVisualizerFrame(
        ctx,
        w,
        h,
        config,
        animStateRef.current,
        spectrum,
        dt,
        {
          isAudible,
          isPaused,
          speed,
        }
      );

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
    };
  }, [config.mode, config.theme, isPaused, rawVolume, speed, placement, shouldBeActive]);

  const height = placement === "toolbar"
    ? (config.mode === "circular" || config.mode === "blob" ? 34 : 22)
    : placement === "inside_timeline"
      ? 16
      : (config.height || 22);

  return (
    <div
      ref={containerRef}
      className={`audio-visualizer audio-visualizer--${placement} audio-visualizer--mode-${config.mode} ${className}`}
      style={placement === "inside_timeline" ? undefined : { height: `${height}px` }}
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

