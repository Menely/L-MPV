import React, { useEffect, useState } from "react";
import * as m from "motion/react-m";
import type { Transition } from "motion/react";
import { useMotionAllowed } from "../motion/useMotionAllowed";

export interface RefreshMorphIconProps {
  /** Выполняется ли фоновое обновление/анализ прямо сейчас. */
  spinning?: boolean;
  /** Счётчик кликов для гарантированного запуска полного оборота 360° даже при мгновенном обновлении. */
  triggerKey?: number;
  /** Размер SVG-иконки в пикселях (по умолчанию 16). */
  size?: number;
  /** Дополнительный CSS-класс. */
  className?: string;
  /** Толщина обводки (по умолчанию 2.15). */
  strokeWidth?: number;
}

const INSTANT_TRANSITION: Transition = { duration: 0 };
const SPIN_CLICK_TRANSITION: Transition = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1],
};

/**
 * Анимированная иконка обновления / пересканирования (`RefreshCw`):
 * - Использует 1:1 геометрически выверенные контуры Lucide RefreshCw с идеальным
 *   центром вращения (12, 12).
 * - При одиночном клике совершает один чистый, плавный соосный оборот на 360° без вибраций.
 * - При `spinning === true` непрерывно вращается через аппаратное CSS-правило,
 *   которое гарантированно и мгновенно останавливается, как только `spinning` становится `false`
 *   (предотвращает застревание бесконечного цикла Framer Motion).
 */
export const RefreshMorphIcon: React.FC<RefreshMorphIconProps> = ({
  spinning = false,
  triggerKey = 0,
  size = 16,
  className,
  strokeWidth = 2.15,
}) => {
  const motionAllowed = useMotionAllowed();
  const [clickTurns, setClickTurns] = useState(0);

  // Одиночный оборот при нажатии кнопки пользователем
  useEffect(() => {
    if (triggerKey > 0) {
      setClickTurns((prev) => prev + 1);
    }
  }, [triggerKey]);

  const isSpinning = spinning && motionAllowed;

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
      className={`${className || ""} ${isSpinning ? "refresh-morph-icon--spinning" : ""}`.trim()}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <m.g
        initial={false}
        animate={{
          rotate: clickTurns * 360,
        }}
        transition={motionAllowed ? SPIN_CLICK_TRANSITION : INSTANT_TRANSITION}
        style={{
          transformOrigin: "12px 12px",
          transformBox: "fill-box",
        }}
      >
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M8 16H3v5" />
      </m.g>
    </svg>
  );
};
