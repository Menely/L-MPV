import { useLayoutEffect, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getGlassBlur, getPlayerTheme } from "./preferences";
import { readNativeControls } from "./nativeControls";
import "./liquidGlass.css";

const selector = ".player-controls:not(.player-controls--capsule), .controls-islands-row, .controls-timeline-wrap .controls-island";

function readSurfaces(root: HTMLElement) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const opacity = Number(getComputedStyle(root).opacity);
  if (!width || !height || opacity < 0.01) return [];

  const normalize = (value: number, size: number) => Number((value / size).toFixed(5));
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).flatMap((surface) => {
    const style = getComputedStyle(surface);
    const rect = surface.getBoundingClientRect();
    if (style.visibility !== "visible" || rect.width < 1 || rect.height < 1 ||
        rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width) return [];
    const scale = surface.offsetHeight ? rect.height / surface.offsetHeight : 1;
    const radius = (value: string) => {
      const length = parseFloat(value) || 0;
      return normalize(value.endsWith("%") ? rect.height * length / 100 : length * scale, height);
    };
    const uiOpacity = parseFloat(style.getPropertyValue("--ui-opacity"));
    const strength = Number.isFinite(uiOpacity) ? Math.max(0, Math.min(1, uiOpacity)) : 1;
    return [{
      x: normalize(rect.x, width), y: normalize(rect.y, height),
      w: normalize(rect.width, width), h: normalize(rect.height, height),
      top_radius: radius(style.borderTopLeftRadius),
      bottom_radius: radius(style.borderBottomLeftRadius),
      opacity: Number((opacity * Number(style.opacity) * strength).toFixed(3)),
    }];
  }).slice(0, 10);
}

let pendingUpdate: Promise<unknown> = Promise.resolve();

function sendSurfaces(surfaces: ReturnType<typeof readSurfaces>, blur: number, controls: ReturnType<typeof readNativeControls> | null = null) {
  const update = pendingUpdate.then(() => invoke<boolean>("update_liquid_glass", { surfaces, blur, controls }));
  pendingUpdate = update.catch(() => {});
  return update;
}

export function useLiquidGlass(ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    let timer: number | undefined;
    let stopped = false;
    let inFlight = false;
    let active = false;
    let last = "";
    let needsClear = false;
    let lastSent = 0;
    let movingUntil = 0;

    const tick = async () => {
      if (stopped) return;
      const enabled = getPlayerTheme() === "glass";
      root.toggleAttribute("data-liquid-glass", enabled);
      if (!enabled) root.removeAttribute("data-native-glass");
      if (inFlight) return;
      window.clearTimeout(timer);
      const surfaces = enabled ? readSurfaces(root) : [];
      const blur = enabled ? getGlassBlur() : 0;
      const controls = surfaces.length ? readNativeControls(root) : null;
      const next = JSON.stringify({ surfaces, blur, controls });
      const changed = next !== last;
      if (changed) movingUntil = performance.now() + 150;
      if ((changed && (surfaces.length > 0 || needsClear)) ||
          (surfaces.length > 0 && performance.now() - lastSent > (active ? 750 : 120))) {
        inFlight = true;
        last = next;
        lastSent = performance.now();
        if (surfaces.length > 0) needsClear = true;
        try {
          active = await sendSurfaces(surfaces, blur, controls);
          needsClear = surfaces.length > 0;
        } catch (error) {
          last = "";
          active = false;
          console.warn("Liquid Glass:", error);
        } finally {
          inFlight = false;
        }
        if (stopped) return;
        if (enabled !== (getPlayerTheme() === "glass")) {
          void tick();
          return;
        }
      }
      root.toggleAttribute("data-native-glass", enabled && active && surfaces.length > 0);
      if (enabled) timer = window.setTimeout(tick, performance.now() < movingUntil ? 33 : 180);
    };

    const refresh = () => { void tick(); };
    window.addEventListener("l-mpv-settings-changed", refresh);
    window.addEventListener("resize", refresh);
    root.addEventListener("transitionrun", refresh);
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener("l-mpv-settings-changed", refresh);
      window.removeEventListener("resize", refresh);
      root.removeEventListener("transitionrun", refresh);
      root.removeAttribute("data-liquid-glass");
      root.removeAttribute("data-native-glass");
      if (needsClear) void sendSurfaces([], 0).catch(console.warn);
    };
  }, [ref]);
}
