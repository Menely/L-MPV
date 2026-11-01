import React from "react";

export interface SpeedIconProps extends React.SVGProps<SVGSVGElement> {
  /** Размер иконки в пикселях (по умолчанию 16) */
  size?: number;
  /** Пользовательский класс CSS */
  className?: string;
  /** Толщина линий (по умолчанию 2) */
  strokeWidth?: number;
}

/**
 * Гармоничная векторная иконка скорости воспроизведения (тахометр / спидометр),
 * выполненная в едином визуальном коде со шрифтовой иконочной системой Lucide.
 *
 * Особенности геометрии:
 * - Ровный полусферический циферблат с устойчивым основанием
 * - Чёткий центральный шарнир оси вращения
 * - Выверенная риска шкалы (номинал 1.0x)
 * - Динамичная стрелка прибора под углом ускорения
 * - Сбалансированный оптический центр относительно базовой линии текста
 */
export const SpeedIcon: React.FC<SpeedIconProps> = ({
  size = 16,
  className,
  strokeWidth = 2,
  ...props
}) => {
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
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Ровная полусфера шкалы тахометра и базовое основание */}
      <path d="M4 17a9 9 0 1 1 16 0" />
      <path d="M4 17h16" />
      {/* Отметка центрального номинала шкалы (1.0x) */}
      <line x1="12" y1="8" x2="12" y2="10" />
      {/* Центральный шарнир оси прибора */}
      <circle cx="12" cy="14" r="2" />
      {/* Стрелка спидометра в положении ускорения */}
      <path d="m13.4 12.6 3.6-3.6" />
    </svg>
  );
};

