/** Параметры координатной сетки SVG-шкалы громкости. */
export const RULER_GEOMETRY = {
  viewBoxWidth: 480,
  viewBoxHeight: 30,
  startX: 9,
  trackWidth: 462,
  tickCount: 31,
  maxVolume: 150,
  nominalVolume: 100,
  midVolume: 50,
  baseY: 21,
} as const;

export const RULER_NOMINAL_X =
  RULER_GEOMETRY.startX +
  RULER_GEOMETRY.trackWidth * (RULER_GEOMETRY.nominalVolume / RULER_GEOMETRY.maxVolume);

export const RULER_BOOST_WIDTH = RULER_GEOMETRY.trackWidth - (RULER_NOMINAL_X - RULER_GEOMETRY.startX);

/** Позиции числовых меток в процентах ширины шкалы (вычисляются из сетки). */
export const RULER_MARK_POSITIONS = {
  mid: `${
    ((RULER_GEOMETRY.startX +
      RULER_GEOMETRY.trackWidth * (RULER_GEOMETRY.midVolume / RULER_GEOMETRY.maxVolume)) /
      RULER_GEOMETRY.viewBoxWidth) *
    100
  }%`,
  nominal: `${(RULER_NOMINAL_X / RULER_GEOMETRY.viewBoxWidth) * 100}%`,
} as const;

export interface TickGeometry {
  level: number;
  x: number;
  isMajor: boolean;
}

export const TICK_GEOMETRY: TickGeometry[] = Array.from(
  { length: RULER_GEOMETRY.tickCount },
  (_, index) => {
    const level = index * 5;
    const centerX = Math.round(
      RULER_GEOMETRY.startX + (RULER_GEOMETRY.trackWidth * index) / (RULER_GEOMETRY.tickCount - 1)
    );
    return {
      level,
      x: centerX - 1,
      isMajor: level % 50 === 0,
    };
  }
);

export interface RulerRenderTargets {
  shadowGroup: SVGGElement | null;
  fgGroup: SVGGElement | null;
  railNormalFill: SVGRectElement | null;
  railBoostFill: SVGRectElement | null;
  needleGroup: SVGGElement | null;
  needleBody: SVGRectElement | null;
}

function getTickAppearance(level: number, volume: number, wave: number): { fill: string; opacity: string } {
  const passed = level <= volume + 0.2 && volume > 0;
  if (level > RULER_GEOMETRY.nominalVolume) {
    const boostFactor = (level - RULER_GEOMETRY.nominalVolume) / 50;
    const g = Math.round(191 - 78 * boostFactor);
    const b = Math.round(36 + 97 * boostFactor);
    return {
      fill: `rgb(251, ${g}, ${b})`,
      opacity: (passed ? 0.90 + wave * 0.10 : 0.50 + wave * 0.30).toFixed(2),
    };
  }
  if (passed) {
    const accentPct = Math.round(Math.min(1, wave * 1.15) * 100);
    return {
      fill: accentPct > 0 ? `color-mix(in srgb, var(--accent) ${accentPct}%, #ffffff)` : "#ffffff",
      opacity: (0.84 + wave * 0.16).toFixed(2),
    };
  }
  return {
    fill: "#ffffff",
    opacity: Math.min(0.92, 0.44 + wave * 0.42).toFixed(2),
  };
}

/** Синхронно обновляет геометрию и цвет всех элементов шкалы для текущего кадра. */
export function paintVolumeRuler(targets: RulerRenderTargets, v: number): void {
  const { startX, trackWidth, maxVolume, nominalVolume, baseY } = RULER_GEOMETRY;
  const isMuted = v < 0.5;
  const isBoost = v > nominalVolume + 0.2;

  if (targets.railNormalFill) {
    const normalRatio = Math.min(nominalVolume, v) / maxVolume;
    targets.railNormalFill.setAttribute("width", Math.max(0, trackWidth * normalRatio).toFixed(2));
  }

  if (targets.railBoostFill) {
    const boostWidth = v > nominalVolume ? trackWidth * ((v - nominalVolume) / maxVolume) : 0;
    targets.railBoostFill.setAttribute("width", Math.max(0, boostWidth).toFixed(2));
  }

  if (targets.needleGroup) {
    const cursorX = startX + trackWidth * (v / maxVolume);
    targets.needleGroup.setAttribute("transform", `translate(${cursorX.toFixed(2)}, 0)`);
  }

  if (targets.needleBody) {
    targets.needleBody.setAttribute(
      "fill",
      isMuted ? "#94a3b8" : isBoost ? "#f59e0b" : "var(--accent)"
    );
  }

  const fgRects = targets.fgGroup?.children;
  const shadowRects = targets.shadowGroup?.children;
  if (!fgRects || !shadowRects) return;

  for (let i = 0; i < TICK_GEOMETRY.length; i++) {
    const t = TICK_GEOMETRY[i];
    const fg = fgRects[i];
    const shadow = shadowRects[i];
    if (!fg || !shadow) continue;

    const dist = Math.abs(t.level - v);
    const wave = Math.exp(-(dist * dist) / 260);
    const baseH = t.isMajor ? 10 : 5.5;
    const h = baseH + wave * (t.isMajor ? 5.5 : 7);
    const y = baseY - h;

    fg.setAttribute("y", y.toFixed(2));
    fg.setAttribute("height", h.toFixed(2));
    shadow.setAttribute("y", (y - 0.5).toFixed(2));
    shadow.setAttribute("height", (h + 1.2).toFixed(2));

    const { fill, opacity } = getTickAppearance(t.level, v, wave);
    fg.setAttribute("fill", fill);
    fg.setAttribute("opacity", opacity);
  }
}
