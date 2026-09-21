/**
 * Модуль управления цветовым оформлением плеера L-MPV:
 * темы оформления плеера (расцветки фона, поверхностей, текста),
 * палитры акцентных цветов, адаптивное неоновое свечение и динамическая гармонизация.
 */

// ─── Темы оформления плеера (Цвет фона и поверхностей) ───────────────────────

export type PlayerThemeId =
  | "graphite"
  | "discord"
  | "oled"
  | "sapphire"
  | "nord"
  | "indigo"
  | "emerald"
  | "pine"
  | "mint"
  | "amethyst"
  | "ruby";

export interface PlayerThemeTokens {
  bgPrimary: string;
  bgSurface: string;
  bgGlassRgb: string; // R, G, B для подложек со стеклом
  bgPillRgb: string;   // R, G, B для нижней плавающей панели
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderHover: string;
}

export interface PlayerThemeConfig {
  id: PlayerThemeId;
  name: string;
  badge?: string;
  desc: string;
  dotColor: string;
  surfaceColor: string;
  tokens: PlayerThemeTokens;
  recommendedAccents: string[];
}

export const PLAYER_THEMES: Record<PlayerThemeId, PlayerThemeConfig> = {
  graphite: {
    id: "graphite",
    name: "Тёмный графит",
    badge: "Стандарт",
    desc: "Фирменный нейтральный графитовый стиль L-MPV",
    dotColor: "#383f4c",
    surfaceColor: "#13161d",
    tokens: {
      bgPrimary: "#0b0d12",
      bgSurface: "#13161d",
      bgGlassRgb: "16, 19, 28",
      bgPillRgb: "10, 12, 18",
      textPrimary: "rgba(255, 255, 255, 0.92)",
      textSecondary: "rgba(255, 255, 255, 0.58)",
      textMuted: "rgba(255, 255, 255, 0.30)",
      border: "rgba(255, 255, 255, 0.07)",
      borderHover: "rgba(255, 255, 255, 0.14)",
    },
    recommendedAccents: ["#7fc7ff", "#00FF9D", "#e8a236", "#6ee7b7", "#93c5fd", "#EAB308"],
  },
  oled: {
    id: "oled",
    name: "Глубокий OLED",
    desc: "Абсолютно чёрный фон для максимальной контрастности и HDR",
    dotColor: "#08080a",
    surfaceColor: "#08080a",
    tokens: {
      bgPrimary: "#000000",
      bgSurface: "#09090b",
      bgGlassRgb: "8, 8, 10",
      bgPillRgb: "4, 4, 6",
      textPrimary: "rgba(255, 255, 255, 0.96)",
      textSecondary: "rgba(255, 255, 255, 0.62)",
      textMuted: "rgba(255, 255, 255, 0.32)",
      border: "rgba(255, 255, 255, 0.09)",
      borderHover: "rgba(255, 255, 255, 0.18)",
    },
    recommendedAccents: ["#00E5FF", "#00FF9D", "#FF2A5F", "#06B6D4", "#F43F5E", "#EAB308"],
  },
  sapphire: {
    id: "sapphire",
    name: "Сапфировая полночь",
    desc: "Глубокий тёмно-синий океанский оттенок с кристальным текстом",
    dotColor: "#223b68",
    surfaceColor: "#0d1629",
    tokens: {
      bgPrimary: "#070c18",
      bgSurface: "#0c1527",
      bgGlassRgb: "11, 19, 36",
      bgPillRgb: "7, 12, 23",
      textPrimary: "rgba(240, 246, 255, 0.94)",
      textSecondary: "rgba(196, 215, 245, 0.62)",
      textMuted: "rgba(160, 185, 222, 0.34)",
      border: "rgba(127, 199, 255, 0.09)",
      borderHover: "rgba(127, 199, 255, 0.18)",
    },
    recommendedAccents: ["#7fc7ff", "#00E5FF", "#3B82F6", "#93c5fd", "#06B6D4", "#fed7aa"],
  },
  emerald: {
    id: "emerald",
    name: "Тёмный изумруд",
    desc: "Благородный хвойно-нефритовый тон с чистой палитрой",
    dotColor: "#1b5844",
    surfaceColor: "#0b1f17",
    tokens: {
      bgPrimary: "#06130e",
      bgSurface: "#0a1d15",
      bgGlassRgb: "10, 26, 19",
      bgPillRgb: "6, 17, 12",
      textPrimary: "rgba(240, 255, 248, 0.94)",
      textSecondary: "rgba(190, 235, 215, 0.62)",
      textMuted: "rgba(150, 205, 180, 0.34)",
      border: "rgba(110, 231, 183, 0.09)",
      borderHover: "rgba(110, 231, 183, 0.18)",
    },
    recommendedAccents: ["#00FF9D", "#6ee7b7", "#10B981", "#a7f3d0", "#14B8A6", "#EAB308"],
  },
  amethyst: {
    id: "amethyst",
    name: "Аметист",
    desc: "Благородный глубокий пурпурный стиль с лавандовым сиянием",
    dotColor: "#552b7e",
    surfaceColor: "#231338",
    tokens: {
      bgPrimary: "#160b24",
      bgSurface: "#201133",
      bgGlassRgb: "30, 17, 48",
      bgPillRgb: "19, 10, 30",
      textPrimary: "rgba(250, 244, 255, 0.95)",
      textSecondary: "rgba(225, 205, 245, 0.65)",
      textMuted: "rgba(190, 165, 220, 0.38)",
      border: "rgba(196, 181, 253, 0.12)",
      borderHover: "rgba(196, 181, 253, 0.22)",
    },
    recommendedAccents: ["#c4b5fd", "#8B5CF6", "#D946EF", "#f0abfc", "#fda4af", "#F43F5E"],
  },
  nord: {
    id: "nord",
    name: "Холодный Норд",
    desc: "Арктический сланцево-стальной стиль с выверенным контрастом",
    dotColor: "#354a66",
    surfaceColor: "#151c27",
    tokens: {
      bgPrimary: "#0c1117",
      bgSurface: "#131a24",
      bgGlassRgb: "18, 25, 36",
      bgPillRgb: "11, 16, 23",
      textPrimary: "rgba(245, 249, 255, 0.94)",
      textSecondary: "rgba(198, 215, 235, 0.62)",
      textMuted: "rgba(155, 178, 205, 0.34)",
      border: "rgba(125, 211, 252, 0.09)",
      borderHover: "rgba(125, 211, 252, 0.18)",
    },
    recommendedAccents: ["#7dd3fc", "#5eead4", "#93c5fd", "#06B6D4", "#a7f3d0", "#A3E635"],
  },
  discord: {
    id: "discord",
    name: "Discord Gray",
    desc: "Узнаваемый матовый тёмно-серый стиль Discord с фирменной палитрой",
    dotColor: "#4e535e",
    surfaceColor: "#2e3035",
    tokens: {
      bgPrimary: "#202225",
      bgSurface: "#2e3035",
      bgGlassRgb: "44, 47, 53",
      bgPillRgb: "30, 31, 34",
      textPrimary: "rgba(242, 243, 245, 0.96)",
      textSecondary: "rgba(181, 186, 193, 0.70)",
      textMuted: "rgba(148, 155, 164, 0.44)",
      border: "rgba(255, 255, 255, 0.09)",
      borderHover: "rgba(255, 255, 255, 0.18)",
    },
    recommendedAccents: ["#6366F1", "#00FF9D", "#7fc7ff", "#93c5fd", "#EAB308", "#8B5CF6"],
  },
  pine: {
    id: "pine",
    name: "Лесной шалфей",
    desc: "Свежий природный шалфейно-хвойный стиль с мягким чистым контрастом",
    dotColor: "#335e4c",
    surfaceColor: "#1c352b",
    tokens: {
      bgPrimary: "#14261f",
      bgSurface: "#1c352b",
      bgGlassRgb: "32, 54, 45",
      bgPillRgb: "22, 38, 31",
      textPrimary: "rgba(242, 253, 247, 0.96)",
      textSecondary: "rgba(188, 228, 208, 0.72)",
      textMuted: "rgba(145, 192, 170, 0.45)",
      border: "rgba(110, 231, 183, 0.13)",
      borderHover: "rgba(110, 231, 183, 0.25)",
    },
    recommendedAccents: ["#00FF9D", "#6ee7b7", "#a7f3d0", "#10B981", "#bef264", "#fed7aa"],
  },
  mint: {
    id: "mint",
    name: "Мятный нефрит",
    desc: "Прохладный бирюзово-мятный стиль с чистым неоновым сиянием",
    dotColor: "#2c6563",
    surfaceColor: "#1a3837",
    tokens: {
      bgPrimary: "#122827",
      bgSurface: "#1a3837",
      bgGlassRgb: "30, 58, 56",
      bgPillRgb: "20, 40, 38",
      textPrimary: "rgba(240, 255, 253, 0.96)",
      textSecondary: "rgba(178, 235, 230, 0.72)",
      textMuted: "rgba(138, 200, 195, 0.45)",
      border: "rgba(94, 234, 212, 0.13)",
      borderHover: "rgba(94, 234, 212, 0.25)",
    },
    recommendedAccents: ["#5eead4", "#14B8A6", "#00E5FF", "#06B6D4", "#a7f3d0", "#10B981"],
  },
  ruby: {
    id: "ruby",
    name: "Коралловый закат",
    desc: "Тёплый пастельно-коралловый закатный стиль с мягким гармоничным светом",
    dotColor: "#6b3240",
    surfaceColor: "#341b22",
    tokens: {
      bgPrimary: "#241318",
      bgSurface: "#341b22",
      bgGlassRgb: "54, 30, 38",
      bgPillRgb: "38, 20, 25",
      textPrimary: "rgba(255, 245, 247, 0.96)",
      textSecondary: "rgba(248, 205, 214, 0.72)",
      textMuted: "rgba(220, 168, 178, 0.45)",
      border: "rgba(251, 113, 133, 0.13)",
      borderHover: "rgba(251, 113, 133, 0.25)",
    },
    recommendedAccents: ["#FF2A5F", "#F43F5E", "#fda4af", "#fca5a5", "#fed7aa", "#fdba74"],
  },
  indigo: {
    id: "indigo",
    name: "Лавандовый индиго",
    desc: "Элегантный лавандово-индиговый вечерний стиль с бархатной глубиной",
    dotColor: "#43477e",
    surfaceColor: "#242646",
    tokens: {
      bgPrimary: "#181932",
      bgSurface: "#242646",
      bgGlassRgb: "40, 42, 74",
      bgPillRgb: "26, 28, 50",
      textPrimary: "rgba(248, 248, 255, 0.96)",
      textSecondary: "rgba(210, 210, 248, 0.72)",
      textMuted: "rgba(170, 170, 222, 0.45)",
      border: "rgba(129, 140, 248, 0.13)",
      borderHover: "rgba(129, 140, 248, 0.25)",
    },
    recommendedAccents: ["#6366F1", "#c4b5fd", "#8B5CF6", "#93c5fd", "#06B6D4", "#f0abfc"],
  },
};

