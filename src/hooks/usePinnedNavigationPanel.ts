import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { getActiveUiScale } from "../utils/uiThemeUtils";

interface Geometry { top: number; height: number }

/** Inputs/outputs use layout CSS pixels; viewport and controls use measured pixels. */
export function fitPinnedNavigationGeometry(base: Geometry, viewportHeight: number, controlsTop: number | null, scale: number): Geometry {
  const zoom = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const margin = 8;
  const bottom = Math.max(margin + 1, Math.min(viewportHeight - margin,
    controlsTop !== null && Number.isFinite(controlsTop) ? controlsTop - margin : viewportHeight - margin));
  const height = Math.min(Math.max(1, base.height * zoom), bottom - margin);
  const top = Math.max(margin, Math.min(base.top * zoom, bottom - height));
  return { top: top / zoom, height: height / zoom };
}

/** Freeze the shared panel's geometry, independent of its current tab or content. */
export function usePinnedNavigationPanel(panelRef: RefObject<HTMLDivElement | null>, visible: boolean) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const base = useRef<Geometry | null>(null);
  const shown = useRef<Geometry | null>(null);
  const dragCleanup = useRef<((cancel?: boolean) => void) | null>(null);
  const fit = useCallback(() => {
    if (!base.current) return;
    const controls = document.querySelector<HTMLElement>(".player-controls-wrapper");
    const rect = controls?.getBoundingClientRect();
    const next = fitPinnedNavigationGeometry(base.current, window.innerHeight,
      rect && rect.height > 0 ? rect.top : null, getActiveUiScale());
    shown.current = next;
    setGeometry(previous => previous?.top === next.top && previous.height === next.height ? previous : next);
  }, []);

  const togglePinned = useCallback(() => {
    if (!visible) return;
    dragCleanup.current?.();
    if (base.current) {
      base.current = null; shown.current = null; setGeometry(null);
      return;
    }
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;
    const scale = getActiveUiScale();
    base.current = { top: rect.top / scale, height: rect.height / scale };
    fit();
  }, [fit, panelRef, visible]);

  const onGripPointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (!visible || event.button !== 0 || !base.current || !shown.current) return;
    event.preventDefault(); event.stopPropagation();
    dragCleanup.current?.();
    const original = { ...base.current };
    const startTop = shown.current.top;
    const startY = event.clientY;
    const scale = getActiveUiScale();
    const pointerId = event.pointerId;
    const target = event.currentTarget;
    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    try { target.setPointerCapture(pointerId); } catch { /* Window events also support capture-less webviews. */ }
    let frame: number | null = null;
    let pendingTop: number | null = null;
    const flush = () => {
      frame = null;
      if (pendingTop === null || !base.current) return;
      base.current = { ...base.current, top: pendingTop };
      pendingTop = null;
      fit();
    };
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      pendingTop = startTop + (next.clientY - startY) / scale;
      if (frame === null) frame = requestAnimationFrame(flush);
    };
    const finish = (cancel = false, publish = true) => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      if (!publish) pendingTop = null;
      else if (cancel && base.current) { base.current = original; pendingTop = null; fit(); }
      else flush();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancelled);
      window.removeEventListener("blur", blurred);
      try { target.releasePointerCapture(pointerId); } catch { /* Capture may already be released. */ }
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelection;
      dragCleanup.current = null;
    };
    const up = (next: globalThis.PointerEvent) => { if (next.pointerId === pointerId) finish(); };
    const cancelled = (next: globalThis.PointerEvent) => { if (next.pointerId === pointerId) finish(true); };
    const blurred = () => finish();
    dragCleanup.current = () => finish(false, false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancelled);
    window.addEventListener("blur", blurred);
  }, [fit, visible]);

  const onGripKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (!visible || !base.current || !shown.current || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    dragCleanup.current?.();
    const step = event.shiftKey ? 32 : 8;
    const top = event.key === "Home" ? 0 : event.key === "End" ? window.innerHeight / getActiveUiScale()
      : shown.current.top + (event.key === "ArrowDown" ? step : -step);
    base.current = { ...base.current, top };
    fit();
  }, [fit, visible]);

  const pinned = geometry !== null;
  useLayoutEffect(() => {
    if (!visible || !pinned) { dragCleanup.current?.(); return; }
    fit();
    const observer = new ResizeObserver(fit);
    if (panelRef.current) observer.observe(panelRef.current);
    const controls = document.querySelector(".player-controls-wrapper");
    if (controls) observer.observe(controls);
    window.addEventListener("resize", fit);
    window.addEventListener("l-mpv-ui-scale-changed", fit);
    window.addEventListener("l-mpv-settings-changed", fit);
    return () => {
      observer.disconnect();
      dragCleanup.current?.();
      window.removeEventListener("resize", fit);
      window.removeEventListener("l-mpv-ui-scale-changed", fit);
      window.removeEventListener("l-mpv-settings-changed", fit);
    };
  }, [visible, pinned, fit, panelRef]);
  return { pinned, geometry, togglePinned, onGripPointerDown, onGripKeyDown };
}
