import React, { useEffect, useRef, useCallback } from "react";
import { hslToRgb } from "../../../utils/colorUtils";
import {
  WHEEL_WRAP_SIZE,
  WHEEL_CANVAS_SIZE,
  WHEEL_CENTER,
  WHEEL_RADIUS,
} from "./types";

interface ColorWheelProps {
  hue: number;
  saturation: number;
  currentHex: string;
  onChange: (hue: number, saturation: number) => void;
}

/**
 * Интерактивный спектральный круг Canvas с субпиксельным сглаживанием,
 * динамической внешней обводкой в цвет выбора и надёжным захватом указателя.
 */
export const ColorWheel: React.FC<ColorWheelProps> = ({
  hue,
  saturation,
  currentHex,
  onChange,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);

  // Отрисовка спектрального круга на Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const renderSize = Math.round(WHEEL_CANVAS_SIZE * pixelRatio);
    canvas.width = renderSize;
    canvas.height = renderSize;
    const center = renderSize / 2;
    const radius = center - 1 * pixelRatio;

    const imgData = ctx.createImageData(renderSize, renderSize);
    const data = imgData.data;

    for (let y = 0; y < renderSize; y++) {
      for (let x = 0; x < renderSize; x++) {
        // Симметричные субпиксельные координаты относительно геометрического центра
        const dx = x + 0.5 - center;
        const dy = y + 0.5 - center;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const index = (y * renderSize + x) * 4;

        if (dist <= radius) {
          let angle = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angle < 0) angle += 360;

          const sat = Math.min(100, (dist / radius) * 100);
          const rgb = hslToRgb(angle, sat, 50);

          data[index] = rgb.r;
          data[index + 1] = rgb.g;
          data[index + 2] = rgb.b;
          data[index + 3] = 255;
        } else if (dist <= radius + 1.2 * pixelRatio) {
          // Мягкий антиалиасинг границы круга
          const alpha = Math.max(0, Math.min(1, 1 - (dist - radius) / (1.2 * pixelRatio)));
          let angle = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angle < 0) angle += 360;
          const rgb = hslToRgb(angle, 100, 50);

          data[index] = rgb.r;
          data[index + 1] = rgb.g;
          data[index + 2] = rgb.b;
          data[index + 3] = Math.round(alpha * 255);
        } else {
          data[index + 3] = 0;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, []);

  // Хит-тестинг и расчет координат при взаимодействии
  const handlePointerCoords = useCallback(
    (clientX: number, clientY: number) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxRadius = (WHEEL_RADIUS / WHEEL_WRAP_SIZE) * rect.width;

      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      const sat = Math.min(100, Math.max(0, (dist / maxRadius) * 100));
      onChange(Math.round(angle), Math.round(sat));
    },
    [onChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    handlePointerCoords(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      handlePointerCoords(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  // Координаты прицела на круге
  const markerAngleRad = (hue * Math.PI) / 180;
  const markerDist = (saturation / 100) * WHEEL_RADIUS;
  const markerX = WHEEL_CENTER + markerDist * Math.cos(markerAngleRad);
  const markerY = WHEEL_CENTER + markerDist * Math.sin(markerAngleRad);

  return (
    <div
      ref={wrapRef}
      className="color-picker-wheel-wrap"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={() => {
        isDraggingRef.current = false;
      }}
      style={{
        borderColor: currentHex,
        boxShadow: `0 0 14px ${currentHex}44, inset 0 0 6px ${currentHex}22`,
      }}
    >
      <canvas
        ref={canvasRef}
        className="color-picker-wheel-canvas"
        aria-hidden="true"
      />
      {/* Контрастный маркер прицела */}
      <div
        className="color-picker-wheel-thumb"
        style={{
          left: markerX,
          top: markerY,
          backgroundColor: currentHex,
        }}
      />
    </div>
  );
};

