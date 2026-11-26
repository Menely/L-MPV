import React from "react";
import { Check, Download, X } from "lucide-react";

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

/**
 * Кнопка действия справа от строки дорожки:
 * - В покое: иконка скачивания.
 * - В процессе: чистые проценты без кругового ползунка; при наведении — крестик отмены.
 * - По завершении: акцентная галочка.
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
  const isRunning = status === "running";
  const isCompleted = status === "completed";
  const roundedPercent = Math.max(0, Math.min(99, Math.round(progress)));

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

  return (
    <button
      type="button"
      className={btnClass}
      title={ariaLabel}
      aria-label={ariaLabel}
      disabled={isCompleted}
      onClick={(e) => {
        e.stopPropagation();
        if (isRunning) {
          onCancel?.();
        } else if (!isCompleted) {
          onDownload();
        }
      }}
    >
      {isRunning ? (
        <>
          <span className="track-download-btn__percent">{roundedPercent}%</span>
          <span className="track-download-btn__cancel" aria-hidden="true">
            <X size={iconSize} strokeWidth={2.5} />
          </span>
        </>
      ) : isCompleted ? (
        <span className="track-download-btn__done" aria-hidden="true">
          <Check size={iconSize} strokeWidth={2.6} />
        </span>
      ) : (
        <Download size={iconSize} />
      )}
    </button>
  );
};
