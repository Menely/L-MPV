import React from "react";
import * as m from "motion/react-m";
import type { Transition } from "motion/react";
import { useMotionAllowed } from "../../motion/useMotionAllowed";

export interface FullscreenMorphIconProps {
  /** Активен ли полноэкранный режим (true = скобки вывернуты внутрь, false = наружу). */
  isFullscreen: boolean;
  /** Размер SVG-иконки в пикселях (по умолчанию 20). */
  size?: number;
  /** Дополнительный CSS-класс. */
  className?: string;
}

const INSTANT_TRANSITION: Transition = { duration: 0 };
const BRACKET_MORPH_TRANSITION: Transition = {
  duration: 0.3,
  ease: [0.22, 1, 0.36, 1],
};
const FRAME_SPRING_TRANSITION: Transition = {
  type: "spring",
  stiffness: 440,
  damping: 22,
  mass: 0.7,
};

const BRACKET_PATHS = {
  topLeftOut: "M 3.20 8.80 L 3.20 3.20 L 8.80 3.20",
  topLeftIn: "M 3.40 9.10 L 9.10 9.10 L 9.10 3.40",

  topRightOut: "M 15.20 3.20 L 20.80 3.20 L 20.80 8.80",
  topRightIn: "M 14.90 3.40 L 14.90 9.10 L 20.60 9.10",

  bottomRightOut: "M 20.80 15.20 L 20.80 20.80 L 15.20 20.80",
  bottomRightIn: "M 20.60 14.90 L 14.90 14.90 L 14.90 20.60",

  bottomLeftOut: "M 8.80 20.80 L 3.20 20.80 L 3.20 15.20",
  bottomLeftIn: "M 9.10 20.60 L 9.10 14.90 L 3.40 14.90",
} as const;

/**
 * Анимированная иконка полноэкранного режима:
 * четыре угловые скобки рамки экрана плавно выворачиваются наружу/внутрь (на 180°)
 * с упругим пружинным смыканием при входе и выходе из Fullscreen.
 */
export const FullscreenMorphIcon: React.FC<FullscreenMorphIconProps> = React.memo(({
  isFullscreen,
  size = 20,
  className = "control-btn__fullscreen-icon",
}) => {
  const motionAllowed = useMotionAllowed();
  const morphTransition = motionAllowed
    ? BRACKET_MORPH_TRANSITION
    : INSTANT_TRANSITION;
  const springTransition = motionAllowed
    ? FRAME_SPRING_TRANSITION
    : INSTANT_TRANSITION;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.45}
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
      className={className}
      aria-hidden="true"
    >
      <m.g
        initial={false}
        animate={{
          scale: isFullscreen ? 0.95 : 1,
        }}
        style={{ transformOrigin: "12px 12px" }}
        transition={springTransition}
      >
        <m.path
          initial={false}
          animate={{
            d: isFullscreen
              ? BRACKET_PATHS.topLeftIn
              : BRACKET_PATHS.topLeftOut,
          }}
          transition={morphTransition}
        />
        <m.path
          initial={false}
          animate={{
            d: isFullscreen
              ? BRACKET_PATHS.topRightIn
              : BRACKET_PATHS.topRightOut,
          }}
          transition={morphTransition}
        />
        <m.path
          initial={false}
          animate={{
            d: isFullscreen
              ? BRACKET_PATHS.bottomRightIn
              : BRACKET_PATHS.bottomRightOut,
          }}
          transition={morphTransition}
        />
        <m.path
          initial={false}
          animate={{
            d: isFullscreen
              ? BRACKET_PATHS.bottomLeftIn
              : BRACKET_PATHS.bottomLeftOut,
          }}
          transition={morphTransition}
        />
      </m.g>
    </svg>
  );
});

FullscreenMorphIcon.displayName = "FullscreenMorphIcon";
