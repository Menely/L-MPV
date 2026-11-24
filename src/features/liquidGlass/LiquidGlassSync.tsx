import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CLOSE_BUFFER_MS, T_PANEL_MS } from "../../utils/animationUtils";
import { getGlassBlur, subscribePlayerTheme } from "./preferences";

interface SurfaceRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  a: number;
  f: number;
  dockedBottom?: boolean;
}

interface LiquidGlassConfigureResult {
  ready: boolean;
  supported: boolean;
}

interface Props {
  /** Тема Liquid Glass включена и воспроизводится медиафайл. */
  enabled: boolean;
  /** Панель управления в данный момент должна отображаться (не idle). */
  visible: boolean;
}

const MAX_SLOTS = 12;
const ANIMATION_TRACK_MS = T_PANEL_MS + CLOSE_BUFFER_MS + 80;

let pendingOptions: object | null = null;
let pendingCallback: ((res: LiquidGlassConfigureResult) => void) | null = null;
let sending = false;

function dispatchGlassConfig(
  options: object,
  onResult: (res: LiquidGlassConfigureResult) => void,
) {
  pendingOptions = options;
  pendingCallback = onResult;
  if (sending) return;
  sending = true;
  const pump = () => {
    const next = pendingOptions;
    const cb = pendingCallback;
    pendingOptions = null;
    pendingCallback = null;
    if (!next) {
      sending = false;
      return;
    }
    void invoke<LiquidGlassConfigureResult>("configure_liquid_glass", { options: next })
      .then((res) => {
        cb?.(res);
      })
      .catch((error) => {
        console.warn("Liquid Glass sync:", error);
      })
      .finally(() => {
        if (pendingOptions) {
          pump();
        } else {
          sending = false;
        }
      });
  };
  pump();
}

function measureEffectiveOpacity(el: HTMLElement, root: HTMLElement): number {
  let opacity = 1;
  let current: HTMLElement | null = el;
  while (current) {
    const raw = parseFloat(getComputedStyle(current).opacity);
    opacity *= Number.isFinite(raw) ? raw : 1;
    if (opacity <= 0.005 || current === root) break;
    current = current.parentElement;
  }
  return opacity;
}

function collectElementSurface(
  el: Element | null,
  root: HTMLElement,
  frost: number,
  dockedBottom = false,
): SurfaceRect | null {
  if (!(el instanceof HTMLElement)) return null;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return null;

  const rect = el.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) return null;

  const opacity = measureEffectiveOpacity(el, root);
  if (opacity <= 0.005) return null;

  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  const zoomScale = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
  const rawRadius = parseFloat(style.borderTopLeftRadius) || 0;
  const radiusPx = Math.min(rawRadius * zoomScale, rect.width / 2, rect.height / 2);

  const surface: SurfaceRect = {
    x: Number((rect.left / vw).toFixed(5)),
    y: Number((rect.top / vh).toFixed(5)),
    w: Number((rect.width / vw).toFixed(5)),
    h: Number((rect.height / vh).toFixed(5)),
    r: Number(radiusPx.toFixed(2)),
    a: Number(Math.min(1, Math.max(0, opacity)).toFixed(3)),
    f: frost,
  };
  if (dockedBottom) surface.dockedBottom = true;
  return surface;
}

function collectGlassSurfaces(wrapper: HTMLElement): SurfaceRect[] {
  const wrapperStyle = getComputedStyle(wrapper);
  if (wrapperStyle.display === "none" || wrapperStyle.visibility === "hidden") return [];
  const wrapperOpacity = parseFloat(wrapperStyle.opacity);
  if (Number.isFinite(wrapperOpacity) && wrapperOpacity <= 0.005) return [];

  const surfaces: SurfaceRect[] = [];
  const push = (el: Element | null, frost: number, dockedBottom = false) => {
    if (surfaces.length >= MAX_SLOTS) return;
    const item = collectElementSurface(el, wrapper, frost, dockedBottom);
    if (item) surfaces.push(item);
  };

  const controls = wrapper.querySelector(".player-controls");
  if (controls instanceof HTMLElement) {
    if (controls.classList.contains("player-controls--capsule")) {
      push(controls.querySelector(".controls-island--timeline"), 0);
      controls.querySelectorAll(".controls-island--time").forEach((el) => push(el, 0));
      push(controls.querySelector(".controls-islands-row"), 0);
    } else {
      const docked = controls.classList.contains("player-controls--docked");
      push(controls, 0, docked);
    }
  }

  push(wrapper.querySelector(".time-display--floating-center"), 0);

  const trackPopover = wrapper.querySelector(".track-popover");
  if (trackPopover instanceof HTMLElement) {
    if (trackPopover.classList.contains("track-popover--capsule")) {
      push(trackPopover.querySelector(".track-popover__heading"), 1);
      push(trackPopover.querySelector(".track-popover__header-actions"), 1);
      push(trackPopover.querySelector(".track-popover__disable-sub-card"), 1);
      push(trackPopover.querySelector(".track-popover__list-surface"), 1);
    } else {
      push(trackPopover, 1);
    }
  }

  push(wrapper.querySelector(".controls-overflow"), 1);

  return surfaces;
}

