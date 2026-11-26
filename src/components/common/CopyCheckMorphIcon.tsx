import React from "react";
import * as m from "motion/react-m";
import type { Transition } from "motion/react";
import { useMotionAllowed } from "../motion/useMotionAllowed";

export interface CopyCheckMorphIconProps {
  /** Состояние успешного копирования (true = зелёная галочка Check, false = два листочка Copy). */
  copied: boolean;
  /** Размер SVG-иконки в пикселях (по умолчанию 14). */
  size?: number;
  /** Цвет в состоянии галочки (по умолчанию var(--success-text)). */
  copiedColor?: string;
  /** Дополнительный CSS-класс. */
  className?: string;
}

const INSTANT_TRANSITION: Transition = { duration: 0 };
const FOLD_TRANSITION: Transition = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1],
};
const POP_SPRING: Transition = {
  type: "spring",
  stiffness: 460,
  damping: 22,
  mass: 0.65,
};

/**
 * Контуры заднего и переднего листочков Copy, которые при клике складываются
 * друг с другом и перетекают в единую геометрию галочки Check, а через 2 секунды
 * плавно разворачиваются обратно в два листочка.
 */
const COPY_CHECK_PATHS = {
  /** Задний листочек (2 сегмента C) <-> основная дуга галочки Check. */
  backSheetCopy:
    "M 4.20 15.20 C 4.20 9.00 4.20 4.80 4.80 4.20 C 5.40 4.20 9.60 4.20 15.20 4.20",
  backSheetCheck:
    "M 4.40 12.50 C 6.20 14.30 8.00 16.10 9.80 17.90 C 13.15 14.25 16.50 10.60 19.80 6.90",

  /** Передний листочек (4 сегмента C) <-> складывается по диагонали прямо в контур галочки Check. */
  frontSheetCopy:
    "M 8.60 14.30 C 8.60 9.00 8.60 8.60 14.30 8.60 C 20.00 8.60 20.00 9.00 20.00 14.30 C 20.00 19.60 20.00 20.00 14.30 20.00 C 8.60 20.00 8.60 19.60 8.60 14.30",
  frontSheetCheck:
    "M 4.40 12.50 C 6.20 14.30 8.00 16.10 9.80 17.90 C 13.15 14.25 16.50 10.60 19.80 6.90 C 16.50 10.60 13.15 14.25 9.80 17.90 C 8.00 16.10 6.20 14.30 4.40 12.50",
} as const;

/**
 * Анимированная иконка копирования Copy <-> Check:
 * при клике два листочка Copy складываются друг в друга и перетекают в зелёную
 * галочку Check, а по истечении таймера плавно разворачиваются обратно.
 */
export const CopyCheckMorphIcon: React.FC<CopyCheckMorphIconProps> = ({
  copied,
  size = 14,
  copiedColor = "var(--success-text)",
  className,
}) => {
  const motionAllowed = useMotionAllowed();
  const foldTransition = motionAllowed ? FOLD_TRANSITION : INSTANT_TRANSITION;
  const popTransition = motionAllowed ? POP_SPRING : INSTANT_TRANSITION;

  return (
    <m.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={copied ? 2.65 : 2.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
      className={className}
      aria-hidden="true"
      initial={false}
      animate={{
        scale: copied ? 1.08 : 1,
      }}
      style={{
        color: copied ? copiedColor : "currentColor",
        transformOrigin: "12px 12px",
        transition: "color 0.22s ease",
      }}
      transition={popTransition}
    >
      {/* Задний листочек Copy <-> Галочка Check */}
      <m.path
        initial={false}
        animate={{
          d: copied
            ? COPY_CHECK_PATHS.backSheetCheck
            : COPY_CHECK_PATHS.backSheetCopy,
        }}
        transition={foldTransition}
      />

      {/* Передний листочек Copy <-> Складывается в галочку Check */}
      <m.path
        initial={false}
        animate={{
          d: copied
            ? COPY_CHECK_PATHS.frontSheetCheck
            : COPY_CHECK_PATHS.frontSheetCopy,
        }}
        transition={foldTransition}
      />
    </m.svg>
  );
};
