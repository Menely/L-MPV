import { useCallback, useEffect, useRef } from "react";
import { useIsPresent } from "motion/react";

interface SurfaceDismissOptions {
  onClose: () => void;
  disabled?: boolean;
  closeOnEscape?: boolean;
  onBeforeClose?: () => void;
}

/** Request removal; the surrounding AnimatePresence/MotionSurface owns completion. */
export function useSurfaceDismiss({
  onClose, disabled = false, closeOnEscape = true, onBeforeClose,
}: SurfaceDismissOptions) {
  const isPresent = useIsPresent();
  const requestedRef = useRef(false);

  useEffect(() => {
    if (isPresent) requestedRef.current = false;
  }, [isPresent]);

  const handleClose = useCallback(() => {
    if (!isPresent || disabled || requestedRef.current) return;
    requestedRef.current = true;
    onBeforeClose?.();
    onClose();
  }, [disabled, isPresent, onBeforeClose, onClose]);

  useEffect(() => {
    if (!isPresent || !closeOnEscape || disabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      handleClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeOnEscape, disabled, handleClose, isPresent]);

  return { isPresent, handleClose };
}