/**
 * Синхронизирует геометрию статичных и поповерных React-элементов панели
 * с GLSL-шейдером размытия Liquid Glass в mpv.
 */
export function LiquidGlassSync({ enabled, visible }: Props) {
  const animateUntilRef = useRef(0);

  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      root.removeAttribute("data-interface-theme");
      root.removeAttribute("data-liquid-glass-active");
      dispatchGlassConfig({ active: false, blur: 0, viewportH: 0, surfaces: [] }, () => {});
      return;
    }

    root.setAttribute("data-interface-theme", "glass");
    let disposed = false;
    let rafId = 0;
    let retryTimer = 0;
    let lastSignature = "";

    const flush = () => {
      if (disposed) return;
      const wrapper = document.querySelector<HTMLElement>(".player-controls-wrapper");
      const surfaces = wrapper ? collectGlassSurfaces(wrapper) : [];
      const options = {
        active: true,
        blur: getGlassBlur(),
        viewportH: Math.max(1, window.innerHeight),
        surfaces,
      };
      const signature = JSON.stringify(options);
      if (signature !== lastSignature) {
        lastSignature = signature;
        dispatchGlassConfig(options, (res) => {
          if (disposed) return;
          if (!res.ready) {
            lastSignature = "";
            window.clearTimeout(retryTimer);
            retryTimer = window.setTimeout(() => scheduleFrame(140), 50);
          } else {
            root.setAttribute("data-liquid-glass-active", res.supported ? "true" : "false");
          }
        });
      }
    };

    const tick = () => {
      rafId = 0;
      if (disposed) return;
      flush();
      if (performance.now() < animateUntilRef.current) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const scheduleFrame = (durationMs = 0) => {
      if (disposed) return;
      if (durationMs > 0) {
        animateUntilRef.current = Math.max(animateUntilRef.current, performance.now() + durationMs);
      }
      if (!rafId) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const handleTransition = () => scheduleFrame(ANIMATION_TRACK_MS);
    const handleTransitionEnd = () => scheduleFrame(32);
    const handleSettings = () => scheduleFrame(ANIMATION_TRACK_MS);

    const wrapper = document.querySelector<HTMLElement>(".player-controls-wrapper");
    const appContainer = document.querySelector<HTMLElement>(".app-container");

    const resizeObserver = new ResizeObserver(() => scheduleFrame(160));
    if (wrapper) {
      resizeObserver.observe(wrapper);
      const controls = wrapper.querySelector(".player-controls");
      if (controls) resizeObserver.observe(controls);
      wrapper.addEventListener("transitionstart", handleTransition);
      wrapper.addEventListener("animationstart", handleTransition);
      wrapper.addEventListener("transitionend", handleTransitionEnd);
      wrapper.addEventListener("animationend", handleTransitionEnd);
    }

    const mutationObserver = new MutationObserver((records) => {
      const hasRelevantChange = records.some((record) => {
        if (record.target instanceof Element && record.target.closest(".timeline-preview-card, .waveform-activity-strip__badge")) {
          return false;
        }
        return true;
      });
      if (hasRelevantChange) {
        scheduleFrame(ANIMATION_TRACK_MS);
      }
    });
    if (wrapper) {
      mutationObserver.observe(wrapper, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "data-motion-surface"],
      });
    }

    const idleObserver = new MutationObserver(() => scheduleFrame(ANIMATION_TRACK_MS));
    if (appContainer) {
      idleObserver.observe(appContainer, { attributes: true, attributeFilter: ["class"] });
    }

    const unsubscribeTheme = subscribePlayerTheme(handleSettings);
    window.addEventListener("resize", handleSettings);
    window.addEventListener("l-mpv-ui-scale-changed", handleSettings);
    window.addEventListener("l-mpv-ui-radius-changed", handleSettings);
    window.addEventListener("l-mpv-timeline-layout-changed", handleSettings);

    scheduleFrame(ANIMATION_TRACK_MS);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(retryTimer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      idleObserver.disconnect();
      unsubscribeTheme();
      if (wrapper) {
        wrapper.removeEventListener("transitionstart", handleTransition);
        wrapper.removeEventListener("animationstart", handleTransition);
        wrapper.removeEventListener("transitionend", handleTransitionEnd);
        wrapper.removeEventListener("animationend", handleTransitionEnd);
      }
      window.removeEventListener("resize", handleSettings);
      window.removeEventListener("l-mpv-ui-scale-changed", handleSettings);
      window.removeEventListener("l-mpv-ui-radius-changed", handleSettings);
      window.removeEventListener("l-mpv-timeline-layout-changed", handleSettings);
    };
  }, [enabled, visible]);

  return null;
}
