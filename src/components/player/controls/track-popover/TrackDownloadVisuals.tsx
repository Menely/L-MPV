import React, { useEffect, useRef, useState } from "react";
import * as m from "motion/react-m";
import type { Transition } from "motion/react";
import { X } from "lucide-react";
import { useMotionAllowed } from "../../../motion/useMotionAllowed";

export {
  LiquidProgressFill as TrackLiquidProgressFill,
  type LiquidProgressFillProps as TrackLiquidProgressFillProps,
} from "../../../common/LiquidProgressFill";

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
  /** Размер иконки (16 для поповера, 13 для контекстного меню). */
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
> = React.memo(({
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
  const displayProgressRef = useRef<number>(progress);
  const runStartTimeRef = useRef<number>(0);
  const phaseTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  displayProgressRef.current = displayProgress;

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
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
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
        const startVal = displayProgressRef.current;
        const t0 = performance.now();

        const tick = (now: number) => {
          const k = Math.min(1, (now - t0) / remaining);
          setDisplayProgress(Math.round(startVal + (99 - startVal) * k));
          if (k < 1) {
            rafRef.current = window.requestAnimationFrame(tick);
          } else {
            rafRef.current = null;
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
  }, [status, progress, motionAllowed, visualPhase]);

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
});

TrackDownloadActionButton.displayName = "TrackDownloadActionButton";
