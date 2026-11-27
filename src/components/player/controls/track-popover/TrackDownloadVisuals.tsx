import React, { useEffect, useId, useRef, useState } from "react";
import * as m from "motion/react-m";
import type { Transition } from "motion/react";
import { X } from "lucide-react";
import { useMotionAllowed } from "../../../motion/useMotionAllowed";

/**
 * Пропсы фоновой ленты жидкой заливки внутри строки дорожки.
 */
export interface TrackLiquidProgressFillProps {
  /** Текущий процент выполнения операции (0..100). */
  progress: number;
  /** Состояние загрузки дорожки. */
  status: "running" | "completed";
  /** Дополнительный CSS-класс. */
  className?: string;
}

/** Точка профиля волны по высоте элемента. */
interface WavePoint {
  x: number;
  y: number;
}

const WAVE_SEGMENTS = 8;

/**
 * Строит C1-гладкий замкнутый SVG-контур жидкости от левой стенки (x = 0)
 * до правого волнового фронта через кубический сплайн Catmull-Rom.
 */
function buildLiquidWavePath(points: ReadonlyArray<WavePoint>, height: number): string {
  const count = points.length;
  if (count < 2) {
    return "";
  }

  const parts: string[] = [
    `M 0,-2`,
    `L ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`,
  ];

  for (let i = 0; i < count - 1; i += 1) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 >= count ? count - 1 : i + 2];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    parts.push(
      `C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`
    );
  }

  parts.push(`L 0,${(height + 2).toFixed(2)}`, "Z");
  return parts.join(" ");
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
 * Бесшовная физическая анимация жидкой ленты прогресса:
 * - Единый SVG на всю область контейнера исключает любой вертикальный шов или зазор.
 * - Пологие C1-кривые Catmull-Rom с несоизмеримыми гармониками создают живые округлые волны.
 * - Внутренний переливающийся свет и поверхностное свечение мениска накладываются строго
 *   по контуру самих волн и плавно доходят до их вершин.
 */
export const TrackLiquidProgressFill: React.FC<TrackLiquidProgressFillProps> = ({
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

  targetProgressRef.current = clampedTarget;
  statusRef.current = status;

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
    const applyFrame = (timeSec: number, dt: number) => {
      const { width, height } = sizeRef.current;
      const target = targetProgressRef.current;
      const prev = smoothProgressRef.current;

      let current = prev;
      if (motionAllowed) {
        // Экспоненциальное сглаживание уровня, независимое от частоты обновления монитора
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
        dt > 0.0001 ? ((current - prev) / 100) * width / dt : 0;
      const frontX = Math.max(6, (width * current) / 100);

      // Волны мягко выравниваются при полном заполнении и слегка колышутся при росте уровня
      const edgeFade = Math.max(0, Math.min(1, (width - frontX + 4) / 12));
      const completeFade = statusRef.current === "completed" && current > 98.5 ? 0 : 1;
      const motionAmplitude = motionAllowed
        ? edgeFade *
          completeFade *
          (1 + Math.min(0.45, Math.abs(velocityPxPerSec) * 0.008))
        : 0;

      const mainPoints: WavePoint[] = [];
      const subPoints: WavePoint[] = [];
      const totalSpan = height + 4;

      for (let i = 0; i <= WAVE_SEGMENTS; i += 1) {
        const y = -2 + (totalSpan * i) / WAVE_SEGMENTS;
        const u = Math.max(0, Math.min(1, y / Math.max(1, height)));
        mainPoints.push({
          x: evaluateMainWaveX(frontX, u, timeSec, motionAmplitude, width),
          y,
        });
        subPoints.push({
          x: evaluateSubWaveX(frontX, u, timeSec, motionAmplitude, width),
          y,
        });
      }

      const mainD = buildLiquidWavePath(mainPoints, height);
      const subD = buildLiquidWavePath(subPoints, height);

      subWaveRef.current?.setAttribute("d", subD);
      mainWaveRef.current?.setAttribute("d", mainD);
      shineWaveRef.current?.setAttribute("d", mainD);
      rimWaveRef.current?.setAttribute("d", mainD);

      // Бегущий нелинейный поток света, проходящий сквозь всю длину до самых вершин волн
      if (shineGradRef.current && motionAllowed) {
        const shineSpan = Math.max(54, frontX * 0.72);
        const linearPhase = (timeSec * 0.34) % 1;
        // Мягкое естественное замедление-ускорение вместо жёсткого метронома
        const organicPhase =
          linearPhase - 0.055 * Math.sin(linearPhase * Math.PI * 2);
        const travelStart = -shineSpan * 1.05;
        const travelEnd = frontX + Math.max(20, shineSpan * 0.35);
        const shineStartX = travelStart + (travelEnd - travelStart) * organicPhase;

        shineGradRef.current.setAttribute("x1", shineStartX.toFixed(1));
        shineGradRef.current.setAttribute("y1", "0");
        shineGradRef.current.setAttribute(
          "x2",
          (shineStartX + shineSpan).toFixed(1)
        );
        shineGradRef.current.setAttribute("y2", height.toFixed(1));
      }

      // Световой ореол мениска строго по изогнутой передней кромке воды
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
    };

    if (!motionAllowed) {
      applyFrame(0, 0);
      return;
    }

    let rafId = 0;
    let lastTime = performance.now();
    // Индивидуальный случайный сдвиг фазы от времени старта, чтобы соседние прогресс-бары двигались хаотично
    const phaseOffset = (lastTime % 10000) * 0.001;

    // Синхронно рисуем первый кадр без мерцания при монтировании
    applyFrame(lastTime * 0.001 + phaseOffset, 0.016);

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) * 0.001));
      lastTime = now;
      applyFrame(now * 0.00134 + phaseOffset, dt);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
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
};

