import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { getActiveUiScale } from "../theme/tokens";
import { readNavigationPin, saveNavigationPin, NAVIGATION_PIN_EVENT } from "../utils/navigationPanelPin";

interface Geometry { top: number; height: number }

/** Inputs/outputs use layout CSS pixels; viewport and controls use measured pixels. */
export function fitPinnedNavigationGeometry(base: Geometry, viewportHeight: number, controlsTop: number | null, scale: number, minimumTop = 8, renderedHeight?: number): Geometry {
  const zoom = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const margin = 8;
  const bottom = Math.max(margin + 1, Math.min(viewportHeight - margin,
    controlsTop !== null && Number.isFinite(controlsTop) ? controlsTop - margin : viewportHeight - margin));
  const start = Math.min(bottom - 1, Math.max(margin, minimumTop));
  const limit = Math.min(Math.max(1, base.height * zoom), bottom - start);
  const visibleHeight = renderedHeight !== undefined && Number.isFinite(renderedHeight) && renderedHeight > 0
    ? Math.min(renderedHeight, limit) : limit;
  const top = Math.max(start, Math.min(base.top * zoom, bottom - visibleHeight));
  return { top: top / zoom, height: Math.min(limit, bottom - top) / zoom };
}

/** Keep a pinned top and height limit; the rendered card can shrink with its content. */
export function usePinnedNavigationPanel(panelRef: RefObject<HTMLDivElement | null>, visible: boolean) {
  const [initial] = useState(readNavigationPin);
  const [geometry, setGeometry] = useState<Geometry | null>(initial);
  const base = useRef<Geometry | null>(initial);
  const shown = useRef<Geometry | null>(initial);
  const dragCleanup = useRef<((cancel?: boolean) => void) | null>(null);
  const fit = useCallback(() => {
    if (!base.current) return;
    const controls = document.querySelector<HTMLElement>(".player-controls-wrapper");
    const rect = controls?.getBoundingClientRect();
    const titlebar = document.querySelector<HTMLElement>(".titlebar")?.getBoundingClientRect();
    const minimumTop = titlebar && Number.isFinite(titlebar.bottom) && titlebar.bottom > 0 ? titlebar.bottom + 8 : 8;
    const next = fitPinnedNavigationGeometry(base.current, window.innerHeight,
      rect && rect.height > 0 ? rect.top : null, getActiveUiScale(), minimumTop, panelRef.current?.getBoundingClientRect().height);
    shown.current = next;
    setGeometry(previous => previous?.top === next.top && previous.height === next.height ? previous : next);
  }, [panelRef]);

  const togglePinned = useCallback(() => {
    if (!visible) return;
    dragCleanup.current?.();
    if (base.current) {
      base.current = null; shown.current = null; setGeometry(null); saveNavigationPin(null);
      return;
    }
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;
    const scale = getActiveUiScale();
    base.current = { top: rect.top / scale, height: rect.height / scale };
    fit();
    if (shown.current) base.current.top = shown.current.top;
    saveNavigationPin(base.current);
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
      if (publish && !cancel && base.current && shown.current) {
        base.current = { ...base.current, top: shown.current.top }; saveNavigationPin(base.current);
      }
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
    // Persist the visible position, rather than an out-of-bounds Home/End target.
    if (shown.current) { base.current = { ...base.current, top: shown.current.top }; saveNavigationPin(base.current); }
  }, [fit, visible]);

  const pinned = geometry !== null;
  useLayoutEffect(() => {
    const restore = () => {
      dragCleanup.current?.();
      base.current = readNavigationPin();
      shown.current = base.current;
      if (base.current) fit(); else setGeometry(null);
    };
    window.addEventListener(NAVIGATION_PIN_EVENT, restore);
    return () => window.removeEventListener(NAVIGATION_PIN_EVENT, restore);
  }, [fit]);
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
