export const PASTEL_PRESETS = [
  "#7fc7ff", // 1. Original Soft Blue (Default)
  "#e8a236", // 2. Warm Amber / Gold
  "#FFA9DE", // 3. Vibrant Pink / Magenta
  "#ffd1dc", // 4. Pastel Pink
  "#bdfcc9", // 5. Pastel Mint
  "#fff5ba", // 6. Pastel Yellow
  "#e6c9ff", // 7. Pastel Purple / Lilac
  "#ffdfba", // 8. Pastel Peach
  "#c6e2e9", // 9. Pastel Ice Blue
  "#f4d6cc", // 10. Pastel Rose
  "#d4f0f0", // 11. Pastel Aqua
  "#e3e8f8", // 12. Pastel Lavender
];

// ─── 2. Сочные однотонные цвета ───
export const VIBRANT_PRESETS = [
  "#00FF9D", // Cyber Emerald / Neon Green
  "#00E5FF", // Cyber Cyan / Electric Blue
  "#3B82F6", // Deep Royal Blue
  "#8B5CF6", // Electric Violet
  "#D946EF", // Vivid Fuchsia
  "#FF2A5F", // Crimson / Neon Red
  "#FF5722", // Electric Orange
  "#FFB300", // Bright Sun / Amber
  "#A3E635", // Lime Punch
  "#14B8A6", // Rich Teal
];

export interface GradientPreset {
  id: string;
  name: string;
  gradient: string;
  baseColor: string; // Основной цвет для теней и fallback
}

// ─── 3. Многоцветные градиенты ───
export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    id: "grad-cyber-punk",
    name: "Cyberpunk (Неон)",
    gradient: "linear-gradient(90deg, #FF007F 0%, #00F0FF 100%)",
    baseColor: "#FF007F",
  },
  {
    id: "grad-fire",
    name: "Огонь (Пламя)",
    gradient: "linear-gradient(90deg, #FF1361 0%, #FFF800 100%)",
    baseColor: "#FF1361",
  },
  {
    id: "grad-purple-pink",
    name: "Неоновый закат",
    gradient: "linear-gradient(90deg, #7928CA 0%, #FF0080 100%)",
    baseColor: "#FF0080",
  },
  {
    id: "grad-ocean",
    name: "Океанская волна",
    gradient: "linear-gradient(90deg, #0052D4 0%, #4364F7 50%, #00F2FE 100%)",
    baseColor: "#0052D4",
  },
  {
    id: "grad-emerald-gold",
    name: "Изумруд и Золото",
    gradient: "linear-gradient(90deg, #0BA360 0%, #3CBA92 50%, #FFD200 100%)",
    baseColor: "#0BA360",
  },
  {
    id: "grad-mango",
    name: "Манго / Персик",
    gradient: "linear-gradient(90deg, #FA709A 0%, #FEE140 100%)",
    baseColor: "#FA709A",
  },
  {
    id: "grad-deep-space",
    name: "Глубокий Космос",
    gradient: "linear-gradient(90deg, #8E2DE2 0%, #4A00E0 50%, #F000FF 100%)",
    baseColor: "#8E2DE2",
  },
  {
    id: "grad-toxic",
    name: "Токсичный неон",
    gradient: "linear-gradient(90deg, #00F260 0%, #0575E6 100%)",
    baseColor: "#00F260",
  },
];

// Преобразование HEX в RGB
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Изменение яркости цвета (percent от -100 до 100)
export function adjustBrightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  let { r, g, b } = rgb;

  r = Math.floor(r * (1 + percent / 100));
  g = Math.floor(g * (1 + percent / 100));
  b = Math.floor(b * (1 + percent / 100));

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Применение нового акцентного цвета или градиента
export function applyAccentColor(value: string) {
  const root = document.documentElement;
  
  // Проверяем, не является ли значение градиентом
  const gradPreset = GRADIENT_PRESETS.find(
    (g) => g.id === value || g.gradient === value
  );

  if (gradPreset) {
    const baseHex = gradPreset.baseColor;
    const hover = adjustBrightness(baseHex, 15);
    const dim = adjustBrightness(baseHex, -25);
    const dark = adjustBrightness(baseHex, -45);
    const rgb = hexToRgb(baseHex);

    if (rgb) {
      const rgbString = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
      root.style.setProperty("--accent-glow", `rgba(${rgbString}, 0.35)`);
      root.style.setProperty("--accent-glass", `rgba(${rgbString}, 0.10)`);
      root.style.setProperty("--border-pill", `rgba(${rgbString}, 0.15)`);
      root.style.setProperty("--bg-hover", `rgba(${rgbString}, 0.10)`);
      root.style.setProperty("--bg-active", `rgba(${rgbString}, 0.18)`);
    }

    root.style.setProperty("--accent", baseHex);
    root.style.setProperty("--accent-gradient", gradPreset.gradient);
    root.style.setProperty("--accent-hover", hover);
    root.style.setProperty("--accent-dim", dim);
    root.style.setProperty("--accent-dark", dark);
    return;
  }

  // Однотонный цвет (HEX)
  const hex = value.startsWith("#") ? value : "#7fc7ff";
  const hover = adjustBrightness(hex, 15);
  const dim = adjustBrightness(hex, -25);
  const dark = adjustBrightness(hex, -45);

  const rgb = hexToRgb(hex);
  if (rgb) {
    const rgbString = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
    root.style.setProperty("--accent-glow", `rgba(${rgbString}, 0.30)`);
    root.style.setProperty("--accent-glass", `rgba(${rgbString}, 0.08)`);
    root.style.setProperty("--border-pill", `rgba(${rgbString}, 0.10)`);
    root.style.setProperty("--bg-hover", `rgba(${rgbString}, 0.08)`);
    root.style.setProperty("--bg-active", `rgba(${rgbString}, 0.14)`);
  }

  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-gradient", `linear-gradient(90deg, ${hex}, ${hex})`);
  root.style.setProperty("--accent-hover", hover);
  root.style.setProperty("--accent-dim", dim);
  root.style.setProperty("--accent-dark", dark);
}
