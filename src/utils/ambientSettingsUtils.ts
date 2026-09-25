export type AmbientMode = "off" | "blur" | "color" | "ambilight";

export interface AmbientSampleWidths {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AmbientSettings {
  mode: AmbientMode;
  blur_radius: number;
  color: string;
  brightness: number;
  saturation: number;
  segment_count: number;
  sample_widths: AmbientSampleWidths;
  sample_interval_ms: number;
  smoothing_attack_ms: number;
  smoothing_release_ms: number;
  segment_spread: number;
  segment_gap: number;
}

export interface AmbientPresetSettings {
  mode: AmbientMode;
  blur_radius: number;
  color: string;
  brightness?: number;
  saturation?: number;
  segment_count?: number;
  sample_widths?: Partial<AmbientSampleWidths>;
  sample_interval_ms?: number;
  smoothing_attack_ms?: number;
  smoothing_release_ms?: number;
  segment_spread?: number;
  segment_gap?: number;
}

export const DEFAULT_AMBIENT_SETTINGS: AmbientSettings = {
  mode: "off",
  blur_radius: 100,
  color: "#7fc7ff",
  brightness: 100,
  saturation: 100,
  segment_count: 7,
  sample_widths: {
    top: 3,
    right: 3,
    bottom: 3,
    left: 3,
  },
  sample_interval_ms: 100,
  smoothing_attack_ms: 180,
  smoothing_release_ms: 650,
  segment_spread: 130,
  segment_gap: 0,
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readMode(value: unknown): AmbientMode {
  return value === "blur" || value === "color" || value === "ambilight" ? value : "off";
}

function readColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : DEFAULT_AMBIENT_SETTINGS.color;
}

function readWidth(value: unknown, fallback: number): number {
  return Math.round(clamp(readNumber(value, fallback), 1, 15, fallback));
}

export function createDefaultAmbientSettings(): AmbientSettings {
  return {
    ...DEFAULT_AMBIENT_SETTINGS,
    sample_widths: { ...DEFAULT_AMBIENT_SETTINGS.sample_widths },
  };
}

export function normalizeAmbientSettings(value: unknown): AmbientSettings {
  const source = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const widths = source.sample_widths && typeof source.sample_widths === "object"
    ? source.sample_widths as Record<string, unknown>
    : {};
  const brightness = readNumber(source.brightness, DEFAULT_AMBIENT_SETTINGS.brightness);
  return {
    mode: readMode(source.mode),
    blur_radius: Math.round(clamp(readNumber(source.blur_radius, DEFAULT_AMBIENT_SETTINGS.blur_radius), 5, 150, DEFAULT_AMBIENT_SETTINGS.blur_radius)),
    color: readColor(source.color),
    brightness: brightness === 0 ? DEFAULT_AMBIENT_SETTINGS.brightness : Math.round(clamp(brightness, 20, 150, DEFAULT_AMBIENT_SETTINGS.brightness)),
    saturation: Math.round(clamp(readNumber(source.saturation, DEFAULT_AMBIENT_SETTINGS.saturation), 0, 150, DEFAULT_AMBIENT_SETTINGS.saturation)),
    segment_count: Math.round(clamp(readNumber(source.segment_count, DEFAULT_AMBIENT_SETTINGS.segment_count), 3, 16, DEFAULT_AMBIENT_SETTINGS.segment_count)),
    sample_widths: {
      top: readWidth(widths.top, DEFAULT_AMBIENT_SETTINGS.sample_widths.top),
      right: readWidth(widths.right, DEFAULT_AMBIENT_SETTINGS.sample_widths.right),
      bottom: readWidth(widths.bottom, DEFAULT_AMBIENT_SETTINGS.sample_widths.bottom),
      left: readWidth(widths.left, DEFAULT_AMBIENT_SETTINGS.sample_widths.left),
    },
    sample_interval_ms: Math.round(clamp(readNumber(source.sample_interval_ms, DEFAULT_AMBIENT_SETTINGS.sample_interval_ms), 100, 500, DEFAULT_AMBIENT_SETTINGS.sample_interval_ms)),
    smoothing_attack_ms: Math.round(clamp(readNumber(source.smoothing_attack_ms, DEFAULT_AMBIENT_SETTINGS.smoothing_attack_ms), 50, 2000, DEFAULT_AMBIENT_SETTINGS.smoothing_attack_ms)),
    smoothing_release_ms: Math.round(clamp(readNumber(source.smoothing_release_ms, DEFAULT_AMBIENT_SETTINGS.smoothing_release_ms), 100, 5000, DEFAULT_AMBIENT_SETTINGS.smoothing_release_ms)),
    segment_spread: clamp(readNumber(source.segment_spread, DEFAULT_AMBIENT_SETTINGS.segment_spread), 100, 200, DEFAULT_AMBIENT_SETTINGS.segment_spread),
    segment_gap: clamp(readNumber(source.segment_gap, DEFAULT_AMBIENT_SETTINGS.segment_gap), 0, 50, DEFAULT_AMBIENT_SETTINGS.segment_gap),
  };
}