/**
 * Пропсы компактной кнопки скачивания / процентов / отмены / завершения.
 */
export interface TrackDownloadActionButtonProps {
  /** Подпись для запуска скачивания. */
  downloadLabel: string;
  /** Подпись для отмены активного скачивания. */
  cancelLabel: string;
  /** Подпись успешного завершения. */
  completedLabel?: string;
  /** Текущий статус операции. */
  status: "idle" | "running" | "completed";
  /** Прогресс в процентах (0..100) для статуса `running`. */
  progress?: number;
  /** Размер иконки (14 для поповера, 13 для контекстного меню). */
  iconSize?: number;
  /** Обработчик старта скачивания. */
  onDownload: () => void;
  /** Обработчик отмены скачивания. */
  onCancel?: () => void;
}

const INSTANT_TRANSITION: Transition = { duration: 0 };
const MORPH_TRANSITION: Transition = {
  duration: 0.3,
  ease: [0.22, 1, 0.36, 1],
};
const SPRING_TRANSITION: Transition = {
  type: "spring",
  stiffness: 440,
  damping: 24,
  mass: 0.65,
};

const DOWNLOAD_MORPH_PATHS = {
  /** Ствол стрелки скачивания (idle) <-> сжатая точка в центре (running / completed). */
  shaftIdle: "M 12.00 3.30 L 12.00 15.10",
  shaftCollapsed: "M 12.00 12.00 L 12.00 12.00",

  /** Остриё стрелки (3 вершины, idle) <-> горизонтальный импульс (running) <-> галочка Check (3 вершины, completed). */
  headIdle: "M 7.00 10.50 L 12.00 15.50 L 17.00 10.50",
  headRunning: "M 8.20 12.00 L 12.00 12.00 L 15.80 12.00",
  headCompleted: "M 4.40 12.50 L 9.80 17.90 L 19.70 7.00",

  /** Нижний лоток скачивания (idle) <-> стягивается к центру (running / completed). */
  trayIdle:
    "M 4.20 17.00 C 4.20 19.00 5.20 20.00 7.20 20.00 L 16.80 20.00 C 18.80 20.00 19.80 19.00 19.80 17.00",
  trayCollapsed:
    "M 9.00 12.50 C 9.00 12.50 10.00 12.50 11.00 12.50 L 13.00 12.50 C 14.00 12.50 15.00 12.50 15.00 12.50",
} as const;

