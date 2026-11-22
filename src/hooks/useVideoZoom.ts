import { useCallback, useLayoutEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const INITIAL_TRANSFORM = { zoom: 0, panX: 0, panY: 0 };

export function useVideoZoom(path: string | undefined, onApplied: (zoom: number) => void) {
  const target = useRef(INITIAL_TRANSFORM);
  const pending = useRef(false);
  const inFlight = useRef(false);
  const frame = useRef<number | null>(null);
  const generation = useRef(0);
  const notify = useRef(onApplied);
  useLayoutEffect(() => { notify.current = onApplied; }, [onApplied]);

  const schedule = useCallback(function schedule() {
    if (inFlight.current || frame.current !== null || !pending.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      pending.current = false;
      inFlight.current = true;
      const transform = target.current;
      const epoch = generation.current;
      invoke("set_video_zoom_and_pan", transform)
        .then(() => {
          if (epoch === generation.current && !pending.current) notify.current(transform.zoom);
        })
        .catch(console.error)
        .finally(() => {
          inFlight.current = false;
          schedule();
        });
    });
  }, []);

  useLayoutEffect(() => {
    target.current = INITIAL_TRANSFORM;
    return () => {
      generation.current++;
      pending.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [path]);

  const reset = useCallback(() => {
    target.current = INITIAL_TRANSFORM;
    pending.current = true;
    schedule();
  }, [schedule]);

  const wheel = useCallback((delta: number, x: number, y: number) => {
    if (delta === 0) return;
    const previous = target.current;
    let zoom = Math.max(-1.5, Math.min(3, previous.zoom + (delta < 0 ? 0.04 : -0.04)));
    if (Math.abs(zoom) < 0.025) zoom = 0;
    if (zoom === previous.zoom) return;
    const shift = 2 ** -previous.zoom - 2 ** -zoom;
    target.current = zoom === 0 ? INITIAL_TRANSFORM : {
      zoom,
      panX: previous.panX - x * shift,
      panY: previous.panY - y * shift,
    };
    pending.current = true;
    schedule();
  }, [schedule]);

  return { wheel, reset };
}
