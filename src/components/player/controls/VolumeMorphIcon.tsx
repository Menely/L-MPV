import React from "react";
import * as m from "motion/react-m";
import type { Transition } from "motion/react";
import { useMotionAllowed } from "../../motion/useMotionAllowed";

export interface VolumeMorphIconProps {
  /** Текущий уровень громкости (0..150). При 0 — состояние Mute. */
  volume: number;
  /** Размер SVG-иконки в пикселях (по умолчанию 19). */
  size?: number;
  /** Дополнительный CSS-класс. */
  className?: string;
}

const INSTANT_TRANSITION: Transition = { duration: 0 };
const MORPH_SPRING: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.7,
};
const WAVE_TRANSITION: Transition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1],
};

/**
 * Контур монолитного рупора динамика.
 * Остаётся неподвижным якорем композиции, слегка наполняясь плотностью при активном звуке.
 */
const SPEAKER_HORN_PATH =
  "M 11.2 4.8 L 6.2 8.8 H 2.8 C 2.14 8.8 1.6 9.34 1.6 10.0 V 14.0 C 1.6 14.66 2.14 15.2 2.8 15.2 H 6.2 L 11.2 19.2 Z";

/**
 * Вычисляет пару кубических кривых Безье для правой части иконки звука:
 * - При `volume === 0` (Mute): две звуковые дуги скрещиваются в воздухе и выпрямляются в чёткий крестик `×`.
 * - При `volume > 0`: крестик расплетается в упругие звуковые волны, радиус и раскрытие которых
 *   плавно растут по мере прибавления громкости (вплоть до режима Boost 150%).
 */
function computeVolumeWavePaths(volume: number): {
  innerPath: string;
  outerPath: string;
  outerOpacity: number;
} {
  const clamped = Math.max(0, Math.min(150, volume));

  if (clamped <= 0) {
    return {
      innerPath: "M 15.80 9.10 C 17.80 11.03 19.80 12.97 21.80 14.90",
      outerPath: "M 21.80 9.10 C 19.80 11.03 17.80 12.97 15.80 14.90",
      outerOpacity: 1,
    };
  }

  const tInner = Math.min(1, Math.max(0, (clamped - 1) / 64));
  const ix = (14.8 + tInner * 0.7).toFixed(2);
  const iyTop = (9.5 - tInner * 1.1).toFixed(2);
  const iyBot = (14.5 + tInner * 1.1).toFixed(2);
  const icx = (16.5 + tInner * 1.6).toFixed(2);
  const icyTop = (10.7 - tInner * 0.45).toFixed(2);
  const icyBot = (13.3 + tInner * 0.45).toFixed(2);

  const innerPath = `M ${ix} ${iyTop} C ${icx} ${icyTop} ${icx} ${icyBot} ${ix} ${iyBot}`;

  const tOuter = Math.min(1.22, Math.max(0, (clamped - 22) / 78));
  const ox = (17.2 + tOuter * 1.65).toFixed(2);
  const oyTop = (7.2 - tOuter * 2.0).toFixed(2);
  const oyBot = (16.8 + tOuter * 2.0).toFixed(2);
  const ocx = (19.6 + tOuter * 3.1).toFixed(2);
  const ocyTop = (9.6 - tOuter * 0.9).toFixed(2);
  const ocyBot = (14.4 + tOuter * 0.9).toFixed(2);

  const outerPath = `M ${ox} ${oyTop} C ${ocx} ${ocyTop} ${ocx} ${ocyBot} ${ox} ${oyBot}`;
  const outerOpacity =
    clamped < 25 ? 0 : Math.min(1, 0.25 + ((clamped - 25) / 40) * 0.75);

  return { innerPath, outerPath, outerOpacity };
}

/**
 * Анимированная иконка звука и Mute:
 * - Монолитный рупор динамика остаётся на месте с лёгким упругим откликом.
 * - Справа от рупора звуковые волны плавно вырастают при увеличении громкости.
 * - При нажатии Mute две звуковые дуги скрещиваются и перетекают в крестик `×`.
 */
export const VolumeMorphIcon: React.FC<VolumeMorphIconProps> = React.memo(({
  volume,
  size = 19,
  className,
}) => {
  const motionAllowed = useMotionAllowed();
  const isMuted = volume <= 0;
  const isBoosted = volume > 100;

  const { innerPath, outerPath, outerOpacity } = computeVolumeWavePaths(volume);

  const pathTransition: Transition = motionAllowed
    ? WAVE_TRANSITION
    : INSTANT_TRANSITION;
  const hornTransition: Transition = motionAllowed
    ? MORPH_SPRING
    : INSTANT_TRANSITION;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
      className={className}
      aria-hidden="true"
    >
      {/* Монолитный рупор динамика */}
      <m.path
        d={SPEAKER_HORN_PATH}
        fill="currentColor"
        initial={false}
        animate={{
          fillOpacity: isMuted ? 0.1 : isBoosted ? 0.32 : 0.22,
          x: isMuted ? -0.35 : 0,
          scale: isBoosted ? 1.04 : 1,
        }}
        style={{ transformOrigin: "6.5px 12px" }}
        transition={hornTransition}
      />

      {/* Внутренняя звуковая дуга <-> Первая диагональ крестика (\) */}
      <m.path
        initial={false}
        animate={{ d: innerPath }}
        transition={pathTransition}
      />

      {/* Внешняя звуковая дуга <-> Вторая диагональ крестика (/) */}
      <m.path
        initial={false}
        animate={{
          d: outerPath,
          opacity: outerOpacity,
        }}
        transition={pathTransition}
      />
    </svg>
  );
});

VolumeMorphIcon.displayName = "VolumeMorphIcon";