export const PLAYER_THEME_STORAGE_KEY = "l-mpv-player-theme";
export const DEFAULT_PLAYER_THEME: PlayerThemeId = "graphite";

/**
 * Получить сохраненную тему оформления плеера.
 */
export function getSavedPlayerTheme(): PlayerThemeId {
  try {
    const saved = localStorage.getItem(PLAYER_THEME_STORAGE_KEY) as PlayerThemeId | null;
    if (saved && saved in PLAYER_THEMES) {
      return saved;
    }
  } catch (e) {
    console.error("Ошибка загрузки темы плеера из localStorage:", e);
  }
  return DEFAULT_PLAYER_THEME;
}

/**
 * Получить фактический HEX акцентного цвета с учетом сохраненного цвета Windows.
 */
export function getEffectiveAccentColor(): string {
  try {
    const saved = localStorage.getItem("l-mpv-accent-color");
    if (saved && saved.startsWith("#")) {
      return saved;
    }
    if (saved === "windows") {
      const winHex = localStorage.getItem("l-mpv-accent-color-windows");
      if (winHex && winHex.startsWith("#")) {
        return winHex;
      }
    }
    const computed = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    if (computed && computed.startsWith("#")) {
      return computed;
    }
  } catch {}
  return "#7fc7ff";
}

