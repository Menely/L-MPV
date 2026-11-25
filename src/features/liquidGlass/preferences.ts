import { colorAppearance, colorRgb, transformOklch } from "../../utils/colorMath";
import { PLAYER_THEMES, type PlayerThemeId } from "../../utils/playerPalettes";

export type PlayerTheme = "lmpv" | "glass";
export type GlassTintId = "transparent" | PlayerThemeId;

export interface GlassTintShaderParams {
  r: number;
  g: number;
  b: number;
  a: number;
  fallbackRgb: string;
}

const THEME_KEY = "l-mpv-player-interface-theme";
const LAYOUT_KEY = "l-mpv-liquid-glass-layout";
const BLUR_KEY = "l-mpv-liquid-glass-blur";
const REFRACTION_KEY = "l-mpv-liquid-glass-refraction";
const DISPERSION_KEY = "l-mpv-liquid-glass-dispersion";
const TINT_KEY = "l-mpv-liquid-glass-tint";

export const DEFAULT_GLASS_BLUR = 90;
/** Стандартная степень преломления (1.0× в шейдере, соответствует эталону Portable-L-MPV). */
export const DEFAULT_GLASS_REFRACTION = 5;
export const MAX_GLASS_REFRACTION = 10;
/** Стандартная степень хроматической дисперсии (1.0× в шейдере). */
export const DEFAULT_GLASS_DISPERSION = 5;
export const MAX_GLASS_DISPERSION = 10;
export const DEFAULT_GLASS_TINT: GlassTintId = "transparent";

export function getGlassBlur(): number {
  const saved = localStorage.getItem(BLUR_KEY);
  if (saved === null || !Number.isFinite(Number(saved))) return DEFAULT_GLASS_BLUR;
  return Math.min(100, Math.max(0, Math.round(Number(saved))));
}

export function saveGlassBlur(value: number) {
  if (!Number.isFinite(value)) return;
  localStorage.setItem(BLUR_KEY, String(Math.min(100, Math.max(0, Math.round(value)))));
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}

/** Возвращает текущую степень преломления Liquid Glass (0..10, по умолчанию 5). */
export function getGlassRefraction(): number {
  const saved = localStorage.getItem(REFRACTION_KEY);
  if (saved === null || !Number.isFinite(Number(saved))) return DEFAULT_GLASS_REFRACTION;
  return Math.min(MAX_GLASS_REFRACTION, Math.max(0, Math.round(Number(saved))));
}

/** Сохраняет степень преломления Liquid Glass (0..10) и уведомляет конвейер шейдера. */
export function saveGlassRefraction(value: number) {
  if (!Number.isFinite(value)) return;
  localStorage.setItem(
    REFRACTION_KEY,
    String(Math.min(MAX_GLASS_REFRACTION, Math.max(0, Math.round(value)))),
  );
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}

/** Возвращает текущую степень хроматической дисперсии Liquid Glass (0..10, по умолчанию 5). */
export function getGlassDispersion(): number {
  const saved = localStorage.getItem(DISPERSION_KEY);
  if (saved === null || !Number.isFinite(Number(saved))) return DEFAULT_GLASS_DISPERSION;
  return Math.min(MAX_GLASS_DISPERSION, Math.max(0, Math.round(Number(saved))));
}

/** Сохраняет степень хроматической дисперсии Liquid Glass (0..10) и уведомляет конвейер шейдера. */
export function saveGlassDispersion(value: number) {
  if (!Number.isFinite(value)) return;
  localStorage.setItem(
    DISPERSION_KEY,
    String(Math.min(MAX_GLASS_DISPERSION, Math.max(0, Math.round(value)))),
  );
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}

export function getPlayerTheme(): PlayerTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "glass" || saved === "lmpv") return saved;
    // Early Liquid Glass builds used the palette key for the interface mode.
    if (localStorage.getItem("l-mpv-player-theme") === "glass") {
      localStorage.setItem(THEME_KEY, "glass");
      return "glass";
    }
  } catch {
    return "lmpv";
  }
  return "lmpv";
}

export function setPlayerTheme(theme: PlayerTheme): PlayerTheme {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    return getPlayerTheme();
  }
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
  return theme;
}

export function subscribePlayerTheme(callback: () => void) {
  window.addEventListener("l-mpv-settings-changed", callback);
  return () => window.removeEventListener("l-mpv-settings-changed", callback);
}

export function readGlassLayout() {
  return localStorage.getItem(LAYOUT_KEY);
}

export function writeGlassLayout(layout: string) {
  localStorage.setItem(LAYOUT_KEY, layout);
}

export function getGlassTint(): GlassTintId {
  try {
    const saved = localStorage.getItem(TINT_KEY);
    if (saved === "transparent") return "transparent";
    if (saved && saved in PLAYER_THEMES) return saved as PlayerThemeId;
  } catch {
    return DEFAULT_GLASS_TINT;
  }
  return DEFAULT_GLASS_TINT;
}

export function saveGlassTint(tint: GlassTintId): GlassTintId {
  const valid: GlassTintId =
    tint === "transparent" || tint in PLAYER_THEMES ? tint : DEFAULT_GLASS_TINT;
  try {
    localStorage.setItem(TINT_KEY, valid);
  } catch {
    return getGlassTint();
  }
  window.dispatchEvent(new CustomEvent("l-mpv-glass-tint-changed", { detail: valid }));
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
  return valid;
}

export function getGlassTintShaderParams(tint: GlassTintId = getGlassTint()): GlassTintShaderParams {
  if (tint === "transparent" || !(tint in PLAYER_THEMES)) {
    return { r: 0, g: 0, b: 0, a: 0, fallbackRgb: "20, 22, 28" };
  }
  const theme = PLAYER_THEMES[tint];
  if (tint === "oled") {
    return { r: 0.03, g: 0.03, b: 0.045, a: 0.68, fallbackRgb: theme.tokens.bgGlassRgb };
  }
  const appearance = colorAppearance(theme.dotColor);
  const isNeutral = appearance.chroma < 0.028;
  const crystalHex = isNeutral
    ? transformOklch(theme.dotColor, 0.30, 1.15)
    : transformOklch(
        theme.dotColor,
        0.54,
        Math.min(1.52, Math.max(1.20, 0.105 / Math.max(appearance.chroma, 0.032))),
      );
  const [r, g, b] = colorRgb(crystalHex);
  return {
    r: Number((r / 255).toFixed(3)),
    g: Number((g / 255).toFixed(3)),
    b: Number((b / 255).toFixed(3)),
    a: isNeutral ? 0.42 : 0.50,
    fallbackRgb: theme.tokens.bgGlassRgb,
  };
}
