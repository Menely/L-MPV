/**
 * Модуль цветовых палитр, геометрии буфера Canvas и LRU-кэша в памяти
 * для тепловой карты таймлайна (Activity Heatmap).
 *
 * Отвечает за:
 * - Вычисление цветов термодинамических палитр (Theme, Thermal, Cyberpunk, Monochrome);
 * - Безопасное управление альфа-каналом CSS-цветов (`setAlpha`);
 * - Чтение CSS-переменных текущей темы оформления (`getWaveformThemeColors`);
 * - Синхронизацию физических размеров буфера Canvas с DevicePixelRatio (`updateCanvasMetrics`);
 * - Сессионную структуру данных `WaveformMemoryCache`.
 */

import type { HeatmapPalette } from "./heatmapTypes";

export interface WaveformThemeColors {
  accentColor: string;
  accentRgb: string;
}

export interface WaveformMetrics {
  width: number;
  height: number;
  dpr: number;
}

/**
 * LRU-кэш для хранения сэмплов в памяти с ограничением размера для предотвращения утечек.
 */
export class WaveformMemoryCache<T = number[]> {
  private cache = new Map<string, T>();
  private readonly maxSize: number;

  constructor(maxSize: number = 64) {
    this.maxSize = maxSize;
  }

  public get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  public set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
  }

  public has(key: string): boolean {
    return this.cache.has(key);
  }

  public clear(): void {
    this.cache.clear();
  }
}

/**
 * Извлечение актуальных CSS-переменных темы для тепловой карты.
 */
export function getWaveformThemeColors(target: HTMLElement): WaveformThemeColors {
  const computed = getComputedStyle(target);
  const accentRgb = computed.getPropertyValue("--accent-rgb").trim() || "59, 130, 246";
  const accentColor = computed.getPropertyValue("--accent").trim() || `rgb(${accentRgb})`;
  return { accentColor, accentRgb };
}

/**
 * Подготовка и синхронизация размеров буфера Canvas с физическими пикселями дисплея.
 */
export function updateCanvasMetrics(canvas: HTMLCanvasElement): WaveformMetrics | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.round(rect.width * dpr);
  const targetHeight = Math.round(rect.height * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  return {
    width: rect.width,
    height: rect.height,
    dpr,
  };
}

/**
 * Корректная и безопасная установка прозрачности (альфа-канала) для любого CSS-цвета.
 */
export function setAlpha(color: string, alpha: number): string {
  const cleanAlpha = Math.max(0, Math.min(1, alpha));
  const rgbaMatch = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (rgbaMatch) {
    return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${cleanAlpha})`;
  }
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map((c) => c + c).join("");
    }
    const pr = parseInt(hex.slice(0, 2), 16);
    const pg = parseInt(hex.slice(2, 4), 16);
    const pb = parseInt(hex.slice(4, 6), 16);
    const r = Number.isNaN(pr) ? 255 : pr;
    const g = Number.isNaN(pg) ? 255 : pg;
    const b = Number.isNaN(pb) ? 255 : pb;
    return `rgba(${r}, ${g}, ${b}, ${cleanAlpha})`;
  }
  return color;
}

/**
 * Разрешение цвета элемента тепловой карты в зависимости от нормализованного значения (0..1),
 * выбранной палитры и статуса воспроизведения (до или после playhead).
 * Впереди курсора цветовая информация спектра сохраняется с мягкой полупрозрачностью.
 */
export function resolveHeatmapColor(
  normalized: number,
  palette: HeatmapPalette,
  accentRgb: string,
  isPlayed: boolean
): string {
  const norm = Math.max(0, Math.min(1, normalized));

  let baseColor: string;
  switch (palette) {
    case "thermal": {
      if (norm < 0.28) {
        const t = norm / 0.28;
        const r = Math.round(30 + t * 20);
        const g = Math.round(110 + t * 70);
        const b = Math.round(245 - t * 45);
        baseColor = `rgba(${r}, ${g}, ${b}, 0.88)`;
      } else if (norm < 0.6) {
        const t = (norm - 0.28) / 0.32;
        const r = Math.round(50 + t * 180);
        const g = Math.round(180 + t * 45);
        const b = Math.round(200 - t * 160);
        baseColor = `rgba(${r}, ${g}, ${b}, 0.92)`;
      } else if (norm < 0.82) {
        const t = (norm - 0.6) / 0.22;
        const r = Math.round(230 + t * 25);
        const g = Math.round(225 - t * 105);
        const b = Math.round(40 - t * 20);
        baseColor = `rgba(${r}, ${g}, ${b}, 0.96)`;
      } else {
        const t = (norm - 0.82) / 0.18;
        const r = 255;
        const g = Math.round(120 - t * 80);
        const b = Math.round(20 + t * 25);
        baseColor = `rgba(${r}, ${g}, ${b}, 0.98)`;
      }
      break;
    }

    case "cyberpunk": {
      if (norm < 0.45) {
        const t = norm / 0.45;
        const r = Math.round(140 + t * 90);
        const g = Math.round(40 - t * 10);
        const b = Math.round(240 + t * 15);
        baseColor = `rgba(${r}, ${g}, ${b}, 0.86)`;
      } else if (norm < 0.78) {
        const t = (norm - 0.45) / 0.33;
        const r = Math.round(230 - t * 120);
        const g = Math.round(30 + t * 170);
        const b = 255;
        baseColor = `rgba(${r}, ${g}, ${b}, 0.94)`;
      } else {
        baseColor = "rgba(0, 240, 255, 0.98)";
      }
      break;
    }

    case "monochrome": {
      const brightness = Math.round(180 + norm * 75);
      const alpha = 0.65 + norm * 0.33;
      baseColor = `rgba(${brightness}, ${brightness}, ${brightness + 4}, ${alpha})`;
      break;
    }

    case "theme":
    default: {
      if (norm < 0.38) {
        baseColor = `rgba(${accentRgb}, 0.65)`;
      } else if (norm < 0.72) {
        baseColor = `rgba(${accentRgb}, 0.96)`;
      } else {
        const heat = Math.min(1, (norm - 0.72) / 0.28);
        const r = 255;
        const g = Math.round(110 + (1 - heat) * 50);
        const b = Math.round(65 * (1 - heat));
        baseColor = `rgba(${r}, ${g}, ${b}, 0.98)`;
      }
      break;
    }
  }

  if (!isPlayed) {
    return setAlpha(baseColor, Math.max(0.18, 0.28 + norm * 0.18));
  }

  return baseColor;
}

