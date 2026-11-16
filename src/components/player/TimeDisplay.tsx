import { formatTimeByMode, TimeFormatMode } from "../../utils/timeFormatUtils";
import { usePlayerProgress } from "../../contexts/PlayerStateContext";
import { useTranslation } from "../../i18n/LanguageContext";

export interface TimeDisplayProps {
  /** Дополнительные CSS-классы оформления */
  className?: string;
  /** Активный режим отображения времени */
  timeFormat: TimeFormatMode;
  /** Обработчик переключения формата времени по клику */
  onCycleFormat: () => void;
  /** Текущая скорость воспроизведения для расчета времени окончания */
  speed?: number;
  /** Признак интерактивности (если false — рендерится как пассивный span без ролей кнопки и табиндекса) */
  isInteractive?: boolean;
}

/**
 * Интерактивный компонент отображения времени воспроизведения видео с поддержкой смены форматов по клику.
 */
export function TimeDisplay({
  className = "",
  timeFormat,
  onCycleFormat,
  speed = 1.0,
  isInteractive = true,
}: TimeDisplayProps) {
  const { dict, locale } = useTranslation();
  const { position, duration } = usePlayerProgress();
  const formatted = formatTimeByMode(position, duration, timeFormat, speed, locale);

  if (!isInteractive) {
    return (
      <span className={`time-display ${className}`}>
        <span className="time-display__full">
          {formatted.full}
        </span>
        <span className="time-display__compact">
          {formatted.compact}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`time-display ${className}`}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onCycleFormat();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onCycleFormat();
        }
      }}
      title={dict.controls.timeFormatHint}
      >
      <span className="time-display__full">
        {formatted.full}
      </span>
      <span className="time-display__compact">
        {formatted.compact}
      </span>
    </span>
  );
}
