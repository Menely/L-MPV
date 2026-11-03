/**
 * Модуль управления цветовым оформлением плеера L-MPV:
 * темы оформления плеера (расцветки фона, поверхностей, текста),
 * палитры акцентных цветов, адаптивное неоновое свечение и динамическая гармонизация.
 */

import { buildThemeRoles, colorRgb, mixColor, normalizeHex, onColor, readableColor, shiftLightness } from "./colorMath";

import { PLAYER_THEMES, type PlayerThemeId } from "./playerPalettes";
export { PLAYER_THEMES, PASTEL_PRESETS, STANDARD_PRESETS } from "./playerPalettes";
export type { PlayerThemeId, PlayerThemeConfig, PlayerThemeTokens } from "./playerPalettes";

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

function getCurrentUiOpacity(): number {
  try {
    const raw = localStorage.getItem("l-mpv-ui-opacity");
    if (raw) {
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 1.0) {
        return parsed;
      }
    }
  } catch {}
  return 0.88;
}

let isApplyingPlayerTheme = false;

/**
 * Применить тему оформления плеера (цвета фона, поверхностей, текста, бордеров).
 */
export function applyPlayerTheme(themeId: string): void {
  if (isApplyingPlayerTheme) return;
  isApplyingPlayerTheme = true;
  try {
    const root = document.documentElement;
    const config = (PLAYER_THEMES[themeId as PlayerThemeId] || PLAYER_THEMES.graphite);
    const { tokens } = config;
    const curOpacity = getCurrentUiOpacity();

    root.setAttribute("data-player-theme", config.id);
    root.style.setProperty("--bg-primary", tokens.bgPrimary);
    root.style.setProperty("--bg-surface", tokens.bgSurface);
    root.style.setProperty("--bg-modal-solid", tokens.bgSurface || "#11141c");
    root.style.setProperty("--bg-glass-rgb", tokens.bgGlassRgb);
    root.style.setProperty("--bg-pill-rgb", tokens.bgPillRgb);

    // Напрямую рассчитываем и применяем динамические свойства фона с текущей прозрачностью
    root.style.setProperty("--bg-pill", `rgba(${tokens.bgPillRgb}, ${curOpacity})`);
    root.style.setProperty("--bg-glass", `rgba(${tokens.bgGlassRgb}, ${curOpacity})`);
    root.style.setProperty("--bg-elevated", `rgba(${tokens.bgGlassRgb}, ${curOpacity})`);

    root.style.setProperty("--text-primary", tokens.textPrimary);
    root.style.setProperty("--text-secondary", tokens.textSecondary);
    root.style.setProperty("--text-muted", tokens.textMuted);

    root.style.setProperty("--border", tokens.border);
    root.style.setProperty("--border-hover", tokens.borderHover);
    root.style.setProperty("--border-default", tokens.border);

    // Пересчитываем текущий акцентный цвет с гармонизацией под новую тему
    applyAccentColor(getEffectiveAccentColor());

    window.dispatchEvent(new CustomEvent("l-mpv-player-theme-changed", { detail: config.id }));
    window.dispatchEvent(new CustomEvent("l-mpv-theme-changed", { detail: config.id }));
  } finally {
    isApplyingPlayerTheme = false;
  }
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
  window.dispatchEvent(new CustomEvent("l-mpv-theme-changed", { detail: validId }));
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}