/**
 * Применить тему оформления плеера (цвета фона, поверхностей, текста, бордеров).
 */
export function applyPlayerTheme(themeId: string): void {
  const root = document.documentElement;
  const config = (PLAYER_THEMES[themeId as PlayerThemeId] || PLAYER_THEMES.graphite);
  const { tokens } = config;

  root.setAttribute("data-player-theme", config.id);
  root.style.setProperty("--bg-primary", tokens.bgPrimary);
  root.style.setProperty("--bg-surface", tokens.bgSurface);
  root.style.setProperty("--bg-glass-rgb", tokens.bgGlassRgb);
  root.style.setProperty("--bg-pill-rgb", tokens.bgPillRgb);

  root.style.setProperty("--bg-glass", `rgba(${tokens.bgGlassRgb}, var(--ui-opacity, 0.88))`);
  root.style.setProperty("--bg-pill", `rgba(${tokens.bgPillRgb}, var(--ui-opacity, 0.88))`);

  root.style.setProperty("--text-primary", tokens.textPrimary);
  root.style.setProperty("--text-secondary", tokens.textSecondary);
  root.style.setProperty("--text-muted", tokens.textMuted);

  root.style.setProperty("--border", tokens.border);
  root.style.setProperty("--border-hover", tokens.borderHover);

  // Пересчитываем текущий акцентный цвет с гармонизацией под новую тему
  applyAccentColor(getEffectiveAccentColor());
}

