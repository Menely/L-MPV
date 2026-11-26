import React from "react";
import * as m from "motion/react-m";
import type { Transition } from "motion/react";
import { useMotionAllowed } from "../../motion/useMotionAllowed";

export interface PinMorphIconProps {
  /** Активно ли закрепление (true = кнопка вертикально прикалывает окно, false = наклонена под 45°). */
  pinned: boolean;
  /** Размер SVG-иконки в пикселях (по умолчанию 18). */
  size?: number;
  /** Дополнительный CSS-класс. */
  className?: string;
}

const INSTANT_TRANSITION: Transition = { duration: 0 };
const PIN_SPRING_TRANSITION: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 20,
  mass: 0.65,
};
const PIN_MORPH_TRANSITION: Transition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
};

/**
 * Анимированная иконка закрепления («Поверх всех окон» / закрепление панели):
 * - В неактивном состоянии канцелярская кнопка наклонена под углом 45°.
 * - При включении разворачивается строго вертикально вниз (0°), наполняется плотностью
 *   и с упругим пружинным импульсом «прикалывает» окно.
 */
export const PinMorphIcon: React.FC<PinMorphIconProps> = ({
  pinned,
  size = 18,
  className,
}) => {
  const motionAllowed = useMotionAllowed();
  const springTransition = motionAllowed
    ? PIN_SPRING_TRANSITION
    : INSTANT_TRANSITION;
  const morphTransition = motionAllowed
    ? PIN_MORPH_TRANSITION
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
      <m.g
        initial={false}
        animate={{
          rotate: pinned ? 0 : 45,
          y: pinned ? 0.9 : -0.4,
          scale: pinned ? 1.05 : 1,
        }}
        style={{ transformOrigin: "12px 12px" }}
        transition={springTransition}
      >
        {/* Шляпка канцелярской кнопки */}
        <path d="M 8.8 3.2 H 15.2" />

        {/* Корпус и юбка кнопки */}
        <m.path
          d="M 9.8 3.2 V 8.5 L 6.3 12.2 V 14.0 H 17.7 V 12.2 L 14.2 8.5 V 3.2 Z"
          fill="currentColor"
          initial={false}
          animate={{
            fillOpacity: pinned ? 0.3 : 0.04,
          }}
          transition={morphTransition}
        />

        {/* Игла кнопки: при закреплении глубже входит в поверхность */}
        <m.path
          initial={false}
          animate={{
            d: pinned ? "M 12.0 14.0 L 12.0 21.2" : "M 12.0 14.0 L 12.0 20.2",
          }}
          transition={morphTransition}
        />
      </m.g>

      {/* Опорная риска точки прикалывания внизу (проявляется при вертикальной фиксации) */}
      <m.path
        initial={false}
        animate={{
          d: pinned ? "M 9.0 21.6 L 15.0 21.6" : "M 12.0 21.6 L 12.0 21.6",
          opacity: pinned ? 0.85 : 0,
        }}
        transition={morphTransition}
      />
    </svg>
  );
};
