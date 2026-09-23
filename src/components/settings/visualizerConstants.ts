import { VisualizerMode, VisualizerTheme } from "../AudioVisualizer";

export const MODE_LABELS: Record<VisualizerMode, string> = {
  waveform: "Waveform",
  spectrum: "Frequency Spectrum",
  bars: "Rhythm Bars",
  matrix: "LED Matrix",
  ribbon: "Liquid Ribbon",
  particles: "Star Dust",
  circular: "Radial Radar",
  blob: "Plasma Sphere",
  strings: "String Resonance",
};

export const THEME_LABELS: Record<VisualizerTheme, string> = {
  accent: "Player Theme",
  pastel: "Pastel Aura",
  neon: "Cyber Neon",
  sunset: "Fiery Sunset",
  aurora: "Northern Lights",
  ocean: "Deep Ocean",
  crimson: "Crimson",
  mint: "Mint Wave",
  violet: "Ultraviolet",
  gold: "Golden Sand",
};

export const PLACEMENT_LABELS: Record<string, string> = {
  above_timeline: "Above timeline",
  inside_timeline: "Inside timeline",
  toolbar: "In toolbar",
  off: "Disabled",
};

export const PLACEMENT_ITEMS = [
  { id: "above_timeline" as const, label: "Above timeline", desc: "Panoramic wave" },
  { id: "inside_timeline" as const, label: "Inside timeline", desc: "SoundCloud style" },
  { id: "toolbar" as const, label: "In toolbar", desc: "Compact widget" },
];

export const MODE_ITEMS = [
  { id: "waveform" as const, label: "Waveform", desc: "Bezier waveform" },
  { id: "spectrum" as const, label: "Frequency Spectrum", desc: "Spectrum with peaks" },
  { id: "bars" as const, label: "Rhythm Bars", desc: "Equalizer capsules" },
  { id: "matrix" as const, label: "LED Matrix", desc: "Diode columns" },
  { id: "ribbon" as const, label: "Liquid Ribbon", desc: "Silk wave" },
  { id: "particles" as const, label: "Star Dust", desc: "Audio particle salute" },
  { id: "circular" as const, label: "Radial Radar", desc: "Ring pulsar" },
  { id: "blob" as const, label: "Plasma Sphere", desc: "Organic blob" },
  { id: "strings" as const, label: "String Resonance", desc: "3 oscilloscopes" },
];

export const THEME_ITEMS = [
  { id: "accent" as const, label: "Player Theme", desc: "Accent & Glow" },
  { id: "pastel" as const, label: "Pastel Aura", desc: "Lavender & Mint" },
  { id: "neon" as const, label: "Cyber Neon", desc: "Cyan & Fuchsia" },
  { id: "sunset" as const, label: "Fiery Sunset", desc: "Amber & Ruby" },
  { id: "aurora" as const, label: "Northern Lights", desc: "Emerald & Turquoise" },
  { id: "ocean" as const, label: "Deep Ocean", desc: "Blue & Depth" },
  { id: "crimson" as const, label: "Crimson", desc: "Ruby & Rose" },
  { id: "mint" as const, label: "Mint Wave", desc: "Mint & Teal" },
  { id: "violet" as const, label: "Ultraviolet", desc: "Violet & Magenta" },
  { id: "gold" as const, label: "Golden Sand", desc: "Gold & Amber" },
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
