export type AmbientMode = "off" | "blur" | "color";

export interface AmbientSettings {
  mode: AmbientMode;
  blur_radius: number;
  color: string;
  brightness: number;
  saturation: number;
}

export interface AmbientPresetSettings {
  mode: AmbientMode;
  blur_radius: number;
  color: string;
  brightness?: number;
  saturation?: number;
}

export const DEFAULT_AMBIENT_SETTINGS: AmbientSettings = {
  mode: "off",
  blur_radius: 100,
  color: "#7fc7ff",
  brightness: 100,
  saturation: 100,
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readMode(value: unknown): AmbientMode {
  return value === "blur" || value === "color" ? value : "off";
}

function readColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : DEFAULT_AMBIENT_SETTINGS.color;
}

export function createDefaultAmbientSettings(): AmbientSettings {
  return {
    ...DEFAULT_AMBIENT_SETTINGS,
  };
}

export function normalizeAmbientSettings(value: unknown): AmbientSettings {
  const source = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const brightness = readNumber(source.brightness, DEFAULT_AMBIENT_SETTINGS.brightness);
  return {
    mode: readMode(source.mode),
    blur_radius: Math.round(clamp(readNumber(source.blur_radius, DEFAULT_AMBIENT_SETTINGS.blur_radius), 5, 150, DEFAULT_AMBIENT_SETTINGS.blur_radius)),
    color: readColor(source.color),
    brightness: brightness === 0 ? DEFAULT_AMBIENT_SETTINGS.brightness : Math.round(clamp(brightness, 20, 150, DEFAULT_AMBIENT_SETTINGS.brightness)),
    saturation: Math.round(clamp(readNumber(source.saturation, DEFAULT_AMBIENT_SETTINGS.saturation), 0, 150, DEFAULT_AMBIENT_SETTINGS.saturation)),
  };
}
