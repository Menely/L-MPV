export interface NavigationPanelGeometry { top: number; height: number }
export const NAVIGATION_PIN_KEY = "l-mpv-navigation-panel-pin";
export const NAVIGATION_PIN_EVENT = "l-mpv-navigation-pin-changed";
export function parseNavigationPin(value: unknown): NavigationPanelGeometry | null {
  if (!value || typeof value !== "object") return null;
  const { top, height } = value as Partial<NavigationPanelGeometry>;
  return typeof top === "number" && Number.isFinite(top) && top >= 0 && top <= 100000
    && typeof height === "number" && Number.isFinite(height) && height > 0 && height <= 10000 ? { top, height } : null;
}
export function readNavigationPin(): NavigationPanelGeometry | null {
  try { return parseNavigationPin(JSON.parse(localStorage.getItem(NAVIGATION_PIN_KEY) || "null")); }
  catch { return null; }
}
export function saveNavigationPin(value: NavigationPanelGeometry | null, notify = true): void {
  try { localStorage.setItem(NAVIGATION_PIN_KEY, JSON.stringify(value)); } catch { /* Session remains usable. */ }
  if (notify) window.dispatchEvent(new Event("l-mpv-settings-changed"));
}
