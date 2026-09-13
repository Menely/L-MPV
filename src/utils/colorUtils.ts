export const PASTEL_PRESETS = [
  "#7fc7ff", // 1. Original Soft Blue (Default - не трогаем)
  "#e8a236", // 2. Warm Amber / Gold (не трогаем)
  "#f9a8d4", // 3. Soft Pink (мягкий розовый)
  "#c4b5fd", // 4. Soft Lavender (нежная лаванда)
  "#6ee7b7", // 5. Soft Mint (пастельная мята)
  "#fde047", // 6. Soft Cream Yellow (пастельно-желтый)
  "#fca5a5", // 7. Soft Coral Pink (пастельный коралловый)
  "#7dd3fc", // 8. Soft Sky (нежно-голубой)
  "#fdba74", // 9. Soft Peach (пастельный персиковый)
  "#5eead4", // 10. Soft Turquoise Teal (пастельная бирюза)
  "#f0abfc", // 11. Soft Lilac Magenta (пастельный сиреневый)
  "#bef264", // 12. Soft Pastel Lime (пастельный салатовый)
];

// ─── Пресет «Стандартные» (бывшие Однотонные) ───
export const STANDARD_PRESETS = [
  "#00FF9D", // Cyber Emerald / Neon Green
  "#00E5FF", // Cyber Cyan / Electric Blue
  "#3B82F6", // Deep Royal Blue
  "#8B5CF6", // Electric Violet
  "#D946EF", // Vivid Fuchsia
  "#FF2A5F", // Crimson / Neon Red
  "#FF5722", // Electric Orange
  "#FFB300", // Bright Sun / Amber
  "#A3E635", // Lime Punch
  "#14B8A6", // Rich Teal
  "#EC4899", // Deep Pink / Rose
  "#6366F1", // Indigo
];

// Для обратной совместимости
export const VIBRANT_PRESETS = STANDARD_PRESETS;

// Максимум 11 добавленных цветов (+ 1 кнопка Windows = ровно 12 слотов в сетке 3х4)
export const MAX_CUSTOM_COLORS = 11;
const CUSTOM_COLORS_STORAGE_KEY = "l-mpv-custom-accent-colors";

/**
 * Получить список сохраненных пользовательских цветов из localStorage.
 */
export function getCustomColors(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, MAX_CUSTOM_COLORS);
    }
  } catch (e) {
    console.error("Ошибка загрузки пользовательских цветов:", e);
  }
  return [];
}

/**
 * Сохранить список пользовательских цветов в localStorage.
 */
export function saveCustomColors(colors: string[]): void {
  try {
    const validColors = colors.slice(0, MAX_CUSTOM_COLORS);
    localStorage.setItem(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(validColors));
  } catch (e) {
    console.error("Ошибка сохранения пользовательских цветов:", e);
  }
}

// Преобразование HEX в RGB
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleanHex = hex.replace("#", "").trim();
  if (cleanHex.length !== 6 && cleanHex.length !== 3) return null;
  const fullHex = cleanHex.length === 3
    ? cleanHex.split("").map((c) => c + c).join("")
    : cleanHex;
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Преобразование RGB в HEX
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Преобразование HSL (h: 0-360, s: 0-100, l: 0-100) в RGB
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (h < 60) {
    rPrime = c;
    gPrime = x;
    bPrime = 0;
  } else if (h < 120) {
    rPrime = x;
    gPrime = c;
    bPrime = 0;
  } else if (h < 180) {
    rPrime = 0;
    gPrime = c;
    bPrime = x;
  } else if (h < 240) {
    rPrime = 0;
    gPrime = x;
    bPrime = c;
  } else if (h < 300) {
    rPrime = x;
    gPrime = 0;
    bPrime = c;
  } else {
    rPrime = c;
    gPrime = 0;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
}