// ─── Пресеты акцентных цветов ───────────────────────────────────────────────

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
  return normalizeHex(hex) ? shiftLightness(hex, percent / 250) : hex;
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
    activeIcon: (rgb) => `drop-shadow(0 0 3px rgba(${rgb}, 0.55))`,
    playIcon: (rgb) => `drop-shadow(0 0 4px rgba(${rgb}, 0.65))`,
    hoverIcon: (rgb) => `drop-shadow(0 0 4px rgba(${rgb}, 0.55))`,
  },
  medium: {
    alpha: [0.48, 0.42],
    shadow: (rgb) => `0 0 14px rgba(${rgb}, 0.60), 0 0 28px rgba(${rgb}, 0.30)`,
    thumb: (rgb) => `0 0 8px rgba(${rgb}, 0.70), 0 0 16px rgba(${rgb}, 0.35)`,
    timeline: (rgb) => `0 0 8px rgba(${rgb}, 0.55), 0 0 2px rgba(${rgb}, 0.80)`,
    activeIcon: (rgb) => `drop-shadow(0 0 3px rgba(${rgb}, 0.65)) drop-shadow(0 0 8px rgba(${rgb}, 0.25))`,
    playIcon: (rgb) => `drop-shadow(0 0 4px rgba(${rgb}, 0.75)) drop-shadow(0 0 10px rgba(${rgb}, 0.30))`,
    hoverIcon: (rgb) => `drop-shadow(0 0 4px rgba(${rgb}, 0.65))`,
  },
  intense: {
    alpha: [0.75, 0.68],
    shadow: (rgb) => `0 0 18px rgba(${rgb}, 0.80), 0 0 36px rgba(${rgb}, 0.45)`,
    thumb: (rgb) => `0 0 12px rgba(${rgb}, 0.90), 0 0 24px rgba(${rgb}, 0.55), 0 0 4px #fff`,
    timeline: (rgb) => `0 0 12px rgba(${rgb}, 0.85), 0 0 4px rgba(${rgb}, 1)`,
    activeIcon: (rgb) => `drop-shadow(0 0 4px rgba(${rgb}, 0.80)) drop-shadow(0 0 12px rgba(${rgb}, 0.35))`,
    playIcon: (rgb) => `drop-shadow(0 0 5px rgba(${rgb}, 0.85)) drop-shadow(0 0 14px rgba(${rgb}, 0.40))`,
    hoverIcon: (rgb) => `drop-shadow(0 0 5px rgba(${rgb}, 0.80)) drop-shadow(0 0 10px rgba(${rgb}, 0.30))`,
  },
};

// ─── Применение акцентного цвета с динамической гармонизацией под тему ───────

let isApplyingAccent = false;

