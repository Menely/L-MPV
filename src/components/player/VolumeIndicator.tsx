import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/LanguageContext";
import { VOLUME_FEEDBACK_EVENT, isVolumeIndicatorEnabled, isVolumeOsdEnabled } from "../../utils/volumeFeedback";

/** Isolated trial. Rollback: docs/audits/volume-ruler-experiment-2026-11-08. */
export function VolumeIndicator() {
  const { dict } = useTranslation();
  const [feedback, setFeedback] = useState<{ volume: number; closing: boolean } | null>(null);
  const [osd, setOsd] = useState(isVolumeOsdEnabled);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
      if (removeTimer.current !== null) clearTimeout(removeTimer.current);
    };
    const onVolume = (event: Event) => {
      if (!isVolumeIndicatorEnabled()) return;
      const volume = (event as CustomEvent<unknown>).detail;
      if (typeof volume !== "number" || !Number.isFinite(volume)) return;
      clearTimers();
      setFeedback({ volume: Math.max(0, Math.min(150, volume)), closing: false });
      closeTimer.current = setTimeout(() => {
        setFeedback(previous => previous ? { ...previous, closing: true } : null);
        removeTimer.current = setTimeout(() => setFeedback(null), 180);
      }, 900);
    };
    const onSettingsChanged = () => {
      setOsd(isVolumeOsdEnabled());
      if (!isVolumeIndicatorEnabled()) {
        clearTimers();
        setFeedback(null);
      }
    };
    window.addEventListener(VOLUME_FEEDBACK_EVENT, onVolume);
    window.addEventListener("l-mpv-settings-changed", onSettingsChanged);
    window.addEventListener("storage", onSettingsChanged);
    return () => {
      window.removeEventListener(VOLUME_FEEDBACK_EVENT, onVolume);
      window.removeEventListener("l-mpv-settings-changed", onSettingsChanged);
      window.removeEventListener("storage", onSettingsChanged);
      clearTimers();
    };
  }, []);

  if (!feedback) return null;
  const { volume, closing } = feedback;
  if (osd) return (
    <div className={`volume-feedback-osd${closing ? " volume-feedback-osd--closing" : ""}`}
      role="status" aria-live="polite" aria-atomic="true">
      {dict.controls.volume}: <strong>{Math.round(volume)}%</strong>
    </div>
  );
  // Keep shadow and foreground as direct geometry to avoid <use> repaint
  // differences when the volume updates in Chromium.
  const ticks = <>
        {Array.from({ length: 31 }, (_, index) => {
          const level = index * 5;
          const x = Math.round(12 + index * 476 / 30);
          const major = level % 50 === 0;
          const boost = Math.max(0, (level - 100) / 50);
          return <rect key={level}
            className={`volume-feedback__tick${level <= volume ? " volume-feedback__tick--filled" : ""}${level === 100 ? " volume-feedback__tick--reference" : ""}${boost > 0 ? " volume-feedback__tick--boost" : ""}`}
            style={boost > 0 ? { color: `rgb(255 ${Math.round(255 - 115 * boost)} ${Math.round(255 - 127 * boost)})` } : undefined}
            x={x - 1} y={major ? 6 : 9} width="2" height={major ? 12 : 6} />;
        })}
        {[50, 100].map(level => (
          <text key={level} className="volume-feedback__reference"
            x={Math.round(12 + level * 476 / 150)} y="33" textAnchor="middle">{level}</text>
        ))}
  </>;
  const speaker = <>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path visibility={volume === 0 ? "hidden" : "visible"}
        d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path visibility={volume === 0 ? "visible" : "hidden"} d="m16 9 5 6m0-6-5 6" />
    </>;
  const marker = <g className="volume-feedback__marker"
    style={{ transform: `translateX(${12 + volume * 476 / 150}px)` }}>
    <path d="M0 1v22" />
    <circle cx="0" cy="12" r="2.5" />
  </g>;
  return (
    <div className={`volume-feedback${closing ? " volume-feedback--closing" : ""}`}
      role="status" aria-live="polite" aria-atomic="true"
      aria-label={`${dict.controls.volume}: ${Math.round(volume)}%`}>
      <span className="volume-feedback__value">{Math.round(volume)}<span>%</span></span>
      <div className="volume-feedback__ruler">
        <svg className="volume-feedback__scale" width="564" height="36" viewBox="-32 0 564 36" aria-hidden="true">
          <g className="volume-feedback__scale-shadow">{ticks}</g>
          <g>{ticks}</g>
          <svg className="volume-feedback__icon" x="-26" y="1" width="22" height="22" viewBox="0 0 24 24">
            <g className="volume-feedback__icon-shadow">{speaker}</g>
            <g className="volume-feedback__icon-front">{speaker}</g>
          </svg>
        </svg>
        <svg className="volume-feedback__cursor" width="564" height="36" viewBox="-32 0 564 36" aria-hidden="true">
          <g className="volume-feedback__scale-shadow">{marker}</g>
          {marker}
        </svg>
      </div>
    </div>
  );
}
