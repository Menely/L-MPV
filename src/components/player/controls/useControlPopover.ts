import { useCallback, useRef, useState } from "react";

export type ControlPopover = "audio" | "sub" | "speed" | "more";

const triggerIds: Record<ControlPopover, string> = {
  audio: "btn-audio-tracks",
  sub: "btn-sub-tracks",
  speed: "btn-playback-speed",
  more: "btn-controls-more",
};

/** Visibility requests and focus handoff; Motion, not a timeout, determines removal. */
export function useControlPopover() {
  const [activePopover, setActivePopover] = useState<ControlPopover | null>(null);
  const [exitingPopover, setExitingPopover] = useState<ControlPopover | null>(null);
  const [immediateExit, setImmediateExit] = useState(false);
  const activeRef = useRef(activePopover);
  const returnToRef = useRef<ControlPopover | null>(null);
  activeRef.current = activePopover;

  const openPopover = useCallback((type: ControlPopover) => {
    activeRef.current = type;
    returnToRef.current = null;
    setImmediateExit(false);
    setExitingPopover(null);
    setActivePopover(type);
  }, []);

  const closePopover = useCallback((immediate = false) => {
    const current = activeRef.current;
    if (!current) return;
    activeRef.current = null;
    returnToRef.current = current;
    setImmediateExit(immediate);
    setExitingPopover(current);
    setActivePopover(null);
  }, []);

  const onExitComplete = useCallback(() => {
    if (activeRef.current) return;
    setExitingPopover(null);
    const type = returnToRef.current;
    returnToRef.current = null;
    if (!type) return;
    // A new overlay/input may have received focus while this one faded out.
    const focused = document.activeElement;
    if (focused && focused !== document.body &&
        !(focused instanceof HTMLElement && focused.closest(".track-popover, .controls-overflow"))) return;
    const target = [triggerIds[type], "btn-controls-more", "btn-play-pause"]
      .map((id) => document.getElementById(id))
      .find((element) => element?.getClientRects().length);
    target?.focus({ preventScroll: true });
  }, []);

  return { activePopover, displayedPopover: activePopover ?? exitingPopover,
    immediateExit, openPopover, closePopover, onExitComplete };
}
