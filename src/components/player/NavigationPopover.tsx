import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useIsPresent } from "motion/react";
import { getActiveUiScale } from "../../theme/tokens";
import { getSavedControlBarStyle } from "../../theme/controlBarStyle";
import "../../styles/player/navigation-popover.css";

interface Props {
  anchor: RefObject<HTMLElement | null>; onClose: () => void; children: ReactNode;
  label: string; role?: "menu" | "listbox" | "dialog"; matchWidth?: boolean; id?: string;
}
/** Popup surfaces live outside the clipped drawer; coordinates use visual viewport pixels. */
export function NavigationPopover({ anchor, onClose, children, label, role = "menu", matchWidth = false, id }: Props) {
  const isPresent = useIsPresent();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const [position, setPosition] = useState({ left: 0, top: 0, width: 240, maxHeight: 320, zoom: getActiveUiScale(), ready: false });
  const [style, setStyle] = useState(getSavedControlBarStyle);
  useLayoutEffect(() => {
    if (!isPresent) return;
    let frame: number | null = null;
    const place = () => {
      frame = null;
      if (!anchor.current || !panel.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const zoom = getActiveUiScale(), margin = 8, gap = 6;
      const width = Math.min(matchWidth ? Math.max(220 * zoom, rect.width) : (role === "menu" ? 240 : 270) * zoom, window.innerWidth - margin * 2);
      const below = window.innerHeight - rect.bottom - margin - gap, above = rect.top - margin - gap;
      const height = Math.min(panel.current.scrollHeight * zoom, Math.max(above, below), 380 * zoom);
      const down = below >= height || below >= above;
      const maxHeight = Math.max(40, Math.min(down ? below : above, 380 * zoom));
      setPosition({ left: Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin)) / zoom,
        top: Math.max(margin, down ? rect.bottom + gap : rect.top - gap - Math.min(height, maxHeight)) / zoom,
        width: width / zoom, maxHeight: maxHeight / zoom, zoom, ready: true });
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(place); };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) close.current();
    };
    const observer = new ResizeObserver(schedule);
    if (anchor.current) observer.observe(anchor.current);
    if (panel.current) observer.observe(panel.current);
    const refresh = () => { setStyle(getSavedControlBarStyle()); schedule(); };
    place();
    const focusFrame = requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>('input:not(:disabled), [aria-selected="true"], button:not(:disabled)');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest" });
    });
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("l-mpv-settings-changed", refresh);
    window.addEventListener("l-mpv-ui-scale-changed", refresh);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame); observer.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("l-mpv-settings-changed", refresh);
      window.removeEventListener("l-mpv-ui-scale-changed", refresh);
    };
  }, [anchor, isPresent, matchWidth, role]);
  return createPortal(<div ref={panel} id={id} role={role} aria-label={label} data-style={style}
    data-navigation-popover data-saved-playlist-editor className="navigation-popover"
    inert={!isPresent} aria-hidden={!isPresent || undefined}
    style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight,
      zoom: position.zoom, visibility: position.ready ? "visible" : "hidden" }}
    onKeyDown={event => {
      if (!isPresent) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); close.current();
        const trigger = anchor.current?.matches("button") ? anchor.current : anchor.current?.querySelector<HTMLElement>("button");
        trigger?.focus(); return;
      }
      if (role === "dialog" || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const items = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }}>{children}</div>, document.body);
}
