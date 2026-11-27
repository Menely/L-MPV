import React, { useEffect, useId, useRef } from "react";
import { useMotionAllowed } from "../motion/useMotionAllowed";

/**
 * Пропсы универсальной фоновой ленты жидкой заливки прогресса.
 */
export interface LiquidProgressFillProps {
  /** Текущий процент выполнения операции (0..100). */
  progress: number;
  /** Состояние операции (`running` — активное волнение, `completed` — заполнение до 100% с затуханием волн). */
  status: "running" | "completed";
  /** Дополнительный CSS-класс (например, `track-liquid-fill--vivid`). */
  className?: string;
}

/** Точка профиля волны по высоте элемента. */
interface WavePoint {
  x: number;
  y: number;
}

const WAVE_SEGMENTS = 8;

/**
 * Создаёт предвыделенный массив точек волны для Zero-Allocation расчётов в цикле RAF.
 */
function createPreallocatedWavePoints(): WavePoint[] {
  return Array.from({ length: WAVE_SEGMENTS + 1 }, () => ({ x: 0, y: 0 }));
}

/**
 * Строит C1-гладкий замкнутый SVG-контур жидкости от левой стенки (x = 0)
 * до правого волнового фронта через кубический сплайн Catmull-Rom.
 */
function buildLiquidWavePath(points: ReadonlyArray<WavePoint>, height: number): string {
  const count = points.length;
  if (count < 2) {
    return "";
  }

  let d = `M 0,-2 L ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;

  for (let i = 0; i < count - 1; i += 1) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 >= count ? count - 1 : i + 2];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }

  d += ` L 0,${(height + 2).toFixed(2)} Z`;
  return d;
}

/**
 * Вычисляет мягкую органическую X-координату передней волны.
 * Низкие волновые числа (меньше одного цикла на высоту) исключают острые зубцы,
 * а несоизмеримые частоты создают непрерывное нелинейное перекатывание.
 */
function evaluateMainWaveX(
  baseFrontX: number,
  u: number,
  timeSec: number,
  ampScale: number,
  maxWidth: number
): number {
  const swell = Math.sin(timeSec * 1.07 + 0.55 * Math.sin(timeSec * 0.41));
  const arc = Math.sin(u * 3.6 - timeSec * 1.38 + 0.3);
  const cross = Math.sin(u * 5.6 + timeSec * 2.04 + 1.85);
  const tilt = Math.sin(u * 2.1 + timeSec * 0.79 + 3.2);

  const delta = (2.35 * arc + 1.05 * cross + 0.85 * tilt + 1.35 * swell) * ampScale;
  return Math.max(2, Math.min(maxWidth + 4, baseFrontX + delta));
}

/**
 * Вычисляет хаотично отстающую и опережающую X-координату задней глубинной волны.
 */
function evaluateSubWaveX(
  baseFrontX: number,
  u: number,
  timeSec: number,
  ampScale: number,
  maxWidth: number
): number {
  const swell = Math.cos(timeSec * 0.89 + 0.6 * Math.sin(timeSec * 0.34));
  const arc = Math.sin(u * 3.25 + timeSec * 1.13 + 2.4);
  const cross = Math.sin(u * 5.15 - timeSec * 1.76 + 0.7);
  const tilt = Math.sin(u * 2.35 - timeSec * 0.71 + 4.1);

  const delta =
    (2.1 + 2.45 * arc + 1.15 * cross + 0.95 * tilt + 1.45 * swell) * ampScale;
  return Math.max(2, Math.min(maxWidth + 6, baseFrontX + delta));
}

/**
 * Универсальный бесшовный физический индикатор жидкой заливки прогресса:
 * - Единый SVG на всю область контейнера исключает любой вертикальный шов или зазор.
 * - Пологие C1-кривые Catmull-Rom с несоизмеримыми гармониками создают живые округлые волны.
 * - Внутренний переливающийся свет и поверхностное свечение мениска накладываются строго
 *   по контуру самих волн и плавно доходят до их вершин.
 * - Zero-Allocation цикл RAF с автоматической приостановкой после полного завершения (100%).
 */
export const LiquidProgressFill: React.FC<LiquidProgressFillProps> = React.memo(({
  progress,
  status,
  className,
}) => {
  const motionAllowed = useMotionAllowed();
  const rawUid = useId().replace(/:/g, "");
  const shineGradId = `liquid-shine-${rawUid}`;
  const rimGradId = `liquid-rim-${rawUid}`;

  const containerRef = useRef<HTMLSpanElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const subWaveRef = useRef<SVGPathElement | null>(null);
  const mainWaveRef = useRef<SVGPathElement | null>(null);
  const shineWaveRef = useRef<SVGPathElement | null>(null);
  const rimWaveRef = useRef<SVGPathElement | null>(null);
  const shineGradRef = useRef<SVGLinearGradientElement | null>(null);
  const rimGradRef = useRef<SVGLinearGradientElement | null>(null);

  const clampedTarget =
    status === "completed"
      ? 100
      : Math.max(9, Math.min(100, progress <= 0 ? 9 : progress));

  const targetProgressRef = useRef<number>(clampedTarget);
  const statusRef = useRef<"running" | "completed">(status);
  const smoothProgressRef = useRef<number>(clampedTarget);
  const sizeRef = useRef<{ width: number; height: number }>({
    width: 148,
    height: 28,
  });
  const wakeRafRef = useRef<(() => void) | null>(null);

  targetProgressRef.current = clampedTarget;
  statusRef.current = status;

  useEffect(() => {
    wakeRafRef.current?.();
  }, [clampedTarget, status]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = (w: number, h: number) => {
      if (w > 1 && h > 1) {
        sizeRef.current = { width: w, height: h };
        svgRef.current?.setAttribute(
          "viewBox",
          `0 0 ${w.toFixed(1)} ${h.toFixed(1)}`
        );
        wakeRafRef.current?.();
      }
    };

    const rect = container.getBoundingClientRect();
    updateSize(rect.width, rect.height);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateSize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mainPoints = createPreallocatedWavePoints();
    const subPoints = createPreallocatedWavePoints();

    /**
     * Обновляет геометрию волн за один кадр.
     * Возвращает `true`, если анимация ещё активна и требует следующего кадра RAF.
     */
    const applyFrame = (timeSec: number, dt: number): boolean => {
      const { width, height } = sizeRef.current;
      const target = targetProgressRef.current;
      const prev = smoothProgressRef.current;

      let current = prev;
      if (motionAllowed) {
        const factor = 1 - Math.exp(-dt * 5.6);
        current = prev + (target - prev) * factor;
        if (Math.abs(target - current) < 0.03) {
          current = target;
        }
      } else {
        current = target;
      }
      smoothProgressRef.current = current;

      const velocityPxPerSec =
        dt > 0.0001 ? (((current - prev) / 100) * width) / dt : 0;
      const frontX = Math.max(6, (width * current) / 100);

      const edgeFade = Math.max(0, Math.min(1, (width - frontX + 4) / 12));
      const isSettledComplete =
        statusRef.current === "completed" && current >= 99.95;
      const completeFade =
        statusRef.current === "completed" && current > 98.5 ? 0 : 1;
      const motionAmplitude = motionAllowed
        ? edgeFade *
          completeFade *
          (1 + Math.min(0.45, Math.abs(velocityPxPerSec) * 0.008))
        : 0;

      const totalSpan = height + 4;
      const safeHeight = Math.max(1, height);

      for (let i = 0; i <= WAVE_SEGMENTS; i += 1) {
        const y = -2 + (totalSpan * i) / WAVE_SEGMENTS;
        const u = Math.max(0, Math.min(1, y / safeHeight));
        mainPoints[i].x = evaluateMainWaveX(
          frontX,
          u,
          timeSec,
          motionAmplitude,
          width
        );
        mainPoints[i].y = y;
        subPoints[i].x = evaluateSubWaveX(
          frontX,
          u,
          timeSec,
          motionAmplitude,
          width
        );
        subPoints[i].y = y;
      }

      const mainD = buildLiquidWavePath(mainPoints, height);
      const subD = buildLiquidWavePath(subPoints, height);

      subWaveRef.current?.setAttribute("d", subD);
      mainWaveRef.current?.setAttribute("d", mainD);
      shineWaveRef.current?.setAttribute("d", mainD);
      rimWaveRef.current?.setAttribute("d", mainD);

      if (shineGradRef.current && motionAllowed) {
        const shineSpan = Math.max(54, frontX * 0.72);
        const linearPhase = (timeSec * 0.34) % 1;
        const organicPhase =
          linearPhase - 0.055 * Math.sin(linearPhase * Math.PI * 2);
        const travelStart = -shineSpan * 1.05;
        const travelEnd = frontX + Math.max(20, shineSpan * 0.35);
        const shineStartX =
          travelStart + (travelEnd - travelStart) * organicPhase;

        shineGradRef.current.setAttribute("x1", shineStartX.toFixed(1));
        shineGradRef.current.setAttribute("y1", "0");
        shineGradRef.current.setAttribute(
          "x2",
          (shineStartX + shineSpan).toFixed(1)
        );
        shineGradRef.current.setAttribute("y2", height.toFixed(1));
      }

      if (rimGradRef.current) {
        const rimAlphaScale = edgeFade * completeFade;
        const rimX1 = Math.max(-4, frontX - 16);
        const rimX2 = frontX + 6;
        rimGradRef.current.setAttribute("x1", rimX1.toFixed(1));
        rimGradRef.current.setAttribute("y1", "0");
        rimGradRef.current.setAttribute("x2", rimX2.toFixed(1));
        rimGradRef.current.setAttribute("y2", "0");
        rimWaveRef.current?.setAttribute("opacity", rimAlphaScale.toFixed(3));
      }

      return motionAllowed && !isSettledComplete;
    };

    if (!motionAllowed) {
      applyFrame(0, 0);
      wakeRafRef.current = () => {
        applyFrame(0, 0);
      };
      return () => {
        wakeRafRef.current = null;
      };
    }

    let rafId = 0;
    let lastTime = performance.now();
    const phaseOffset = (lastTime % 10000) * 0.001;

    const tick = (now: number) => {
      rafId = 0;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) * 0.001));
      lastTime = now;
      const keepRunning = applyFrame(now * 0.00134 + phaseOffset, dt);
      if (keepRunning) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const startOrWake = () => {
      if (!rafId) {
        lastTime = performance.now();
        const keepRunning = applyFrame(lastTime * 0.00134 + phaseOffset, 0.016);
        if (keepRunning) {
          rafId = window.requestAnimationFrame(tick);
        }
      }
    };

    wakeRafRef.current = startOrWake;
    startOrWake();

    return () => {
      wakeRafRef.current = null;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [motionAllowed]);

  return (
    <span
      ref={containerRef}
      className={`track-liquid-fill ${
        status === "completed" ? "track-liquid-fill--completed" : ""
      } ${className || ""}`.trim()}
      aria-hidden="true"
    >
      <svg
        ref={svgRef}
        className="track-liquid-fill__svg"
        viewBox="0 0 148 28"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient
            ref={shineGradRef}
            id={shineGradId}
            gradientUnits="userSpaceOnUse"
            x1="-60"
            y1="0"
            x2="20"
            y2="28"
          >
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="28%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="72%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <linearGradient
            ref={rimGradRef}
            id={rimGradId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="20"
            y2="0"
          >
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="88%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        <path ref={subWaveRef} fill="currentColor" fillOpacity="0.48" />
        <path ref={mainWaveRef} fill="currentColor" />
        {motionAllowed && (
          <path ref={shineWaveRef} fill={`url(#${shineGradId})`} />
        )}
        <path ref={rimWaveRef} fill={`url(#${rimGradId})`} />
      </svg>
    </span>
  );
});

LiquidProgressFill.displayName = "LiquidProgressFill";
