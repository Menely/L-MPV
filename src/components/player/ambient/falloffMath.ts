/**
 * @file falloffMath.ts
 * @description Математическое ядро расчёта затухания света, перцептивной
 * коррекции (sRGB), угловых переходов и шумового сглаживания бандинга
 * для режима подсветки AmbiLight.
 */

import type { AmbientLayout } from "../../../utils/ambientSettingsUtils";

/** Максимальный размер буфера маски по большей стороне для чёткого билинейного сглаживания. */
export const MAX_MASK_DIMENSION = 960;

/** Размер предрасчитанной таблицы (LUT) кривой затухания света. */
export const FALLOFF_LUT_SIZE = 2048;

/** Обратная гамма для перцептивной калибровки альфа-канала маски в sRGB. */
export const INV_PERCEPTUAL_GAMMA = 1 / 2.2;

/** Порог в пикселях для отсечения субпиксельных погрешностей границ кадра. */
export const MIN_BAR_THRESHOLD_PX = 2;

/** Минимальное остаточное пропускание света в sRGB (10% свечения, 90% максимальной черноты). */
export const AMBIENT_RESIDUAL_TRANSMITTANCE = 0.10;

/**
 * Ограничение числа заданным интервалом [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Гладкая квинтическая интерполяция (C²-непрерывная) на отрезке [0, 1].
 * Нулевые первая и вторая производная на концах исключают полосы Маха.
 */
export function smootherstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (6 * x - 15) + 10);
}

/**
 * Кубический smoothstep на произвольном отрезке [edge0, edge1].
 */
export function smoothstepRange(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  if (span <= 0) {
    return x >= edge1 ? 1 : 0;
  }
  const t = clamp((x - edge0) / span, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Высокочастотный псевдосиний шум (Interleaved Gradient Noise)
 * для подавления 8-битного бандинга без регулярных сеток.
 */
export function interleavedGradientNoise(x: number, y: number): number {
  const dot = (0.06711056 * x + 0.00583715 * y) % 1;
  const f = 52.9829189 * dot;
  return f - Math.floor(f);
}

/**
 * Вычисляет размеры буфера Canvas в пропорциях текущего видеоокна,
 * обеспечивая физически квадратные тексели и быструю отрисовку.
 */
export function computeMaskBufferSize(
  layoutWidth: number,
  layoutHeight: number,
): { width: number; height: number } {
  if (
    !Number.isFinite(layoutWidth) ||
    !Number.isFinite(layoutHeight) ||
    layoutWidth <= 0 ||
    layoutHeight <= 0
  ) {
    return { width: 512, height: 512 };
  }
  const scale = Math.min(1, MAX_MASK_DIMENSION / Math.max(layoutWidth, layoutHeight));
  return {
    width: Math.max(64, Math.round(layoutWidth * scale)),
    height: Math.max(64, Math.round(layoutHeight * scale)),
  };
}

/**
 * Формирует LUT-таблицу коэффициентов пропускания света sRGB [0..1]
 * по нормализованному расстоянию d ∈ [0, 1].
 */
export function buildTransmittanceLut(fade: number, applyHdrDim: boolean): Float32Array {
  const lut = new Float32Array(FALLOFF_LUT_SIZE);
  const fadeNorm = clamp(fade / 100, 0, 1);
  // При fade=100 кривая максимально широкая и воздушная (k=0.85), при fade=0 — сфокусированная (k=5.05)
  const baseDecay = 0.85 + Math.pow(1 - fadeNorm, 1.35) * 4.2;
  const decayK = applyHdrDim ? baseDecay + 0.9 : baseDecay;
  const minFloor = applyHdrDim
    ? AMBIENT_RESIDUAL_TRANSMITTANCE * 0.8
    : AMBIENT_RESIDUAL_TRANSMITTANCE;

  for (let i = 0; i < FALLOFF_LUT_SIZE; i++) {
    const d = i / (FALLOFF_LUT_SIZE - 1);
    const window = 1 - smootherstep(d);
    let perceived = window * Math.exp(-decayK * Math.pow(d, 1.75));

    // Равномерное мягкое приглушение яркости по всей глубине полосы для HDR без тени у края
    if (applyHdrDim) {
      perceived *= 1 - 0.2 * smootherstep(d);
    }

    const baseTransmittance = perceived > 0 ? Math.pow(perceived, INV_PERCEPTUAL_GAMMA) : 0;
    lut[i] = minFloor + (1 - minFloor) * baseTransmittance;
  }

  lut[0] = 1;
  lut[FALLOFF_LUT_SIZE - 1] = minFloor;
  return lut;
}

/**
 * Вычисляет угловой вес направления подсветки с мягким растушёвыванием диагоналей.
 */
export function computeDirectionWeight(
  dx: number,
  dy: number,
  hOn: boolean,
  vOn: boolean,
): number {
  if (!hOn && !vOn) {
    return 0;
  }
  if (dx <= 0) {
    return vOn ? 1 : 0;
  }
  if (dy <= 0) {
    return hOn ? 1 : 0;
  }
  if (hOn && vOn) {
    return 1;
  }
  // Плавный переход по углу вокруг диагонали вместо резкого треугольного среза
  const ratio = dy / (dx + dy);
  const blend = smoothstepRange(0.25, 0.75, ratio);
  return vOn ? blend : 1 - blend;
}

/**
 * Проверяет наличие видимых чёрных полос вокруг кадра (>= 2 px).
 */
export function hasVisibleBars(layout: AmbientLayout | null): boolean {
  if (!layout || layout.w <= 0 || layout.h <= 0) {
    return false;
  }
  return (
    layout.mt >= MIN_BAR_THRESHOLD_PX ||
    layout.mb >= MIN_BAR_THRESHOLD_PX ||
    layout.ml >= MIN_BAR_THRESHOLD_PX ||
    layout.mr >= MIN_BAR_THRESHOLD_PX
  );
}

/**
 * Сравнивает два геометрических макета на точное равенство параметров,
 * чтобы исключить холостые перерисовки Canvas.
 */
export function areAmbientLayoutsEqual(
  prev: AmbientLayout | null,
  next: AmbientLayout | null,
): boolean {
  if (prev === next) {
    return true;
  }
  if (!prev || !next) {
    return false;
  }
  return (
    prev.w === next.w &&
    prev.h === next.h &&
    prev.mt === next.mt &&
    prev.mb === next.mb &&
    prev.ml === next.ml &&
    prev.mr === next.mr &&
    prev.isHdr === next.isHdr
  );
}
