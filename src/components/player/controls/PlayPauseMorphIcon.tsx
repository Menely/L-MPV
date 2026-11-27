import React from "react";
import * as m from "motion/react-m";
import type { Transition } from "motion/react";
import type { PlayerTheme } from "../../../theme/liquidGlass/preferences";
import { useMotionAllowed } from "../../motion/useMotionAllowed";
import { PLAY_PAUSE_MORPH_PATHS } from "./playPauseMorphPaths";

export interface PlayPauseMorphIconProps {
  /** Текущее состояние паузы (true = отображается логотип Play, false = Пауза). */
  paused: boolean;
  /** Активная тема интерфейса (единый сценарий «жидкого металла» во всех темах). */
  theme?: PlayerTheme;
  /** Размер SVG-иконки в пикселях (по умолчанию 32). */
  size?: number;
  /** Дополнительный CSS-класс. */
  className?: string;
}

const INSTANT_TRANSITION: Transition = { duration: 0 };
const MORPH_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * Анимированная кнопка-иконка Play <-> Pause на основе фирменного логотипа L-MPV.
 *
 * Использует единый во всех темах сценарий перетекания «жидкого металла»:
 * звуковые волны и верхний лепесток сливаются в левую полосу паузы, а полый
 * треугольник Play перетекает в правую полосу паузы без потери резкости контуров.
 */
export const PlayPauseMorphIcon: React.FC<PlayPauseMorphIconProps> = React.memo(({
  paused,
  size = 32,
  className = "control-btn__app-play-icon",
}) => {
  const motionAllowed = useMotionAllowed();

  const leadTransition: Transition = motionAllowed
    ? { duration: 0.3, ease: MORPH_EASE }
    : INSTANT_TRANSITION;
  const followTransition: Transition = motionAllowed
    ? { duration: 0.34, ease: MORPH_EASE }
    : INSTANT_TRANSITION;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="-0.5 -0.5 25 25"
      fill="currentColor"
      stroke="none"
      shapeRendering="geometricPrecision"
      className={className}
      aria-hidden="true"
    >
      {/* Внешняя дуга перетекает и вливается в ядро левой полосы паузы */}
      <m.path
        initial={false}
        animate={{
          d: paused
            ? PLAY_PAUSE_MORPH_PATHS.outerWavePlay
            : PLAY_PAUSE_MORPH_PATHS.outerWavePause,
        }}
        transition={leadTransition}
      />

      {/* Верхний лепесток стекает в верхнюю часть левой полосы паузы */}
      <m.path
        initial={false}
        animate={{
          d: paused
            ? PLAY_PAUSE_MORPH_PATHS.topLobePlay
            : PLAY_PAUSE_MORPH_PATHS.topLobePause,
        }}
        transition={leadTransition}
      />

      {/* Внутренняя дуга выпрямляется в полноразмерную левую полосу паузы */}
      <m.path
        initial={false}
        animate={{
          d: paused
            ? PLAY_PAUSE_MORPH_PATHS.innerWavePlay
            : PLAY_PAUSE_MORPH_PATHS.innerWavePause,
        }}
        transition={
          motionAllowed && paused
            ? { duration: 0.34, ease: MORPH_EASE, delay: 0.02 }
            : followTransition
        }
      />

      {/* Полый треугольник Play перетекает в полноразмерную правую полосу паузы */}
      <m.path
        initial={false}
        fillRule="evenodd"
        clipRule="evenodd"
        animate={{
          d: paused
            ? PLAY_PAUSE_MORPH_PATHS.triPlay
            : PLAY_PAUSE_MORPH_PATHS.triPause,
        }}
        transition={followTransition}
      />
    </svg>
  );
});

PlayPauseMorphIcon.displayName = "PlayPauseMorphIcon";
