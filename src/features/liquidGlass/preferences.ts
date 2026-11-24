export type PlayerTheme = "lmpv" | "glass";

const THEME_KEY = "l-mpv-player-interface-theme";
const LAYOUT_KEY = "l-mpv-liquid-glass-layout";
const BLUR_KEY = "l-mpv-liquid-glass-blur";

export const DEFAULT_GLASS_BLUR = 90;

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
