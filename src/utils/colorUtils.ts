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

// Применение нового акцентного цвета (генерирует вариации)
export function applyAccentColor(hex: string) {
  const root = document.documentElement;
  
  const hover = adjustBrightness(hex, 15);
  const dim = adjustBrightness(hex, -25);
  const dark = adjustBrightness(hex, -45);

  const rgb = hexToRgb(hex);
  if (rgb) {
    const rgbString = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
    root.style.setProperty("--accent-glow", `rgba(${rgbString}, 0.30)`);
    root.style.setProperty("--accent-glass", `rgba(${rgbString}, 0.08)`);
    root.style.setProperty("--border-pill", `rgba(${rgbString}, 0.10)`);
    
    // Также можно обновить некоторые дополнительные переменные
    root.style.setProperty("--bg-hover", `rgba(${rgbString}, 0.08)`);
    root.style.setProperty("--bg-active", `rgba(${rgbString}, 0.14)`);
  }

  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-hover", hover);
  root.style.setProperty("--accent-dim", dim);
  root.style.setProperty("--accent-dark", dark);
}
