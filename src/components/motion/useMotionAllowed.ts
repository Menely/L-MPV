import { useSyncExternalStore } from "react";
import { isMotionAllowed } from "../../utils/animationUtils";

const listeners = new Set<() => void>();
let stopWatching: (() => void) | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!stopWatching) {
    const notify = () => listeners.forEach((update) => update());
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new MutationObserver(notify);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    media.addEventListener("change", notify);
    window.addEventListener("l-mpv-settings-changed", notify);
    window.addEventListener("storage", notify);
    stopWatching = () => {
      observer.disconnect();
      media.removeEventListener("change", notify);
      window.removeEventListener("l-mpv-settings-changed", notify);
      window.removeEventListener("storage", notify);
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopWatching?.();
      stopWatching = undefined;
    }
  };
}

/** Reacts to both OS changes and the existing application animation switch. */
export function useMotionAllowed(): boolean {
  return useSyncExternalStore(subscribe, isMotionAllowed, () => false);
}
