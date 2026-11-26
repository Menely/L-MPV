import React from "react";
import * as m from "motion/react-m";
import type { Transition } from "motion/react";
import { useMotionAllowed } from "../motion/useMotionAllowed";

export interface EyeMorphIconProps {
  /** Перечёркнут/скрыт ли режим (true = EyeOff / непрозрачный, false = Eye / обычный). */
  off: boolean;
  /** Размер SVG-иконки в пикселях (по умолчанию 16). */
  size?: number;
  /** Дополнительный CSS-класс. */
  className?: string;
  /** Толщина обводки (по умолчанию 2.15). */
  strokeWidth?: number;
}

const INSTANT_TRANSITION: Transition = { duration: 0 };
const SLASH_TRANSITION: Transition = {
  duration: 0.22,
  ease: [0.16, 1, 0.3, 1],
};
const FADE_TRANSITION: Transition = {
  duration: 0.18,
  ease: "easeInOut",
};

/**
 * Анимированная иконка Глаза (Eye <-> EyeOff):
 * сохраняет 1:1 оригинальные пропорции Lucide Eye (открытый, широкий миндалевидный разрез)
 * и Lucide EyeOff. При переключении в неактивный режим диагональная линия динамично
 * прочерчивается через иконку с упругим сглаживанием, а контуры бесшовно переходят в EyeOff.
 */
export const EyeMorphIcon: React.FC<EyeMorphIconProps> = ({
  off,
  size = 16,
  className,
  strokeWidth = 2.15,
}) => {
  const motionAllowed = useMotionAllowed();
  const slashTransition = motionAllowed ? SLASH_TRANSITION : INSTANT_TRANSITION;
  const fadeTransition = motionAllowed ? FADE_TRANSITION : INSTANT_TRANSITION;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
      className={className}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {/* Состояние: открытый глаз (полный классический контур Lucide Eye + зрачок) */}
      <m.g
        initial={false}
        animate={{
          opacity: off ? 0 : 1,
          scale: off ? 0.94 : 1,
        }}
        transition={fadeTransition}
        style={{ transformOrigin: "12px 12px" }}
      >
        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
        <circle cx="12" cy="12" r="3" />
      </m.g>

      {/* Состояние: перечёркнутый глаз (гармоничные контуры Lucide EyeOff) */}
      <m.g
        initial={false}
        animate={{
          opacity: off ? 1 : 0,
          scale: off ? 1 : 0.96,
        }}
        transition={fadeTransition}
        style={{ transformOrigin: "12px 12px" }}
      >
        {/* Верхняя дуга с разрывом */}
        <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
        {/* Дуга зрачка */}
        <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
        {/* Нижняя дуга с разрывом */}
        <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      </m.g>

      {/* Диагональная линия перечёркивания (живая анимация прочерчивания pathLength 0 -> 1) */}
      <m.line
        x1="2"
        y1="2"
        x2="22"
        y2="22"
        initial={false}
        animate={{
          pathLength: off ? 1 : 0,
          opacity: off ? 1 : 0,
        }}
        transition={slashTransition}
      />
    </svg>
  );
};