/**
 * Сохранить и мгновенно применить тему оформления плеера.
 */
export function savePlayerTheme(themeId: string): void {
  const validId = themeId in PLAYER_THEMES ? (themeId as PlayerThemeId) : DEFAULT_PLAYER_THEME;
  try {
    localStorage.setItem(PLAYER_THEME_STORAGE_KEY, validId);
  } catch (e) {
    console.error("Ошибка сохранения темы плеера в localStorage:", e);
  }
  applyPlayerTheme(validId);
  window.dispatchEvent(new CustomEvent("l-mpv-player-theme-changed", { detail: validId }));
}

// ─── Пресеты акцентных цветов ───────────────────────────────────────────────

export const PASTEL_PRESETS = [
  "#7fc7ff", // 1. Original Soft Blue (Default)
  "#e8a236", // 2. Warm Amber / Gold
  "#f9a8d4", // 3. Soft Pink
  "#c4b5fd", // 4. Soft Lavender
  "#6ee7b7", // 5. Soft Mint
  "#fde047", // 6. Soft Cream Yellow
  "#fca5a5", // 7. Soft Coral Pink
  "#7dd3fc", // 8. Soft Sky
  "#fdba74", // 9. Soft Peach
  "#5eead4", // 10. Soft Turquoise Teal
  "#f0abfc", // 11. Soft Lilac Magenta
  "#bef264", // 12. Soft Pastel Lime
  "#a7f3d0", // 13. Soft Jade Mint
  "#fed7aa", // 14. Soft Warm Apricot
  "#93c5fd", // 15. Soft Cornflower Ice
  "#fda4af", // 16. Soft Sakura Rose
];

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
  "#F43F5E", // Radiant Coral Rose
  "#06B6D4", // Ocean Blue Cyan
  "#EAB308", // Pure Amber Gold
  "#10B981", // Pure Mint Emerald
];

export const VIBRANT_PRESETS = STANDARD_PRESETS;

export const MAX_CUSTOM_COLORS = 15;
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

