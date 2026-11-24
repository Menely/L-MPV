import { useLayoutEffect, useRef, type HTMLAttributes } from "react";
import { useMotionAllowed } from "./useMotionAllowed";

type SelectionRailProps = HTMLAttributes<HTMLDivElement> & { activeKey: string };
const SELECTED = '[aria-current="true"], [aria-selected="true"], [aria-pressed="true"]';

function placeSelection(root: HTMLDivElement, marker: HTMLSpanElement, animate: boolean, force = false) {
  const selected = Array.from(root.children).find(child => child.matches(SELECTED)) as HTMLElement | undefined;
  if (!selected) {
    marker.hidden = true;
    return;
  }
  const geometry = {
    width: `${selected.offsetWidth}px`, height: `${selected.offsetHeight}px`,
    borderRadius: getComputedStyle(selected).borderRadius,
    transform: `translate(${selected.offsetLeft}px, ${selected.offsetTop}px)`,
  };
  const signature = JSON.stringify(geometry);
  // ResizeObserver's initial delivery must not cancel an unchanged selection tween.
  if (!force && marker.dataset.geometry === signature) return;
  marker.style.transition = animate ? "" : "none";
  Object.assign(marker.style, geometry);
  marker.dataset.geometry = signature;
  marker.hidden = false;
}

/** Moves the selection surface only; captions retain their native text rendering. */
export function SelectionRail({ activeKey, className = "", children, ...props }: SelectionRailProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const allowed = useMotionAllowed();

  useLayoutEffect(() => {
    const root = rootRef.current;
    const marker = markerRef.current;
    if (!root || !marker) return;

    // Initial placement and responsive reflow snap; subsequent selections tween.
    placeSelection(root, marker, allowed && marker.dataset.placed === "true", !allowed);
    marker.dataset.placed = "true";
  }, [activeKey, allowed]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const marker = markerRef.current;
    if (!root || !marker) return;
    const observer = new ResizeObserver(() => placeSelection(root, marker, false));
    const observeChildren = () => {
      observer.disconnect();
      observer.observe(root);
      for (const child of root.children) if (child !== marker) observer.observe(child);
      placeSelection(root, marker, false);
    };
    observeChildren();
    const mutation = new MutationObserver(observeChildren);
    mutation.observe(root, { childList: true, subtree: true, characterData: true });
    const refresh = () => placeSelection(root, marker, false);
    window.addEventListener("l-mpv-settings-changed", refresh);
    window.addEventListener("ui-settings-changed", refresh);
    return () => {
      observer.disconnect();
      mutation.disconnect();
      window.removeEventListener("l-mpv-settings-changed", refresh);
      window.removeEventListener("ui-settings-changed", refresh);
    };
  }, []);

  return (
    <div {...props} ref={rootRef} className={`selection-rail ${className}`}>
      <span ref={markerRef} className="selection-rail__marker" aria-hidden="true" hidden />
      {children}
    </div>
  );
}
