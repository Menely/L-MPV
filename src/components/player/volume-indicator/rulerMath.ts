/** Параметры координатной сетки SVG-шкалы громкости (масштаб 1:1 на 500px, шаг рисок 16px). */
export const RULER_GEOMETRY = {
  viewBoxWidth: 500,
  viewBoxHeight: 30,
  startX: 10,
  trackWidth: 480,
  tickCount: 31,
  maxVolume: 150,
  nominalVolume: 100,
  midVolume: 50,
  baseY: 21,
} as const;

export const RULER_NOMINAL_X =
  RULER_GEOMETRY.startX +
  RULER_GEOMETRY.trackWidth * (RULER_GEOMETRY.nominalVolume / RULER_GEOMETRY.maxVolume);

/** Границы нормальной и boost-дорожки с чистым микро-разрывом 2px в центре 100%. */
export const RULER_NORMAL_WIDTH = RULER_NOMINAL_X - RULER_GEOMETRY.startX - 1;
export const RULER_BOOST_START_X = RULER_NOMINAL_X + 1;
export const RULER_BOOST_WIDTH =
  RULER_GEOMETRY.startX + RULER_GEOMETRY.trackWidth - RULER_BOOST_START_X;

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
  width: number;
  rx: number;
  isMajor: boolean;
  isQuarter: boolean;
}

export const TICK_GEOMETRY: TickGeometry[] = Array.from(
  { length: RULER_GEOMETRY.tickCount },
  (_, index) => {
    const level = index * 5;
    const centerX = Math.round(
      RULER_GEOMETRY.startX + (RULER_GEOMETRY.trackWidth * index) / (RULER_GEOMETRY.tickCount - 1)
    );
    const isMajor = level % 50 === 0;
    const width = isMajor ? 3 : 2.4;
    return {
      level,
      x: Number((centerX - width / 2).toFixed(2)),
      width,
      rx: Number((width / 2).toFixed(2)),
      isMajor,
      isQuarter: !isMajor && level % 25 === 0,
    };
  }
);

export interface RulerRenderTargets {
  shadowGroup: SVGGElement | null;
  fgGroup: SVGGElement | null;
  railNormalFill: SVGRectElement | null;
  railBoostFill: SVGRectElement | null;
  needleGroup: SVGGElement | null;
  needleHalo: SVGRectElement | null;
  needleBody: SVGRectElement | null;
}

function getTickAppearance(
  t: TickGeometry,
  volume: number,
  wave: number
): { fill: string; opacity: number } {
  const passed = t.level <= volume + 0.2 && volume > 0;
  if (t.level > RULER_GEOMETRY.nominalVolume) {
    const boostFactor = (t.level - RULER_GEOMETRY.nominalVolume) / 50;
    const g = Math.round(186 - 78 * boostFactor);
    const b = Math.round(32 + 98 * boostFactor);
    return {
      fill: `rgb(251, ${g}, ${b})`,
      opacity: 1,
    };
  }
  if (passed) {
    const accentPct = Math.round(Math.min(1, wave * 1.15) * 100);
    return {
      fill: accentPct > 0 ? `color-mix(in srgb, var(--accent) ${accentPct}%, #ffffff)` : "#ffffff",
      opacity: 1,
    };
  }
  return {
    fill: "#dce2eb",
    opacity: 1,
  };
}

/** Цвет зоны усиления (100–150%): линейный переход от #f59e0b к #fb7185, как на линии. */
export function getBoostColor(volume: number): string {
  const t = Math.max(0, Math.min(1, (volume - RULER_GEOMETRY.nominalVolume) / 50));
  const r = Math.round(245 + (251 - 245) * t);
  const g = Math.round(158 + (113 - 158) * t);
  const b = Math.round(11 + (133 - 11) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Синхронно обновляет геометрию и цвет всех элементов шкалы для текущего кадра. */
export function paintVolumeRuler(targets: RulerRenderTargets, v: number): void {
  const { startX, trackWidth, maxVolume, nominalVolume, baseY } = RULER_GEOMETRY;
  const isMuted = v < 0.5;
  const isBoost = v > nominalVolume + 0.2;

  if (targets.railNormalFill) {
    const normalRatio = Math.min(nominalVolume, v) / nominalVolume;
    targets.railNormalFill.setAttribute(
      "width",
      Math.max(0, RULER_NORMAL_WIDTH * normalRatio).toFixed(2)
    );
  }

  if (targets.railBoostFill) {
    const boostRatio = v > nominalVolume ? (v - nominalVolume) / 50 : 0;
    targets.railBoostFill.setAttribute(
      "width",
      Math.max(0, RULER_BOOST_WIDTH * boostRatio).toFixed(2)
    );
  }

  if (targets.needleGroup) {
    const cursorX = startX + trackWidth * (v / maxVolume);
    targets.needleGroup.setAttribute("transform", `translate(${cursorX.toFixed(2)}, 0)`);
  }

  const activeColor = isMuted ? "#94a3b8" : isBoost ? getBoostColor(v) : "var(--accent)";
  if (targets.needleBody) {
    targets.needleBody.setAttribute("fill", activeColor);
  }
  if (targets.needleHalo) {
    targets.needleHalo.setAttribute("fill", activeColor);
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
    const baseH = t.isMajor ? 11.5 : t.isQuarter ? 8.5 : 5.8;
    const h = baseH + wave * (t.isMajor ? 5.5 : 6.5);
    const y = baseY - h;

    fg.setAttribute("y", y.toFixed(2));
    fg.setAttribute("height", h.toFixed(2));
    shadow.setAttribute("y", (y + 1).toFixed(2));
    shadow.setAttribute("height", h.toFixed(2));

    const { fill, opacity } = getTickAppearance(t, v, wave);
    fg.setAttribute("fill", fill);
    fg.setAttribute("opacity", opacity.toFixed(2));
    shadow.setAttribute("opacity", (opacity * 0.52).toFixed(2));
  }
}
