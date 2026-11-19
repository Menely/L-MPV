import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { isMotionAllowed } from "../../../utils/animationUtils";
import {
  RULER_BOOST_WIDTH,
  RULER_GEOMETRY,
  RULER_MARK_POSITIONS,
  RULER_NOMINAL_X,
  TICK_GEOMETRY,
  getBoostColor,
  paintVolumeRuler,
} from "./rulerMath";

interface VolumeRulerOverlayProps {
  volume: number;
  label: string;
  closing: boolean;
}

/** Экранная шкала громкости поверх видеокадра с волной рисок и рельсой. */
export function VolumeRulerOverlay({ volume, label, closing }: VolumeRulerOverlayProps) {
  const uid = useId().replace(/:/g, "");
  const boostBaseGradId = `${uid}-boost-base`;
  const boostFillGradId = `${uid}-boost-fill`;
  const needleGlowId = `${uid}-needle-glow`;

  const shadowGroupRef = useRef<SVGGElement | null>(null);
  const fgGroupRef = useRef<SVGGElement | null>(null);
  const railNormalFillRef = useRef<SVGRectElement | null>(null);
  const railBoostFillRef = useRef<SVGRectElement | null>(null);
  const needleGroupRef = useRef<SVGGElement | null>(null);
  const needleBodyRef = useRef<SVGRectElement | null>(null);

  const targetVolRef = useRef(volume);
  const displayVolRef = useRef(volume);
  const rafIdRef = useRef<number | null>(null);
  const wasVisibleRef = useRef(false);

  const cancelAnimation = () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  };

  useLayoutEffect(() => {
    const paint = (v: number) =>
      paintVolumeRuler(
        {
          shadowGroup: shadowGroupRef.current,
          fgGroup: fgGroupRef.current,
          railNormalFill: railNormalFillRef.current,
          railBoostFill: railBoostFillRef.current,
          needleGroup: needleGroupRef.current,
          needleBody: needleBodyRef.current,
        },
        v
      );

    targetVolRef.current = volume;

    if (!wasVisibleRef.current || !isMotionAllowed()) {
      wasVisibleRef.current = true;
      cancelAnimation();
      displayVolRef.current = volume;
      paint(volume);
      return;
    }

    if (rafIdRef.current !== null) return;

    const step = () => {
      const diff = targetVolRef.current - displayVolRef.current;
      if (Math.abs(diff) < 0.08) {
        displayVolRef.current = targetVolRef.current;
        paint(displayVolRef.current);
        rafIdRef.current = null;
        return;
      }
      displayVolRef.current += diff * 0.28;
      paint(displayVolRef.current);
      rafIdRef.current = requestAnimationFrame(step);
    };

    rafIdRef.current = requestAnimationFrame(step);
  }, [volume]);

  useEffect(() => cancelAnimation, []);

  const isMuted = volume === 0;
  const isBoost = volume > RULER_GEOMETRY.nominalVolume;
  const normalWidth = RULER_NOMINAL_X - RULER_GEOMETRY.startX;

  return (
    <div
      className={`volume-feedback${closing ? " volume-feedback--closing" : ""}${
        isBoost ? " volume-feedback--boost" : ""
      }${isMuted ? " volume-feedback--muted" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${label}: ${Math.round(volume)}%`}
    >
      <span
        className="volume-feedback__value"
        style={isBoost ? { color: getBoostColor(volume) } : undefined}
      >
        {Math.round(volume)}
        <span className="volume-feedback__unit">%</span>
      </span>

      <div className="volume-feedback__ruler">
        <svg
          className="volume-feedback__scale"
          viewBox={`0 0 ${RULER_GEOMETRY.viewBoxWidth} ${RULER_GEOMETRY.viewBoxHeight}`}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={boostBaseGradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(245,158,11,0.34)" />
              <stop offset="100%" stopColor="rgba(251,113,133,0.42)" />
            </linearGradient>
            <linearGradient id={boostFillGradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>
            <filter id={needleGlowId} x="-100%" y="-60%" width="300%" height="220%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g ref={shadowGroupRef}>
            {TICK_GEOMETRY.map((t) => (
              <rect
                key={`shadow-${t.level}`}
                x={t.x - 0.5}
                width={3}
                rx={1.5}
                fill="rgba(0,0,0,0.52)"
              />
            ))}
          </g>

          <g ref={fgGroupRef}>
            {TICK_GEOMETRY.map((t) => (
              <rect key={`fg-${t.level}`} x={t.x} width={2} rx={1} />
            ))}
          </g>

          <rect
            x={RULER_GEOMETRY.startX - 1}
            y="24"
            width={RULER_GEOMETRY.trackWidth + 2}
            height="5"
            rx="2.5"
            fill="rgba(0,0,0,0.42)"
          />
          <rect
            x={RULER_GEOMETRY.startX}
            y="25"
            width={normalWidth}
            height="3"
            rx="1.5"
            fill="var(--accent)"
            fillOpacity="0.30"
          />
          <rect
            x={RULER_NOMINAL_X}
            y="25"
            width={RULER_BOOST_WIDTH}
            height="3"
            rx="1.5"
            fill={`url(#${boostBaseGradId})`}
          />

          <rect
            ref={railNormalFillRef}
            x={RULER_GEOMETRY.startX}
            y="25"
            width="0"
            height="3"
            rx="1.5"
            fill="var(--accent)"
          />
          <rect
            ref={railBoostFillRef}
            x={RULER_NOMINAL_X}
            y="25"
            width="0"
            height="3"
            rx="1.5"
            fill={`url(#${boostFillGradId})`}
          />

          <rect x={RULER_NOMINAL_X - 1} y="23" width="2" height="7" rx="1" fill="rgba(0,0,0,0.65)" />
          <rect
            x={RULER_NOMINAL_X - 0.7}
            y="23.5"
            width="1.4"
            height="6"
            rx="0.7"
            fill="rgba(255,255,255,0.85)"
          />

          <g ref={needleGroupRef} filter={`url(#${needleGlowId})`}>
            <rect x="-4" y="19" width="8" height="15" rx="4" fill="rgba(0,0,0,0.62)" />
            <rect
              ref={needleBodyRef}
              x="-2.2"
              y="20"
              width="4.4"
              height="13"
              rx="2.2"
              fill="var(--accent)"
              stroke="rgba(255,255,255,0.90)"
              strokeWidth="0.9"
            />
          </g>
        </svg>

        <div className="volume-feedback__marks" aria-hidden="true">
          <span className="volume-feedback__mark" style={{ left: RULER_MARK_POSITIONS.mid }}>
            {RULER_GEOMETRY.midVolume}
          </span>
          <span
            className="volume-feedback__mark volume-feedback__mark--nominal"
            style={{ left: RULER_MARK_POSITIONS.nominal }}
          >
            {RULER_GEOMETRY.nominalVolume}
          </span>
        </div>
      </div>
    </div>
  );
}
