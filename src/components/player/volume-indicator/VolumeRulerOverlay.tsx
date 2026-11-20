import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { isMotionAllowed } from "../../../utils/animationUtils";
import {
  RULER_BOOST_START_X,
  RULER_BOOST_WIDTH,
  RULER_GEOMETRY,
  RULER_MARK_POSITIONS,
  RULER_NORMAL_WIDTH,
  TICK_GEOMETRY,
  getBoostColor,
  paintVolumeRuler,
} from "./rulerMath";

interface VolumeRulerOverlayProps {
  volume: number;
  label: string;
  closing: boolean;
}

/** Экранная шкала громкости поверх видеокадра с волной рисок и тонкой рельсой. */
export function VolumeRulerOverlay({ volume, label, closing }: VolumeRulerOverlayProps) {
  const uid = useId().replace(/:/g, "");
  const boostBaseGradId = `${uid}-boost-base`;
  const boostFillGradId = `${uid}-boost-fill`;
  const needleShadowId = `${uid}-needle-shadow`;

  const shadowGroupRef = useRef<SVGGElement | null>(null);
  const fgGroupRef = useRef<SVGGElement | null>(null);
  const railNormalFillRef = useRef<SVGRectElement | null>(null);
  const railBoostFillRef = useRef<SVGRectElement | null>(null);
  const needleGroupRef = useRef<SVGGElement | null>(null);
  const needleHaloRef = useRef<SVGRectElement | null>(null);
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
          needleHalo: needleHaloRef.current,
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
  const isNominalOrAbove = volume >= RULER_GEOMETRY.nominalVolume;
  const boostEndX = RULER_GEOMETRY.startX + RULER_GEOMETRY.trackWidth;

  return (
    <div
      className={`volume-feedback${closing ? " volume-feedback--closing" : ""}${
        isBoost ? " volume-feedback--boost" : ""
      }${isMuted ? " volume-feedback--muted" : ""}${
        isNominalOrAbove ? " volume-feedback--nominal-or-above" : ""
      }`}
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
            <linearGradient
              id={boostBaseGradId}
              gradientUnits="userSpaceOnUse"
              x1={RULER_BOOST_START_X}
              y1="0"
              x2={boostEndX}
              y2="0"
            >
              <stop offset="0%" stopColor="rgba(245,158,11,0.34)" />
              <stop offset="100%" stopColor="rgba(251,113,133,0.40)" />
            </linearGradient>

            <linearGradient
              id={boostFillGradId}
              gradientUnits="userSpaceOnUse"
              x1={RULER_BOOST_START_X}
              y1="0"
              x2={boostEndX}
              y2="0"
            >
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>

            <filter id={needleShadowId} x="-140%" y="-80%" width="380%" height="260%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodColor="#000000" floodOpacity="0.55" />
            </filter>
          </defs>

          {/* Слой 1: Направленная тень только снизу каждой риски */}
          <g ref={shadowGroupRef}>
            {TICK_GEOMETRY.map((t) => (
              <rect key={`shadow-${t.level}`} x={t.x} width={t.width} rx={t.rx} fill="#000000" />
            ))}
          </g>

          {/* Слой 2: Чёткие риски с 3-уровневым ритмом и волной */}
          <g ref={fgGroupRef}>
            {TICK_GEOMETRY.map((t) => (
              <rect key={`fg-${t.level}`} x={t.x} width={t.width} rx={t.rx} />
            ))}
          </g>

          {/* Слой 3: Тонкая 2px рельса с мягкой тенью снизу и микро-разрывом на 100% */}
          <rect
            x={RULER_GEOMETRY.startX}
            y="26"
            width={RULER_GEOMETRY.trackWidth}
            height="2"
            rx="1"
            fill="rgba(0,0,0,0.34)"
          />
          <rect
            x={RULER_GEOMETRY.startX}
            y="25"
            width={RULER_NORMAL_WIDTH}
            height="2"
            rx="1"
            fill="var(--accent)"
            fillOpacity="0.30"
          />
          <rect
            x={RULER_BOOST_START_X}
            y="25"
            width={RULER_BOOST_WIDTH}
            height="2"
            rx="1"
            fill={`url(#${boostBaseGradId})`}
          />

          <rect
            ref={railNormalFillRef}
            x={RULER_GEOMETRY.startX}
            y="25"
            width="0"
            height="2"
            rx="1"
            fill="var(--accent)"
          />
          <rect
            ref={railBoostFillRef}
            x={RULER_BOOST_START_X}
            y="25"
            width="0"
            height="2"
            rx="1"
            fill={`url(#${boostFillGradId})`}
          />

          {/* Слой 4: Ювелирный вертикальный бегунок без тяжёлой чёрной обводки */}
          <g ref={needleGroupRef} filter={`url(#${needleShadowId})`}>
            <rect
              ref={needleHaloRef}
              x="-2.5"
              y="19"
              width="5"
              height="14"
              rx="2.5"
              fill="var(--accent)"
              fillOpacity="0.22"
            />
            <rect
              ref={needleBodyRef}
              x="-1.5"
              y="20"
              width="3"
              height="12"
              rx="1.5"
              fill="var(--accent)"
              stroke="rgba(255,255,255,0.92)"
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
