import { VisualizerMode, VisualizerTheme } from "../AudioVisualizer";

export const MODE_LABELS: Record<VisualizerMode, string> = {
  waveform: "Плавная волна",
  spectrum: "Частотный спектр",
  bars: "Ритм-бары",
  matrix: "LED-матрица",
  ribbon: "Жидкая лента",
  particles: "Звездная пыль",
  circular: "Радиальный радар",
  blob: "Плазменная сфера",
  strings: "Резонанс струн",
};

export const THEME_LABELS: Record<VisualizerTheme, string> = {
  accent: "Тема плеера",
  pastel: "Пастельная аура",
  neon: "Кибернеон",
  sunset: "Огненный закат",
  aurora: "Северное сияние",
  ocean: "Глубокий океан",
  crimson: "Малиновый",
  mint: "Мятная волна",
  violet: "Ультрафиолет",
  gold: "Золотой песок",
};

export const PLACEMENT_LABELS: Record<string, string> = {
  above_timeline: "Над таймлайном",
  inside_timeline: "В таймлайне",
  toolbar: "В панели кнопок",
  off: "Отключен",
};

export const PLACEMENT_ITEMS = [
  { id: "above_timeline" as const, label: "Над таймлайном", desc: "Панорамная волна" },
  { id: "inside_timeline" as const, label: "В таймлайне", desc: "SoundCloud стиль" },
  { id: "toolbar" as const, label: "В панели кнопок", desc: "Компактный виджет" },
];

export const MODE_ITEMS = [
  { id: "waveform" as const, label: "Плавная волна", desc: "Waveform Безье" },
  { id: "spectrum" as const, label: "Частотный спектр", desc: "Спектр с пиками" },
  { id: "bars" as const, label: "Ритм-бары", desc: "Капсулы эквалайзера" },
  { id: "matrix" as const, label: "LED-матрица", desc: "Диодные столбики" },
  { id: "ribbon" as const, label: "Жидкая лента", desc: "Шелковая волна" },
  { id: "particles" as const, label: "Звездная пыль", desc: "Салют аудио-частиц" },
  { id: "circular" as const, label: "Радиальный радар", desc: "Кольцевой пульсар" },
  { id: "blob" as const, label: "Плазменная сфера", desc: "Органическая капля" },
  { id: "strings" as const, label: "Резонанс струн", desc: "3 осциллографа" },
];

export const THEME_ITEMS = [
  { id: "accent" as const, label: "Тема плеера", desc: "Акцент и Glow" },
  { id: "pastel" as const, label: "Пастельная аура", desc: "Лаванда и мята" },
  { id: "neon" as const, label: "Кибернеон", desc: "Бирюза и фуксия" },
  { id: "sunset" as const, label: "Огненный закат", desc: "Янтарь и рубин" },
  { id: "aurora" as const, label: "Северное сияние", desc: "Изумруд и бирюза" },
  { id: "ocean" as const, label: "Глубокий океан", desc: "Синева и глубина" },
  { id: "crimson" as const, label: "Малиновый", desc: "Рубин и роза" },
  { id: "mint" as const, label: "Мятная волна", desc: "Мята и теал" },
  { id: "violet" as const, label: "Ультрафиолет", desc: "Фиолет и маджента" },
  { id: "gold" as const, label: "Золотой песок", desc: "Золото и янтарь" },
];

/** Градиент-индикатор палитры для кнопок выбора темы. */
export const THEME_SWATCH: Record<VisualizerTheme, string> = {
  accent: "var(--accent)",
  pastel: "linear-gradient(135deg, #c4b5fd 0%, #6ee7b7 55%, #fbcfe8 100%)",
  neon: "linear-gradient(135deg, #00E5FF 0%, #FF2A5F 55%, #FFE600 100%)",
  sunset: "linear-gradient(135deg, #FFB300 0%, #FF5722 55%, #E91E63 100%)",
  aurora: "linear-gradient(135deg, #00F5D4 0%, #00BB77 55%, #0077B6 100%)",
  ocean: "linear-gradient(135deg, #38BDF8 0%, #0EA5E9 55%, #6366F1 100%)",
  crimson: "linear-gradient(135deg, #FB7185 0%, #E11D48 55%, #881337 100%)",
  mint: "linear-gradient(135deg, #5EEAD4 0%, #10B981 55%, #065F46 100%)",
  violet: "linear-gradient(135deg, #A78BFA 0%, #8B5CF6 55%, #5B21B6 100%)",
  gold: "linear-gradient(135deg, #FDE68A 0%, #F59E0B 55%, #92400E 100%)",
};