// Преобразование HSL в RGB
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
  } else if (h < 120) {
    rPrime = x;
    gPrime = c;
  } else if (h < 180) {
    gPrime = c;
    bPrime = x;
  } else if (h < 240) {
    gPrime = x;
    bPrime = c;
  } else if (h < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
}

// Преобразование RGB в HSL
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

// Изменение яркости цвета
export function adjustBrightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const factor = 1 + percent / 100;
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}

// ─── Интенсивность неонового свечения (Glow Intensity) ───────────────────────

export type GlowIntensity = "off" | "soft" | "medium" | "intense";
export const GLOW_INTENSITY_STORAGE_KEY = "l-mpv-glow-intensity";

export function getGlowIntensity(): GlowIntensity {
  try {
    const saved = localStorage.getItem(GLOW_INTENSITY_STORAGE_KEY);
    if (saved === "off" || saved === "soft" || saved === "medium" || saved === "intense") {
      return saved;
    }
  } catch {}
  return "medium";
}

export function saveGlowIntensity(intensity: GlowIntensity): void {
  try {
    localStorage.setItem(GLOW_INTENSITY_STORAGE_KEY, intensity);
  } catch (e) {
    console.error("Ошибка сохранения интенсивности свечения:", e);
  }
  applyAccentColor(getEffectiveAccentColor());
  window.dispatchEvent(new CustomEvent("l-mpv-glow-changed", { detail: intensity }));
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}

// ─── Конфигурация слоев неонового свечения ───────────────────────────────────

interface GlowProfile {
  alpha: [standard: number, oled: number];
  shadow: (rgb: string) => string;
  thumb: (rgb: string) => string;
  timeline: (rgb: string) => string;
  activeIcon: (rgb: string) => string;
  playIcon: (rgb: string) => string;
  hoverIcon: (rgb: string) => string;
}

const GLOW_PROFILES: Record<Exclude<GlowIntensity, "off">, GlowProfile> = {
  soft: {
    alpha: [0.25, 0.20],
    shadow: (rgb) => `0 0 10px rgba(${rgb}, 0.35), 0 0 20px rgba(${rgb}, 0.15)`,
    thumb: (rgb) => `0 0 6px rgba(${rgb}, 0.50), 0 0 12px rgba(${rgb}, 0.25)`,
    timeline: (rgb) => `0 0 6px rgba(${rgb}, 0.40)`,
    activeIcon: (rgb) => `drop-shadow(0 0 3px rgba(${rgb}, 0.75)) drop-shadow(0 0 8px rgba(${rgb}, 0.35))`,
    playIcon: (rgb) => `drop-shadow(0 0 3px rgba(${rgb}, 0.85)) drop-shadow(0 0 9px rgba(${rgb}, 0.45))`,
    hoverIcon: (rgb) => `drop-shadow(0 0 3px rgba(${rgb}, 0.80)) drop-shadow(0 0 8px rgba(${rgb}, 0.40))`,
  },
  medium: {
    alpha: [0.48, 0.42],
    shadow: (rgb) => `0 0 14px rgba(${rgb}, 0.60), 0 0 28px rgba(${rgb}, 0.30)`,
    thumb: (rgb) => `0 0 8px rgba(${rgb}, 0.70), 0 0 16px rgba(${rgb}, 0.35)`,
    timeline: (rgb) => `0 0 8px rgba(${rgb}, 0.55), 0 0 2px rgba(${rgb}, 0.80)`,
    activeIcon: (rgb) => `drop-shadow(0 0 4px rgba(${rgb}, 0.95)) drop-shadow(0 0 14px rgba(${rgb}, 0.60)) drop-shadow(0 0 26px rgba(${rgb}, 0.30))`,
    playIcon: (rgb) => `drop-shadow(0 0 4px rgba(${rgb}, 0.95)) drop-shadow(0 0 14px rgba(${rgb}, 0.65)) drop-shadow(0 0 26px rgba(${rgb}, 0.35))`,
    hoverIcon: (rgb) => `drop-shadow(0 0 4px rgba(${rgb}, 0.90)) drop-shadow(0 0 12px rgba(${rgb}, 0.50))`,
  },
  intense: {
    alpha: [0.75, 0.68],
    shadow: (rgb) => `0 0 18px rgba(${rgb}, 0.80), 0 0 36px rgba(${rgb}, 0.45)`,
    thumb: (rgb) => `0 0 12px rgba(${rgb}, 0.90), 0 0 24px rgba(${rgb}, 0.55), 0 0 4px #fff`,
    timeline: (rgb) => `0 0 12px rgba(${rgb}, 0.85), 0 0 4px rgba(${rgb}, 1)`,
    activeIcon: (rgb) => `drop-shadow(0 0 5px rgba(${rgb}, 1)) drop-shadow(0 0 18px rgba(${rgb}, 0.80)) drop-shadow(0 0 34px rgba(${rgb}, 0.50))`,
    playIcon: (rgb) => `drop-shadow(0 0 5px rgba(${rgb}, 1)) drop-shadow(0 0 18px rgba(${rgb}, 0.85)) drop-shadow(0 0 36px rgba(${rgb}, 0.55))`,
    hoverIcon: (rgb) => `drop-shadow(0 0 5px rgba(${rgb}, 0.95)) drop-shadow(0 0 16px rgba(${rgb}, 0.75)) drop-shadow(0 0 28px rgba(${rgb}, 0.40))`,
  },
};

