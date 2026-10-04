export type AmbientMode = "off" | "blur" | "ambilight" | "color";

export interface AmbientSettings {
  mode: AmbientMode;
  blur_radius: number;
  color: string;
  brightness: number;
  saturation: number;
  spread: number;
  fade: number;
  debanding: number;
  direction_top: boolean;
  direction_bottom: boolean;
  direction_left: boolean;
  direction_right: boolean;
  hdr_dim: boolean;
}

export interface AmbientLayout {
  w: number;
  h: number;
  mt: number;
  mb: number;
  ml: number;
  mr: number;
  isHdr: boolean;
}

export interface AmbientPresetSettings {
  mode: AmbientMode;
  blur_radius: number;
  color: string;
  brightness?: number;
  saturation?: number;
  spread?: number;
  fade?: number;
  debanding?: number;
  direction_top?: boolean;
  direction_bottom?: boolean;
  direction_left?: boolean;
  direction_right?: boolean;
  hdr_dim?: boolean;
}

export const DEFAULT_AMBIENT_SETTINGS: AmbientSettings = {
  mode: "off",
  blur_radius: 100,
  color: "#7fc7ff",
  brightness: 100,
  saturation: 100,
  spread: 100,
  fade: 100,
  debanding: 40,
  direction_top: true,
  direction_bottom: true,
  direction_left: true,
  direction_right: true,
  hdr_dim: true,
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readMode(value: unknown): AmbientMode {
  return value === "blur" || value === "ambilight" || value === "color"
    ? value
    : "off";
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
    spread: Math.round(clamp(readNumber(source.spread, DEFAULT_AMBIENT_SETTINGS.spread), 10, 100, DEFAULT_AMBIENT_SETTINGS.spread)),
    fade: Math.round(clamp(readNumber(source.fade, DEFAULT_AMBIENT_SETTINGS.fade), 0, 100, DEFAULT_AMBIENT_SETTINGS.fade)),
    debanding: Math.round(clamp(readNumber(source.debanding, DEFAULT_AMBIENT_SETTINGS.debanding), 0, 100, DEFAULT_AMBIENT_SETTINGS.debanding)),
    direction_top: readBoolean(source.direction_top, DEFAULT_AMBIENT_SETTINGS.direction_top),
    direction_bottom: readBoolean(source.direction_bottom, DEFAULT_AMBIENT_SETTINGS.direction_bottom),
    direction_left: readBoolean(source.direction_left, DEFAULT_AMBIENT_SETTINGS.direction_left),
    direction_right: readBoolean(source.direction_right, DEFAULT_AMBIENT_SETTINGS.direction_right),
    hdr_dim: readBoolean(source.hdr_dim, DEFAULT_AMBIENT_SETTINGS.hdr_dim),
  };
}
