import React, { useEffect, useRef, useState } from "react";
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
}

/**
 * Пути ключевых фаз основного фронта жидкости (C1-гладкие кубические кривые Безье: x3 = (x2 + x4) / 2).
 * Имитируют нелинейное перекатывание, инерционный всплеск у стенок и распад на две мягкие волны.
 */
const PRIMARY_WAVE_VALUES = [
  "M 0,0 L 6,0 C 16,22 15,36 9,50 C 3,64 2,78 5,100 L 0,100 Z",
  "M 0,0 L 3,0 C 9,22 16,36 15.5,50 C 15,64 7,78 3,100 L 0,100 Z",
  "M 0,0 L 5,0 C 2,22 3,36 9,50 C 15,64 16.5,78 8,100 L 0,100 Z",
  "M 0,0 L 8,0 C 15,22 5,36 5,50 C 5,64 14.5,78 6,100 L 0,100 Z",
  "M 0,0 L 4,0 C 3,22 7,36 11.5,50 C 16,64 12,78 4,100 L 0,100 Z",
  "M 0,0 L 5,0 C 13,22 16,36 11,50 C 6,64 3,78 6,100 L 0,100 Z",
  "M 0,0 L 6,0 C 16,22 15,36 9,50 C 3,64 2,78 5,100 L 0,100 Z",
].join("; ");

/**
 * Пути ключевых фаз вторичной глубинной волны, движущейся в несинхронном ритме (2.1с против 3.2с)
 * для создания живого апериодического и слегка хаотичного поведения жидкости.
 */
const SECONDARY_WAVE_VALUES = [
  "M 0,0 L 5,0 C 2,22 4,36 10,50 C 16,64 17.5,78 8,100 L 0,100 Z",
  "M 0,0 L 8,0 C 16.5,22 6,36 6,50 C 6,64 15.5,78 7,100 L 0,100 Z",
  "M 0,0 L 7,0 C 17.5,22 15,36 9,50 C 3,64 2,78 5,100 L 0,100 Z",
  "M 0,0 L 3,0 C 8,22 17,36 16.5,50 C 16,64 8,78 3,100 L 0,100 Z",
  "M 0,0 L 6,0 C 4,22 5,36 10,50 C 15,64 13,78 5,100 L 0,100 Z",
  "M 0,0 L 5,0 C 2,22 4,36 10,50 C 16,64 17.5,78 8,100 L 0,100 Z",
].join("; ");

/**
 * Анимированная лента загрузки дорожки:
 * - Точно повторяет форму, размер, скругление и плоский акцентный цвет фона наведения (`--hover-veil-float`).
 * - Не содержит белых полос, рамок или линейных бликов — используется исключительно акцентный цвет.
 * - Передний край формируется бесшовным двухслойным SVG-мениском с нелинейной сплайн-деформацией.
 */
export const TrackLiquidProgressFill: React.FC<TrackLiquidProgressFillProps> = ({
  progress,
  status,
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const visualWidth =
    status === "completed"
      ? 100
      : clampedProgress <= 0
      ? 9
      : Math.max(9, clampedProgress);

  return (
    <span
      className={`track-liquid-fill ${
        status === "completed" ? "track-liquid-fill--completed" : ""
      }`}
      aria-hidden="true"
    >
      <span
        className="track-liquid-fill__bar"
        style={{ width: `${visualWidth}%` }}
      >
        <span className="track-liquid-fill__body" />
        <span className="track-liquid-fill__meniscus">
          <svg
            className="track-liquid-fill__wave-svg"
            viewBox="0 0 18 100"
            preserveAspectRatio="none"
          >
            <path
              className="track-liquid-fill__wave-sub"
              d="M 0,0 L 5,0 C 2,22 4,36 10,50 C 16,64 17.5,78 8,100 L 0,100 Z"
              fill="currentColor"
            >
              <animate
                attributeName="d"
                dur="2.1s"
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes="0; 0.22; 0.41; 0.63; 0.82; 1"
                keySplines="0.42 0 0.58 1; 0.34 0.06 0.28 1; 0.45 0.05 0.55 0.95; 0.28 0.12 0.36 1; 0.4 0 0.6 1"
                values={SECONDARY_WAVE_VALUES}
              />
            </path>
            <path
              className="track-liquid-fill__wave-main"
              d="M 0,0 L 6,0 C 16,22 15,36 9,50 C 3,64 2,78 5,100 L 0,100 Z"
              fill="currentColor"
            >
              <animate
                attributeName="d"
                dur="3.2s"
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes="0; 0.17; 0.35; 0.52; 0.68; 0.84; 1"
                keySplines="0.42 0 0.24 1; 0.28 0.08 0.26 1; 0.45 0.05 0.55 0.95; 0.35 0 0.65 1; 0.22 0.68 0.38 0.98; 0.4 0 0.6 1"
                values={PRIMARY_WAVE_VALUES}
              />
            </path>
          </svg>
        </span>
      </span>
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