// ─── Применение акцентного цвета с динамической гармонизацией под тему ───────

export function applyAccentColor(value: string): void {
  const root = document.documentElement;
  const hex = value === "windows" || !value.startsWith("#") ? getEffectiveAccentColor() : value;

  const hover = adjustBrightness(hex, 15);
  const dim = adjustBrightness(hex, -25);
  const dark = adjustBrightness(hex, -45);

  const intensity = getGlowIntensity();
  const isOled = getSavedPlayerTheme() === "oled";

  const rgb = hexToRgb(hex) || { r: 127, g: 199, b: 255 };
  const rgbString = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

  const profile = intensity !== "off" ? GLOW_PROFILES[intensity] : null;
  const glowAlpha = profile ? (isOled ? profile.alpha[1] : profile.alpha[0]) : 0;

  root.setAttribute("data-glow", intensity);
  root.style.setProperty("--glow-intensity", intensity);
  root.style.setProperty("--accent-rgb", rgbString);
  root.style.setProperty("--accent-glow", glowAlpha > 0 ? `rgba(${rgbString}, ${glowAlpha})` : "transparent");
  root.style.setProperty("--accent-glass", `rgba(${rgbString}, 0.10)`);
  root.style.setProperty("--border-pill", `rgba(${rgbString}, 0.12)`);
  root.style.setProperty("--bg-hover", `rgba(${rgbString}, 0.09)`);
  root.style.setProperty("--bg-active", `rgba(${rgbString}, 0.15)`);

  root.style.setProperty("--shadow-glow", profile ? profile.shadow(rgbString) : "none");
  root.style.setProperty("--thumb-glow", profile ? profile.thumb(rgbString) : "none");
  root.style.setProperty("--timeline-glow", profile ? profile.timeline(rgbString) : "none");
  root.style.setProperty("--btn-glow", "none");
  root.style.setProperty("--play-btn-glow", "none");
  root.style.setProperty("--active-btn-glow", "none");
  root.style.setProperty("--active-icon-glow", profile ? profile.activeIcon(rgbString) : "none");
  root.style.setProperty("--play-icon-glow", profile ? profile.playIcon(rgbString) : "none");
  root.style.setProperty("--hover-icon-glow", profile ? profile.hoverIcon(rgbString) : "none");

  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-gradient", `linear-gradient(90deg, ${hex}, ${hover})`);
  root.style.setProperty("--accent-hover", hover);
  root.style.setProperty("--accent-dim", dim);
  root.style.setProperty("--accent-dark", dark);
}
