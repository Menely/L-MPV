import React, { useState, useEffect, useRef, useId } from "react";
import { SEEK_INDICATOR_EVENT, type SeekActionDetail } from "../../utils/seekUtils";
import { useTranslation } from "../../i18n/LanguageContext";

interface SeekFeedback {
  direction: "left" | "right";
  seconds: number;
  generation: number;
  closing: boolean;
}

/** Trial ruler. Rollback: docs/audits/seek-ruler-experiment-2026-11-08. */
export const SeekIndicator: React.FC = () => {
  const { dict } = useTranslation();
  const scaleId = useId();
  const [feedback, setFeedback] = useState<SeekFeedback | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (removeTimer.current) clearTimeout(removeTimer.current);
    };
    const onSeek = (event: Event) => {
      const detail = (event as CustomEvent<SeekActionDetail>).detail;
      if (!detail || !Number.isFinite(detail.seconds) || detail.seconds <= 0 ||
          (detail.direction !== "left" && detail.direction !== "right")) return;
      clearTimers();
      setFeedback(previous => ({
        direction: detail.direction,
        seconds: previous && !previous.closing && previous.direction === detail.direction
          ? previous.seconds + detail.seconds : detail.seconds,
        generation: (previous?.generation ?? 0) + 1,
        closing: false,
      }));
      closeTimer.current = setTimeout(() => {
        setFeedback(previous => previous ? { ...previous, closing: true } : null);
        removeTimer.current = setTimeout(() => setFeedback(null), 180);
      }, 650);
    };
    window.addEventListener(SEEK_INDICATOR_EVENT, onSeek);
    return () => {
      window.removeEventListener(SEEK_INDICATOR_EVENT, onSeek);
      clearTimers();
    };
  }, []);

  if (!feedback) return null;
  const label = `${feedback.direction === "left" ? "−" : "+"}${feedback.seconds}`;
  return (
    <div
      className={`seek-indicator seek-indicator--ruler seek-indicator--${feedback.direction}${feedback.closing ? " seek-indicator--closing" : ""}`}
      aria-live="polite" role="status"
    >
      <span className="seek-ruler__value">
        {label}<span className="seek-ruler__unit">{dict.settings.appearance.secSuffix || "сек"}</span>
      </span>
      <svg className="seek-ruler__scale" viewBox="0 0 96 18" width="96" height="18" aria-hidden="true">
        <defs>
        <clipPath id={`${scaleId}-clip`}><rect x="5" y="0" width="86" height="18" /></clipPath>
        <g id={scaleId}>
        <g className="seek-ruler__ticks">
          {Array.from({ length: 13 }, (_, index) => {
            const height = index % 3 === 0 ? 10 : 6;
            return <rect key={index} x={index * 7 + 5} y={9 - height / 2} width="2" height={height} />;
          })}
        </g>
        <g clipPath={`url(#${scaleId}-clip)`}>
          <g key={feedback.generation} className="seek-ruler__sweep">
            {[0.55, 0.3, 0.12].map((opacity, index) => (
              <rect key={index} className="seek-ruler__trail"
                x={5 - (index + 1) * 7} y="6" width="2" height="6" opacity={opacity} />
            ))}
            <path className="seek-ruler__mark" d="M6 2v14" />
          </g>
        </g>
        </g></defs>
        <use href={`#${scaleId}`} className="seek-ruler__scale-shadow" />
        <use href={`#${scaleId}`} />
      </svg>
    </div>
  );
};
