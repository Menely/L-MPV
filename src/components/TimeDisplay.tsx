import { formatTimeByMode, TimeFormatMode } from "../utils/timeFormatUtils";
import { usePlayerProgress } from "../contexts/PlayerStateContext";

export interface TimeDisplayProps {
  /** Дополнительные CSS-классы оформления */
  className?: string;
  /** Активный режим отображения времени */
  timeFormat: TimeFormatMode;
  /** Обработчик переключения формата времени по клику */
  onCycleFormat: () => void;
  /** Текущая скорость воспроизведения для расчета времени окончания */
  speed?: number;
}

/**
 * Интерактивный компонент отображения времени воспроизведения видео с поддержкой смены форматов по клику.
 */
export function TimeDisplay({
  className = "",
  timeFormat,
  onCycleFormat,
  speed = 1.0,
}: TimeDisplayProps) {
  const { position, duration } = usePlayerProgress();
  const formatted = formatTimeByMode(position, duration, timeFormat, speed);

  return (
    <span
      className={`time-display ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onCycleFormat();
      }}
      title="Нажмите для смены формата времени"
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