// Преобразование RGB (0-255) в HSL (h: 0-360, s: 0-100, l: 0-100)
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0)) * 60;
    } else if (max === gNorm) {
      h = ((bNorm - rNorm) / delta + 2) * 60;
    } else {
      h = ((rNorm - gNorm) / delta + 4) * 60;
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// Изменение яркости цвета (percent от -100 до 100)
export function adjustBrightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  let { r, g, b } = rgb;

  r = Math.floor(r * (1 + percent / 100));
  g = Math.floor(g * (1 + percent / 100));
  b = Math.floor(b * (1 + percent / 100));

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export type GlowIntensity = "off" | "soft" | "medium" | "intense";
export const GLOW_INTENSITY_STORAGE_KEY = "l-mpv-glow-intensity";

export function getGlowIntensity(): GlowIntensity {
  const saved = localStorage.getItem(GLOW_INTENSITY_STORAGE_KEY);
  if (saved === "off" || saved === "soft" || saved === "medium" || saved === "intense") {
    return saved;
  }
  return "medium"; // По умолчанию сбалансированное свечение
}

export function saveGlowIntensity(intensity: GlowIntensity): void {
  localStorage.setItem(GLOW_INTENSITY_STORAGE_KEY, intensity);
  const currentAccent = localStorage.getItem("l-mpv-accent-color") || "#7fc7ff";
  applyAccentColor(currentAccent);
  window.dispatchEvent(new CustomEvent("l-mpv-glow-changed", { detail: intensity }));
}

// Применение нового акцентного цвета и неонового свечения
export function applyAccentColor(value: string) {
  const root = document.documentElement;

  // Однотонный цвет (HEX)
  const hex = value.startsWith("#") ? value : "#7fc7ff";
  const hover = adjustBrightness(hex, 15);
  const dim = adjustBrightness(hex, -25);
  const dark = adjustBrightness(hex, -45);

  const intensity = getGlowIntensity();

  const rgb = hexToRgb(hex) || { r: 127, g: 199, b: 255 };
  const rgbString = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

  // Переменные рассеивающегося свечения иконок (drop-shadow непосредственно от штрихов SVG)
  let glowAlpha = 0.38;
  let shadowGlow = "none";
  let thumbGlow = "none";
  let activeIconGlow = "none";
  let playIconGlow = "none";
  let hoverIconGlow = "none";

  if (intensity === "soft") {
    glowAlpha = 0.32;
    shadowGlow = `0 0 10px rgba(${rgbString}, 0.45), 0 0 20px rgba(${rgbString}, 0.22), 0 0 32px rgba(${rgbString}, 0.09)`;
    thumbGlow = `0 0 7px rgba(${rgbString}, 0.45), 0 0 14px rgba(${rgbString}, 0.22), 0 0 24px rgba(${rgbString}, 0.08)`;
    activeIconGlow = `drop-shadow(0 0 3px rgba(${rgbString}, 0.85)) drop-shadow(0 0 8px rgba(${rgbString}, 0.50)) drop-shadow(0 0 16px rgba(${rgbString}, 0.25))`;
    playIconGlow = `drop-shadow(0 0 3px rgba(${rgbString}, 0.85)) drop-shadow(0 0 9px rgba(${rgbString}, 0.50)) drop-shadow(0 0 18px rgba(${rgbString}, 0.25))`;
    hoverIconGlow = `drop-shadow(0 0 5px rgba(${rgbString}, 0.55)) drop-shadow(0 0 12px rgba(${rgbString}, 0.25))`;
  } else if (intensity === "medium") {
    glowAlpha = 0.48;
    shadowGlow = `0 0 12px rgba(${rgbString}, 0.60), 0 0 24px rgba(${rgbString}, 0.32), 0 0 38px rgba(${rgbString}, 0.14)`;
    thumbGlow = `0 0 8px rgba(${rgbString}, 0.60), 0 0 16px rgba(${rgbString}, 0.30), 0 0 28px rgba(${rgbString}, 0.12)`;
    activeIconGlow = `drop-shadow(0 0 3px rgba(${rgbString}, 0.95)) drop-shadow(0 0 10px rgba(${rgbString}, 0.70)) drop-shadow(0 0 22px rgba(${rgbString}, 0.35))`;
    playIconGlow = `drop-shadow(0 0 3px rgba(${rgbString}, 0.95)) drop-shadow(0 0 11px rgba(${rgbString}, 0.70)) drop-shadow(0 0 24px rgba(${rgbString}, 0.35))`;
    hoverIconGlow = `drop-shadow(0 0 6px rgba(${rgbString}, 0.70)) drop-shadow(0 0 15px rgba(${rgbString}, 0.35))`;
  } else if (intensity === "intense") {
    glowAlpha = 0.70;
    shadowGlow = `0 0 14px rgba(${rgbString}, 0.75), 0 0 28px rgba(${rgbString}, 0.45), 0 0 46px rgba(${rgbString}, 0.20)`;
    thumbGlow = `0 0 10px rgba(${rgbString}, 0.75), 0 0 20px rgba(${rgbString}, 0.40), 0 0 34px rgba(${rgbString}, 0.16)`;
    activeIconGlow = `drop-shadow(0 0 3px rgba(${rgbString}, 1)) drop-shadow(0 0 12px rgba(${rgbString}, 0.85)) drop-shadow(0 0 28px rgba(${rgbString}, 0.50))`;
    playIconGlow = `drop-shadow(0 0 4px rgba(${rgbString}, 1)) drop-shadow(0 0 14px rgba(${rgbString}, 0.85)) drop-shadow(0 0 30px rgba(${rgbString}, 0.50))`;
    hoverIconGlow = `drop-shadow(0 0 7px rgba(${rgbString}, 0.85)) drop-shadow(0 0 18px rgba(${rgbString}, 0.45))`;
  }

  root.style.setProperty("--accent-glow", `rgba(${rgbString}, ${glowAlpha})`);
  root.style.setProperty("--accent-glass", `rgba(${rgbString}, 0.08)`);
  root.style.setProperty("--border-pill", `rgba(${rgbString}, 0.10)`);
  root.style.setProperty("--bg-hover", `rgba(${rgbString}, 0.08)`);
  root.style.setProperty("--bg-active", `rgba(${rgbString}, 0.14)`);

  root.style.setProperty("--glow-intensity", intensity);
  root.style.setProperty("--shadow-glow", shadowGlow);
  root.style.setProperty("--thumb-glow", thumbGlow);
  root.style.setProperty("--btn-glow", "none");
  root.style.setProperty("--play-btn-glow", "none");
  root.style.setProperty("--active-btn-glow", "none");
  root.style.setProperty("--active-icon-glow", activeIconGlow);
  root.style.setProperty("--play-icon-glow", playIconGlow);
  root.style.setProperty("--hover-icon-glow", hoverIconGlow);

  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-gradient", `linear-gradient(90deg, ${hex}, ${hex})`);
  root.style.setProperty("--accent-hover", hover);
  root.style.setProperty("--accent-dim", dim);
  root.style.setProperty("--accent-dark", dark);
}
