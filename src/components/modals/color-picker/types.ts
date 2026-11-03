/**
 * Типы данных и геометрические константы окна выбора цвета L-MPV.
 */

export interface ColorPickerModalProps {
  /** Исходный цвет в формате HEX (по умолчанию #7FC7FF) */
  initialColor?: string;
  /** Колбэк подтверждения выбора цвета */
  onSelectColor: (hex: string) => void;
  /** Колбэк закрытия окна */
  onClose: () => void;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

/** 10 быстрых сбалансированных оттенков для мгновенного старта калибровки */
export const QUICK_PRESETS: readonly string[] = [
  "#7FC7FF", // Sky / Дефолтный L-MPV
  "#38BDF8", // Небесный
  "#34D399", // Изумрудный
  "#A7F3D0", // Мятный
  "#FACC15", // Золотой
  "#FB923C", // Закатный оранжевый
  "#F472B6", // Неоновый розовый
  "#C084FC", // Фиалковый
  "#F87171", // Коралловый рубин
  "#94A3B8", // Тёплый титан
];

/** Геометрические константы спектрального круга (в CSS px) */
export const WHEEL_SIZE = 192;
export const WHEEL_WRAP_SIZE = 192;
export const WHEEL_CANVAS_SIZE = 182;
export const WHEEL_CENTER = 96;
export const WHEEL_RADIUS = 89;

