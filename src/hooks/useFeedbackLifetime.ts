import { useCallback, useEffect, useRef } from "react";
import { useMotionAllowed } from "../components/motion/useMotionAllowed";
import { isMotionAllowed } from "../utils/animationUtils";

interface FeedbackLifetimeOptions {
  holdMs: number;
  onFade: () => void;
  onRemove: () => void;
}

/** Reading time is independent of motion; only the outgoing fade is optional. */
export function useFeedbackLifetime({ holdMs, onFade, onRemove }: FeedbackLifetimeOptions) {
  const allowed = useMotionAllowed();
  const callbacks = useRef({ onFade, onRemove });
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fading = useRef(false);

  useEffect(() => { callbacks.current = { onFade, onRemove }; }, [onFade, onRemove]);

  const cancel = useCallback(() => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    if (fadeTimer.current !== null) clearTimeout(fadeTimer.current);
    holdTimer.current = fadeTimer.current = null;
    fading.current = false;
  }, []);

  const remove = useCallback(() => {
    cancel();
    callbacks.current.onRemove();
  }, [cancel]);

  const restart = useCallback(() => {
    cancel();
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      if (!isMotionAllowed()) { remove(); return; }
      // CSS owns the fade duration, so changing its token cannot leave stale DOM.
      const token = getComputedStyle(document.documentElement).getPropertyValue("--t-feedback-exit").trim();
      const milliseconds = Number.parseFloat(token) * (token.endsWith("ms") ? 1 : 1000);
      if (!Number.isFinite(milliseconds) || milliseconds <= 0) { remove(); return; }
      fading.current = true;
      callbacks.current.onFade();
      fadeTimer.current = setTimeout(remove, milliseconds);
    }, holdMs);
  }, [cancel, holdMs, remove]);

  useEffect(() => { if (!allowed && fading.current) remove(); }, [allowed, remove]);
  useEffect(() => cancel, [cancel]);
  return { restart, cancel };
}
