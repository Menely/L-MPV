import { formatTime } from "./timeUtils";

/**
 * Режимы отображения времени воспроизведения видео в плеере L-MPV:
 * - "elapsed_total": Прошедшее время / Общая длительность (Стандарт)
 * - "elapsed_remaining": Прошедшее время / Оставшееся время с минусом
 * - "remaining_only": Только оставшееся время до конца видео
 * - "finish_time": Расчетное время завершения фильма по системным часам
 */
export type TimeFormatMode = "elapsed_total" | "elapsed_remaining" | "remaining_only" | "finish_time";

export const TIME_FORMAT_STORAGE_KEY = "l-mpv-time-format";
export const DEFAULT_TIME_FORMAT: TimeFormatMode = "elapsed_total";

export interface TimeFormatOption {
  id: TimeFormatMode;
  label: string;
  desc: string;
  example: string;
}

export const TIME_FORMAT_OPTIONS: TimeFormatOption[] = [
  {
    id: "elapsed_total",
    label: "Прошедшее / Общее",
    desc: "Стандартное отображение",
    example: "00:15 / 24:00",
  },
  {
    id: "elapsed_remaining",
    label: "Прошедшее / Оставшееся",
    desc: "С минусом до конца",
    example: "00:15 / -23:45",
  },
  {
    id: "remaining_only",
    label: "Только обратный отсчет",
    desc: "Сколько осталось до конца",
    example: "-23:45",
  },
  {
    id: "finish_time",
    label: "Время окончания фильма",
    desc: "По часам Windows с учётом скорости",
    example: "Конец в 22:15",
  },
];

/**
 * Чтение сохранённого формата времени из localStorage с валидацией.
 */
export function getSavedTimeFormat(): TimeFormatMode {
  try {
    const saved = localStorage.getItem(TIME_FORMAT_STORAGE_KEY);
    if (
      saved === "elapsed_total" ||
      saved === "elapsed_remaining" ||
      saved === "remaining_only" ||
      saved === "finish_time"
    ) {
      return saved;
    }
  } catch (e) {
    console.error("Ошибка чтения формата времени из localStorage:", e);
  }
  return DEFAULT_TIME_FORMAT;
}

/**
 * Сохранение выбранного формата времени в localStorage и глобальная синхронизация.
 */
export function saveTimeFormat(format: TimeFormatMode): void {
  try {
    localStorage.setItem(TIME_FORMAT_STORAGE_KEY, format);
  } catch (e) {
    console.error("Ошибка сохранения формата времени в localStorage:", e);
  }
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}

/**
 * Получение следующего формата времени для циклического переключения по клику.
 */
export function getNextTimeFormat(current: TimeFormatMode): TimeFormatMode {
  const modes: TimeFormatMode[] = [
    "elapsed_total",
    "elapsed_remaining",
    "remaining_only",
    "finish_time",
  ];
  const idx = modes.indexOf(current);
  if (idx === -1) return "elapsed_total";
  return modes[(idx + 1) % modes.length];
}

/**
 * Форматирование строкового представления времени на основе текущей позиции, длительности и режима.
 */
export function formatTimeByMode(
  position: number,
  duration: number,
  mode: TimeFormatMode,
  speed: number = 1.0
): { full: string; compact: string } {
  const posSec = Math.max(0, position);
  const durSec = Math.max(0, duration);
  const remSec = Math.max(0, durSec - posSec);

  switch (mode) {
    case "elapsed_remaining": {
      const full = `${formatTime(posSec)} / -${formatTime(remSec)}`;
      const compact = formatTime(posSec);
      return { full, compact };
    }
    case "remaining_only": {
      const full = `-${formatTime(remSec)}`;
      const compact = `-${formatTime(remSec)}`;
      return { full, compact };
    }
    case "finish_time": {
      if (durSec <= 0) {
        return {
          full: formatTime(posSec),
          compact: formatTime(posSec),
        };
      }
      const effectiveSpeed = speed > 0 ? speed : 1.0;
      const finishMs = Date.now() + (remSec / effectiveSpeed) * 1000;
      const finishDate = new Date(finishMs);
      const hours = finishDate.getHours().toString().padStart(2, "0");
      const minutes = finishDate.getMinutes().toString().padStart(2, "0");
      const full = `Конец в ${hours}:${minutes} (${formatTime(posSec)})`;
      const compact = `~${hours}:${minutes}`;
      return { full, compact };
    }
    case "elapsed_total":
    default: {
      const full = `${formatTime(posSec)} / ${formatTime(durSec)}`;
      const compact = formatTime(posSec);
      return { full, compact };
    }
  }
}
