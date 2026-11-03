/** Pure sRGB/OKLCH utilities shared by theme generation and contrast checks. */
export type Rgb = [number, number, number];

export function normalizeHex(value: string): string | null {
  if (/^#[\da-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(value)) return `#${value.slice(1).split("").map(c => c + c).join("")}`.toLowerCase();
  return null;
}

export function colorRgb(hex: string): Rgb {
  const value = normalizeHex(hex) || "#7fc7ff";
  return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)) as Rgb;
}

export function colorHex(rgb: Rgb): string {
  return `#${rgb.map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;
}

export function mixColor(base: string, tint: string, amount: number): string {
  const a = colorRgb(base), b = colorRgb(tint), t = Math.max(0, Math.min(1, amount));
  return colorHex(a.map((v, i) => v + (b[i] - v) * t) as Rgb);
}

const linear = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const encoded = (v: number) => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;

export function contrastRatio(a: string, b: string): number {
  const luminance = (c: string) => colorRgb(c).map(v => linear(v / 255)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function toOklch(hex: string): [number, number, number] {
  const [r, g, b] = colorRgb(hex).map(v => linear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

export function colorAppearance(hex: string) {
  const [lightness, chroma, hue] = toOklch(hex);
  return { lightness, chroma, hue: (hue * 180 / Math.PI + 360) % 360 };
}

/** Preserve hue, reducing chroma only when the new tone falls outside sRGB. */
export function shiftLightness(hex: string, delta: number): string {
  const [oldL, oldC, h] = toOklch(hex);
  return fromOklch(oldL + delta, oldC, h);
}

function fromOklch(lightness: number, chroma: number, h: number): string {
  const L = Math.max(0, Math.min(1, lightness));
  const convert = (C: number): Rgb => {
    const a = C * Math.cos(h), b = C * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  };
  const inGamut = (v: Rgb) => v.every(c => c >= -0.000001 && c <= 1.000001);
  let C = Math.max(0, chroma);
  if (!inGamut(convert(C))) {
    let low = 0, high = C;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      if (inGamut(convert(mid))) low = mid; else high = mid;
    }
    C = low;
  }
  return colorHex(convert(C).map(v => encoded(v) * 255) as Rgb);
}

/** Mix perceptual coordinates; hue remains meaningful near neutral surfaces. */
function mixOklab(base: string, tint: string, amount: number): [number, number, number] {
  const [l1, c1, h1] = toOklch(base), [l2, c2, h2] = toOklch(tint);
  const a = c1 * Math.cos(h1) * (1 - amount) + c2 * Math.cos(h2) * amount;
  const b = c1 * Math.sin(h1) * (1 - amount) + c2 * Math.sin(h2) * amount;
  return [l1 + (l2 - l1) * amount, Math.hypot(a, b), Math.atan2(b, a)];
}

export function readableColor(color: string, backgrounds: string[], minimum = 4.5): string {
  const source = normalizeHex(color) || "#7fc7ff";
  const passes = (candidate: string) => backgrounds.every(bg => contrastRatio(candidate, bg) >= minimum);
  if (passes(source)) return source;
  const [L] = toOklch(source);
  for (let i = 1; i <= 100; i++) {
    const candidate = shiftLightness(source, (1 - L) * i / 100);
    if (passes(candidate)) return candidate;
  }
  return "#ffffff";
}

export function onColor(background: string): string {
  if (contrastRatio("#101216", background) >= 4.5) return "#101216";
  if (contrastRatio("#ffffff", background) >= 4.5) return "#ffffff";
  return "#000000";
}

/** Five bounded surface tones: depth changes lightness, not accumulated opacity. */
export function buildThemeRoles(surface: string, glassRgb: string, accent: string) {
  const glass = colorHex(glassRgb.split(",").map(Number) as Rgb);
  const [baseL] = toOklch(glass);
  const [, tintC, tintH] = mixOklab(glass, accent, 0.045);
  const levels = Array.from({ length: 5 }, (_, depth) => depth === 0 ? glass
    : fromOklch(Math.min(0.52, baseL + depth * 0.032), Math.min(tintC, 0.06), tintH));
  const hoverLevels = levels.map(color => shiftLightness(color, 0.018));
  const insetLevels = levels.map(color => shiftLightness(color, -0.018));
  const selectedTone = (color: string, delta: number) => {
    const [L] = toOklch(color), [, C, h] = mixOklab(color, accent, 0.16);
    return fromOklch(L + delta, Math.min(C, 0.085), h);
  };
  const selectedLevels = levels.map(color => selectedTone(color, 0.025));
  const selectedHoverLevels = levels.map(color => selectedTone(color, 0.040));
  const elevated = levels[1];
  const brightestGlass = mixColor("#ffffff", elevated, 0.88);
  const backgrounds = [surface, brightestGlass, ...levels, ...hoverLevels, ...selectedHoverLevels];
  return {
    elevated, backgrounds, levels, hoverLevels, insetLevels, selectedLevels, selectedHoverLevels,
    primary: readableColor("#e8ebf0", backgrounds, 7),
    secondary: readableColor("#b8c2cf", backgrounds, 5.5),
    muted: readableColor("#9da8b7", backgrounds, 4.5),
    accentText: readableColor(accent, backgrounds, 4.5),
  };
}
