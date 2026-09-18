/**
 * Утилиты для управления позицией отображения времени воспроизведения видео в плеере L-MPV.
 *
 * Поддерживаемые варианты расположения:
 * - "timeline_right": Справа от таймлайна (Стандартное расположение)
 * - "timeline_left": Слева от таймлайна
 * - "volume_right": Справа от процентов громкости (в нижнем тулбаре управления)
 */

export type TimeDisplayPosition =
  | "timeline_right"
  | "timeline_left"
  | "volume_right"
  | "toolbar_right"
  | "timeline_floating_center"
  | "titlebar";

export const TIME_POSITION_STORAGE_KEY = "l-mpv-time-position";
export const DEFAULT_TIME_POSITION: TimeDisplayPosition = "timeline_right";

export interface TimePositionOption {
  id: TimeDisplayPosition;
  label: string;
  desc: string;
}

export const TIME_POSITION_OPTIONS: TimePositionOption[] = [
  {
    id: "timeline_left",
    label: "Слева от таймлайна",
    desc: "Перед полосой перемотки",
  },
  {
    id: "timeline_right",
    label: "Справа от таймлайна",
    desc: "Стандартное положение",
  },
  {
    id: "volume_right",
    label: "Справа от громкости",
    desc: "В тулбаре рядом со звуком",
  },
  {
    id: "toolbar_right",
    label: "Справа в тулбаре",
    desc: "Перед кнопками масштаба",
  },
  {
    id: "timeline_floating_center",
    label: "По центру над таймлайном",
    desc: "Парящая капсула",
  },
  {
    id: "titlebar",
    label: "В заголовке окна (Titlebar)",
    desc: "В верхней системной панели",
  },
];

/**
 * Получение сохранённого положения времени воспроизведения из localStorage с валидацией.
 */
export function getSavedTimePosition(): TimeDisplayPosition {
  try {
    const saved = localStorage.getItem(TIME_POSITION_STORAGE_KEY) as TimeDisplayPosition;
    const validPositions: TimeDisplayPosition[] = [
      "timeline_left",
      "timeline_right",
      "volume_right",
      "toolbar_right",
      "timeline_floating_center",
      "titlebar",
    ];
    if (saved && validPositions.includes(saved)) {
      return saved;
    }
  } catch (e) {
    console.error("Ошибка чтения позиции времени из localStorage:", e);
  }
  return DEFAULT_TIME_POSITION;
}

/**
 * Сохранение выбранного положения времени в localStorage и отправка глобального события синхронизации.
 */
export function saveTimePosition(pos: TimeDisplayPosition): void {
  try {
    localStorage.setItem(TIME_POSITION_STORAGE_KEY, pos);
  } catch (e) {
    console.error("Ошибка сохранения позиции времени в localStorage:", e);
  }
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}