/**
 * Кнопка действия справа от строки дорожки с непрерывным 4-фазным морфингом:
 * 1. `idle` -> `running`: стрелка и лоток скачивания складываются к центру и плавно
 *    трансформируются в бегущие цифры процентов (`0%..99%`).
 * 2. `running` -> `completed`: цифры процентов сжимаются и перетекают в сочную зелёную галочку Check.
 * 3. `completed` -> `idle`: 3 вершины галочки Check напрямую перетекают обратно в остриё стрелки
 *    скачивания с синхронным раскрытием ствола и нижнего лотка.
 */
export const TrackDownloadActionButton: React.FC<
  TrackDownloadActionButtonProps
> = ({
  downloadLabel,
  cancelLabel,
  completedLabel,
  status,
  progress = 0,
  iconSize = 14,
  onDownload,
  onCancel,
}) => {
  const motionAllowed = useMotionAllowed();

  // Визуальная фаза гарантирует, что даже при мгновенном извлечении субтитров (<50 мс)
  // пользователь увидит плавную трансформацию: Иконка -> Проценты -> Галочка -> Иконка.
  const [visualPhase, setVisualPhase] = useState<
    "idle" | "running" | "completed"
  >(status);
  const [displayProgress, setDisplayProgress] = useState<number>(progress);
  const runStartTimeRef = useRef<number>(0);
  const phaseTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (phaseTimerRef.current !== null) {
        window.clearTimeout(phaseTimerRef.current);
      }
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (phaseTimerRef.current !== null) {
      window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }

    if (status === "running") {
      if (visualPhase !== "running") {
        runStartTimeRef.current = performance.now();
        setVisualPhase("running");
      }
      setDisplayProgress(progress);
      return;
    }

    if (status === "completed") {
      if (!motionAllowed) {
        setDisplayProgress(100);
        setVisualPhase("completed");
        return;
      }

      const elapsed =
        runStartTimeRef.current > 0
          ? performance.now() - runStartTimeRef.current
          : 9999;
      const minRunningDuration = 420;

      if (visualPhase === "running" && elapsed < minRunningDuration) {
        // Плавно докручиваем проценты до 99% перед перетеканием в галочку
        const remaining = minRunningDuration - elapsed;
        const startVal = displayProgress;
        const t0 = performance.now();

        const tick = (now: number) => {
          const k = Math.min(1, (now - t0) / remaining);
          setDisplayProgress(Math.round(startVal + (99 - startVal) * k));
          if (k < 1) {
            rafRef.current = window.requestAnimationFrame(tick);
          }
        };
        rafRef.current = window.requestAnimationFrame(tick);

        phaseTimerRef.current = window.setTimeout(() => {
          setDisplayProgress(100);
          setVisualPhase("completed");
          phaseTimerRef.current = null;
        }, remaining);
      } else {
        setDisplayProgress(100);
        setVisualPhase("completed");
      }
      return;
    }

    // status === "idle"
    if (visualPhase === "completed" && motionAllowed) {
      // Небольшая задержка, если фаза running была продлена, чтобы галочка успела покрасоваться
      const elapsedSinceRun =
        runStartTimeRef.current > 0
          ? performance.now() - runStartTimeRef.current
          : 9999;
      const waitMs = elapsedSinceRun < 1450 ? 1450 - elapsedSinceRun : 0;
      if (waitMs > 0) {
        phaseTimerRef.current = window.setTimeout(() => {
          setVisualPhase("idle");
          setDisplayProgress(0);
          runStartTimeRef.current = 0;
          phaseTimerRef.current = null;
        }, waitMs);
        return;
      }
    }

    setVisualPhase("idle");
    setDisplayProgress(0);
    runStartTimeRef.current = 0;
  }, [status, progress, motionAllowed, visualPhase, displayProgress]);

  const isRunning = visualPhase === "running";
  const isCompleted = visualPhase === "completed";
  const roundedPercent = Math.max(0, Math.min(99, Math.round(displayProgress)));

  const ariaLabel = isRunning
    ? cancelLabel
    : isCompleted
    ? completedLabel || downloadLabel
    : downloadLabel;

  const btnClass = [
    "track-download-btn",
    isRunning ? "track-download-btn--progress" : "",
    isCompleted ? "track-download-btn--completed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const morphTransition = motionAllowed ? MORPH_TRANSITION : INSTANT_TRANSITION;
  const springTransition = motionAllowed
    ? SPRING_TRANSITION
    : INSTANT_TRANSITION;

  // Чуть более выразительный оптический размер (+1px) и плотная толщина линий
  const effectiveSvgSize = iconSize + 1;

  return (
    <button
      type="button"
      className={btnClass}
      title={ariaLabel}
      aria-label={ariaLabel}
      disabled={isCompleted}
      onClick={(e) => {
        e.stopPropagation();
        if (status === "running") {
          onCancel?.();
        } else if (status === "idle" && visualPhase === "idle") {
          runStartTimeRef.current = performance.now();
          setVisualPhase("running");
          setDisplayProgress(0);
          onDownload();
        }
      }}
    >
      {/* Постоянный векторный слой: Стрелка скачивания <-> Импульс <-> Зелёная галочка Check */}
      <m.svg
        xmlns="http://www.w3.org/2000/svg"
        width={effectiveSvgSize}
        height={effectiveSvgSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={isCompleted ? 2.75 : 2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        shapeRendering="geometricPrecision"
        className="track-download-btn__morph-svg"
        aria-hidden="true"
        initial={false}
        animate={{
          opacity: isRunning ? 0 : 1,
          scale: isRunning ? 0.45 : isCompleted ? 1.08 : 1,
        }}
        style={{
          color: isCompleted ? "var(--success-text)" : "currentColor",
          transformOrigin: "12px 12px",
          transition: "color 0.24s ease",
        }}
        transition={springTransition}
      >
        {/* Ствол стрелки скачивания */}
        <m.path
          initial={false}
          animate={{
            d:
              visualPhase === "idle"
                ? DOWNLOAD_MORPH_PATHS.shaftIdle
                : DOWNLOAD_MORPH_PATHS.shaftCollapsed,
            opacity: visualPhase === "idle" ? 1 : 0,
          }}
          transition={morphTransition}
        />

        {/* Остриё стрелки (3 вершины) <-> Импульс <-> Галочка Check (3 вершины) */}
        <m.path
          initial={false}
          animate={{
            d:
              visualPhase === "completed"
                ? DOWNLOAD_MORPH_PATHS.headCompleted
                : visualPhase === "running"
                ? DOWNLOAD_MORPH_PATHS.headRunning
                : DOWNLOAD_MORPH_PATHS.headIdle,
          }}
          transition={morphTransition}
        />

        {/* Нижний лоток скачивания */}
        <m.path
          initial={false}
          animate={{
            d:
              visualPhase === "idle"
                ? DOWNLOAD_MORPH_PATHS.trayIdle
                : DOWNLOAD_MORPH_PATHS.trayCollapsed,
            opacity: visualPhase === "idle" ? 1 : 0,
          }}
          transition={morphTransition}
        />
      </m.svg>

      {/* Слой процентов и кнопки отмены (плавно вырастает из центра стрелки в фазе running) */}
      <m.span
        className="track-download-btn__percent-wrap"
        aria-hidden={!isRunning}
        initial={false}
        animate={{
          opacity: isRunning ? 1 : 0,
          scale: isRunning ? 1 : 0.42,
          y: isRunning ? 0 : visualPhase === "completed" ? -2 : 2,
        }}
        transition={springTransition}
      >
        <span className="track-download-btn__percent">{roundedPercent}%</span>
        <span className="track-download-btn__cancel" aria-hidden="true">
          <X size={iconSize} strokeWidth={2.55} />
        </span>
      </m.span>
    </button>
  );
};
