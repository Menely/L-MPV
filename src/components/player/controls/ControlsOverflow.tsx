import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Check, Settings, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";
import { SPEED_PRESETS, formatSpeedValue } from "./SpeedPopover";

export interface OverflowAction {
  id: string;
  label: string;
  icon: ReactNode;
  priority: "low" | "medium" | "audio" | "compact";
  onSelect: () => void;
  active?: boolean;
}

interface ControlsOverflowProps {
  popoverRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  isClosing: boolean;
  actions: OverflowAction[];
  volume: number;
  speed: number;
  onVolumeChange: (volume: number) => void;
  onMute: () => void;
  onSpeedChange: (speed: number) => void;
  onOpenSettings?: () => void;
  onClose: (immediate?: boolean) => void;
}

/** Visibility follows the same container queries as the toolbar, including UI zoom. */
export function ControlsOverflow({
  popoverRef, triggerRef, isClosing, actions, volume, speed,
  onVolumeChange, onMute, onSpeedChange, onOpenSettings, onClose,
}: ControlsOverflowProps) {
  const { dict } = useTranslation();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const root = popoverRef.current;
    if (!root) return;
    const first = Array.from(root.querySelectorAll<HTMLElement>("button, input, select"))
      .find((el) => el.getClientRects().length > 0);
    const wrapper = root.closest(".player-controls-wrapper");
    if (!wrapper) return;
    const updateLayout = () => {
      if (triggerRef.current && getComputedStyle(triggerRef.current).display === "none") {
        closeRef.current(true);
        return;
      } else if (root.contains(document.activeElement) &&
        !(document.activeElement as HTMLElement).getClientRects().length) {
        Array.from(root.querySelectorAll<HTMLElement>("button, input, select"))
          .find((el) => el.getClientRects().length > 0)?.focus();
      }
      // If there is too little room above the controls, overlap the dock instead
      // of placing actions outside the window. Measure in visual px, then undo zoom.
      root.style.bottom = "";
      const rect = root.getBoundingClientRect();
      const scale = rect.width / root.offsetWidth || 1;
      if (rect.bottom < 120 * scale) root.style.bottom = "0px";
      const available = (root.getBoundingClientRect().bottom - 8) / scale;
      root.style.maxHeight = `${Math.max(1, Math.min(480, available))}px`;
    };
    updateLayout();
    first?.focus({ preventScroll: true });
    root.scrollTop = 0;
    const observer = new ResizeObserver(updateLayout);
    observer.observe(wrapper);
    window.addEventListener("resize", updateLayout);
    return () => { observer.disconnect(); window.removeEventListener("resize", updateLayout); };
  }, [popoverRef, triggerRef]);

  return (
    <div
      ref={popoverRef}
      id="player-controls-overflow"
      role="dialog"
      aria-label={dict.controls.more}
      className={`controls-overflow ${isClosing ? "controls-overflow--closing" : ""}`}
      inert={isClosing}
    >
      <div className="controls-overflow__title">{dict.controls.more}</div>
      <div className="controls-overflow__actions">
        {actions.map((action) => (
          <button
            type="button"
            key={action.id}
            data-action={action.id}
            className={`controls-overflow__action controls-overflow__action--${action.priority}`}
            aria-pressed={action.active}
            onClick={() => { onClose(true); action.onSelect(); }}
          >
            {action.icon}
            <span>{action.label}</span>
            {action.active && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="controls-overflow__volume">
        <label htmlFor="overflow-volume">{dict.controls.volume}</label>
        <div className="controls-overflow__volume-row">
          <button type="button" className="controls-overflow__mute" onClick={onMute}
            aria-label={volume === 0 ? dict.controls.unmute : dict.controls.mute}
            aria-pressed={volume === 0}>
            {volume === 0 ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
          </button>
          <input id="overflow-volume" className="ui-premium-slider" type="range"
            min={0} max={150} value={volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))} />
          <output htmlFor="overflow-volume">{Math.round(volume)}%</output>
        </div>
      </div>
      <label className="controls-overflow__speed" htmlFor="overflow-speed">
        <span>{dict.controls.speed}</span>
        <select id="overflow-speed" value={speed}
          onChange={(event) => onSpeedChange(Number(event.target.value))}>
          {Array.from(new Set([...SPEED_PRESETS, speed])).sort((a, b) => a - b).map((value) => (
            <option key={value} value={value}>{formatSpeedValue(value)}</option>
          ))}
        </select>
      </label>
      {onOpenSettings && (
        <button type="button" className="controls-overflow__action"
          onClick={() => { onClose(true); onOpenSettings(); }}>
          <Settings size={18} aria-hidden="true" /><span>{dict.settings.title}</span>
        </button>
      )}
    </div>
  );
}
