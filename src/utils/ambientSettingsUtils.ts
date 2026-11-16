export type AmbientMode = "off" | "blur";

export interface AmbientSettings {
  mode: AmbientMode;
  blur_radius: number;
}

export interface AmbientPresetSettings {
  mode: AmbientMode;
  blur_radius: number;
}

export const DEFAULT_AMBIENT_SETTINGS: AmbientSettings = {
  mode: "off",
  blur_radius: 100,
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readMode(value: unknown): AmbientMode {
  return value === "blur" ? value : "off";
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
  return {
    mode: readMode(source.mode),
    blur_radius: Math.round(clamp(readNumber(source.blur_radius, DEFAULT_AMBIENT_SETTINGS.blur_radius), 5, 150, DEFAULT_AMBIENT_SETTINGS.blur_radius)),
  };
}