export function applyAccentColor(value: string): void {
  if (isApplyingAccent) return;
  isApplyingAccent = true;
  try {
    const root = document.documentElement;
    const hex = normalizeHex(value === "windows" ? getEffectiveAccentColor() : value) || "#7fc7ff";

    const hover = adjustBrightness(hex, 15);
    const dim = adjustBrightness(hex, -25);
    const dark = adjustBrightness(hex, -45);

    const intensity = getGlowIntensity();
    const activeTheme = root.getAttribute("data-player-theme") as PlayerThemeId | null;
    const theme = PLAYER_THEMES[activeTheme || getSavedPlayerTheme()] || PLAYER_THEMES.graphite;
    const isOled = theme.id === "oled";
    const roles = buildThemeRoles(theme.tokens.bgSurface, theme.tokens.bgGlassRgb, hex);
    const borderRgb = colorRgb(mixColor("#c6d0dd", hex, 0.12)).join(", ");

    roles.levels.forEach((color, depth) => {
      root.style.setProperty(`--surface-tone-${depth}`, color);
      root.style.setProperty(`--surface-hover-${depth}`, roles.hoverLevels[depth]);
      root.style.setProperty(`--surface-inset-${depth}`, roles.insetLevels[depth]);
      root.style.setProperty(`--surface-selected-${depth}`, roles.selectedLevels[depth]);
      root.style.setProperty(`--surface-selected-hover-${depth}`, roles.selectedHoverLevels[depth]);
    });
    root.style.setProperty("--surface-root-glass", "rgba(var(--bg-glass-rgb), var(--ui-opacity, 0.88))");
    root.style.setProperty("--surface-card", "var(--surface-fill-1)");
    root.style.setProperty("--surface-card-hover", "var(--surface-fill-hover-1)");
    root.style.setProperty("--surface-card-selected", "var(--surface-fill-selected-1)");
    root.style.setProperty("--surface-card-selected-hover", "var(--surface-fill-selected-hover-1)");
    root.style.setProperty("--surface-child", "var(--surface-fill-2)");

    root.style.setProperty("--bg-elevated-rgb", colorRgb(roles.elevated).join(", "));
    root.style.setProperty("--bg-elevated", `rgba(${colorRgb(roles.elevated).join(", ")}, var(--ui-opacity, 0.88))`);
    root.style.setProperty("--bg-surface-elevated", "var(--bg-elevated)");
    root.style.setProperty("--surface-level-2", "var(--surface-fill-1)");
    root.style.setProperty("--surface-level-3", "var(--surface-fill-2)");
    root.style.setProperty("--surface-level-3-hover", "var(--surface-fill-hover-2)");
    root.style.setProperty("--bg-card", "var(--surface-level-3)");
    root.style.setProperty("--text-primary", roles.primary);
    root.style.setProperty("--text-secondary", roles.secondary);
    root.style.setProperty("--text-muted", roles.muted);
    root.style.setProperty("--text", "var(--text-primary)");
    root.style.setProperty("--text-tertiary", "var(--text-muted)");
    root.style.setProperty("--accent-text", roles.accentText);
    root.style.setProperty("--on-accent", onColor(hex));
    root.style.setProperty("--on-accent-hover", onColor(hover));
    root.style.setProperty("--focus-ring", readableColor(hex, roles.backgrounds, 3));
    root.style.setProperty("--border", `rgba(${borderRgb}, 0.16)`);
    root.style.setProperty("--border-default", "var(--border)");
    root.style.setProperty("--border-subtle", `rgba(${borderRgb}, 0.10)`);
    root.style.setProperty("--border-hover", `rgba(${borderRgb}, 0.28)`);
    root.style.setProperty("--surface-accent-subtle", "var(--surface-fill-selected-1)");
    root.style.setProperty("--surface-accent-hover", "var(--surface-fill-selected-hover-1)");
    root.style.setProperty("--surface-accent-border", "var(--focus-ring)");
    for (const [name, color] of Object.entries({ success: "#8dcbb2", warning: "#e0b77e", danger: "#e6a0aa", info: "#8ebce6" })) {
      const statusRgb = colorRgb(color).join(", ");
      const statusBackgrounds = roles.backgrounds.map(bg => mixColor(bg, color, 0.10));
      root.style.setProperty(`--${name}-text`, readableColor(color, statusBackgrounds));
      root.style.setProperty(`--${name}-surface`, `rgba(${statusRgb}, 0.10)`);
      root.style.setProperty(`--${name}-border`, `rgba(${statusRgb}, 0.32)`);
      root.style.setProperty(`--${name}-glow`, intensity === "off" ? "transparent" : `rgba(${statusRgb}, 0.20)`);
    }

    const rgb = hexToRgb(hex) || { r: 127, g: 199, b: 255 };
    const rgbString = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

    const profile = intensity !== "off" ? GLOW_PROFILES[intensity] : null;
    const glowAlpha = profile ? (isOled ? profile.alpha[1] : profile.alpha[0]) : 0;

    root.setAttribute("data-glow", intensity);
    root.style.setProperty("--glow-intensity", intensity);
    root.style.setProperty("--accent-rgb", rgbString);
    root.style.setProperty("--accent-glow", glowAlpha > 0 ? `rgba(${rgbString}, ${glowAlpha})` : "transparent");
    root.style.setProperty("--surface-accent-glow", glowAlpha > 0 ? `rgba(${rgbString}, ${glowAlpha * 0.45})` : "transparent");
    root.style.setProperty("--accent-glass", "var(--surface-accent-subtle)");
    const interactionRgb = colorRgb(readableColor(hex, roles.backgrounds, 3)).join(", ");
    root.style.setProperty("--border-pill", `rgba(${interactionRgb}, 0.18)`);
    root.style.setProperty("--border-pill-hover", `rgba(${interactionRgb}, 0.45)`);
    root.style.setProperty("--bg-hover", "var(--surface-level-3-hover)");
    root.style.setProperty("--bg-active", "var(--surface-accent-hover)");

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

    window.dispatchEvent(new CustomEvent("l-mpv-accent-changed", { detail: hex }));
    window.dispatchEvent(new CustomEvent("l-mpv-accent-color-changed", { detail: hex }));
  } finally {
    isApplyingAccent = false;
  }
}
