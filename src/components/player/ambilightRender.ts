/**
 * Математика режима Ambilight: геометрия кадра, профиль затухания и
 * попиксельная сборка свечения.
 *
 * Модуль намеренно не зависит от DOM/React: рендерер отдаёт буфер
 * (`Uint8ClampedArray`), а сглаживание цветов идёт в линейном свете.
 */

export interface AmbientPalette {
  generation: number;
  visible: boolean;
  reset: boolean;
  segment_count: number;
  colors: number[];
  top: number;
  right: number;
  bottom: number;
  left: number;
  spread: number;
  gap: number;
  attack_ms: number;
  release_ms: number;
  osd_width: number;
  osd_height: number;
}

export type Side = 0 | 1 | 2 | 3;

export type CanvasPalette = AmbientPalette;

/** Разрешение расчётного буфера: выше — меньше ступеней квантования. */
export const MAX_GLOW_BUFFER_PIXELS = 960 * 540;
export const MAX_SEGMENTS = 16;
export const MAX_DIMENSION = 1280;
/** Максимальная непрозрачность свечения (полосы mpv чёрные, поэтому это чистый цвет). */
export const GLOW_STRENGTH = 0.94;
/** Доля толщины полосы, на которой достигается пик свечения. */
export const PROFILE_PEAK = 0.16;
/** Экспонента спада к внешнему краю окна. */
export const PROFILE_DECAY = 1.5;

/** Матрица Байера 8×8, нормализованная в диапазон -0.5..0.5. */
export const BAYER_8: Float32Array = (() => {
  const raw = [
    0, 32, 8, 40, 2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37,
    63, 31, 55, 23, 61, 29, 53, 21,
  ];
  return Float32Array.from(raw, (value) => value / 64 - 0.4921875);
})();

export interface SegmentLayout {
  centers: number[];
  sigma: number;
}

export interface FrameRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface BufferFrame {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  topRows: number;
  bottomRows: number;
  leftCols: number;
  rightCols: number;
  width: number;
  height: number;
}

export interface RenderScratch {
  segmentLinear: Float32Array;
  along: Float32Array[];
  fall: Float32Array[];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function createEmptyPalette(segmentCount = 7): CanvasPalette {
  return {
    generation: 0,
    visible: false,
    reset: true,
    segment_count: segmentCount,
    colors: new Array(segmentCount * 4 * 3).fill(0),
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    spread: 130,
    gap: 0,
    attack_ms: 180,
    release_ms: 650,
    osd_width: 0,
    osd_height: 0,
  };
}

export function normalizePalette(value: unknown): CanvasPalette | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const segmentCount = Math.round(clamp(finiteNumber(source.segment_count, 7), 3, MAX_SEGMENTS));
  const required = segmentCount * 4 * 3;
  const sourceColors = Array.isArray(source.colors) ? source.colors : [];
  const colors = new Array<number>(required);
  for (let index = 0; index < required; index += 1) {
    const channel = sourceColors[index];
    colors[index] = typeof channel === "number" && Number.isFinite(channel)
      ? clamp(channel, 0, 255)
      : 0;
  }
  return {
    generation: finiteNumber(source.generation, 0),
    visible: source.visible === true,
    reset: source.reset === true,
    segment_count: segmentCount,
    colors,
    top: clamp(finiteNumber(source.top, 0), 0, 1),
    right: clamp(finiteNumber(source.right, 0), 0, 1),
    bottom: clamp(finiteNumber(source.bottom, 0), 0, 1),
    left: clamp(finiteNumber(source.left, 0), 0, 1),
    spread: clamp(finiteNumber(source.spread, 130), 100, 200),
    gap: clamp(finiteNumber(source.gap, 0), 0, 50),
    attack_ms: clamp(finiteNumber(source.attack_ms, 180), 50, 2000),
    release_ms: clamp(finiteNumber(source.release_ms, 650), 100, 5000),
    osd_width: Math.max(0, finiteNumber(source.osd_width, 0)),
    osd_height: Math.max(0, finiteNumber(source.osd_height, 0)),
  };
}

export function copyPalette(palette: CanvasPalette): CanvasPalette {
  return {
    ...palette,
    colors: palette.colors.slice(),
  };
}

export function palettesEqual(left: CanvasPalette, right: CanvasPalette): boolean {
  return left.generation === right.generation
    && left.visible === right.visible
    && left.reset === right.reset
    && left.segment_count === right.segment_count
    && left.top === right.top
    && left.right === right.right
    && left.bottom === right.bottom
    && left.left === right.left
    && left.spread === right.spread
    && left.gap === right.gap
    && left.attack_ms === right.attack_ms
    && left.release_ms === right.release_ms
    && left.osd_width === right.osd_width
    && left.osd_height === right.osd_height
    && left.colors.length === right.colors.length
    && left.colors.every((value, index) => value === right.colors[index]);
}

export function colorAt(palette: CanvasPalette, side: Side, index: number): [number, number, number] {
  const safeIndex = clamp(Math.round(index), 0, palette.segment_count - 1);
  const offset = (side * palette.segment_count + safeIndex) * 3;
  return [
    palette.colors[offset] || 0,
    palette.colors[offset + 1] || 0,
    palette.colors[offset + 2] || 0,
  ];
}

export function srgbByteToLinear(value: number): number {
  const channel = clamp(value, 0, 255) / 255;
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

const LINEAR_TABLE_SIZE = 4096;
/**
 * Таблица перевода линейного света в 8-битный sRGB.
 * На каждый пиксель приходится три преобразования, поэтому `Math.pow` здесь
 * стоил бы дороже всей остальной сборки кадра.
 */
const LINEAR_TO_SRGB: Uint8Array = (() => {
  const table = new Uint8Array(LINEAR_TABLE_SIZE + 1);
  for (let index = 0; index <= LINEAR_TABLE_SIZE; index += 1) {
    const channel = index / LINEAR_TABLE_SIZE;
    const srgb = channel <= 0.0031308
      ? channel * 12.92
      : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
    table[index] = Math.round(clamp(srgb, 0, 1) * 255);
  }
  return table;
})();

export function linearToSrgbByte(value: number): number {
  const index = Math.round(clamp(value, 0, 1) * LINEAR_TABLE_SIZE);
  return LINEAR_TO_SRGB[index];
}

/**
 * Профиль затухания поперёк полосы: `t` = 0 у границы кадра, `t` = 1 у края окна.
 * Значение строго равно нулю на обоих концах, поэтому свечение не «заходит» на
 * видео и не даёт жёсткой линии у края окна.
 */
export function falloffProfile(t: number): number {
  if (!(t > 0) || !(t < 1)) return 0;
  if (t < PROFILE_PEAK) {
    const rise = t / PROFILE_PEAK;
    return rise * rise * (3 - 2 * rise);
  }
  return Math.pow(1 - t, PROFILE_DECAY);
}

/** Амплитуда дизеринга: половина шага квантования внутри самой толстой полосы. */
export function ditherAmplitude(rows: number): number {
  return clamp(255 / (2 * Math.max(1, rows)), 0.3, 3);
}

export function getSegmentLayout(palette: CanvasPalette): SegmentLayout {
  const count = palette.segment_count;
  const gapRatio = palette.gap / 100;
  const segmentWidth = 1 / (count + gapRatio * (count - 1));
  const gapWidth = segmentWidth * gapRatio;
  const radius = Math.max(segmentWidth * 0.4, segmentWidth * (palette.spread / 100) * 0.72);
  const centers = Array.from({ length: count }, (_, index) =>
    (index + 0.5) * segmentWidth + index * gapWidth
  );
  return {
    centers,
    sigma: Math.max(radius / 1.25, segmentWidth * 0.18),
  };
}

export function createScratch(): RenderScratch {
  return {
    segmentLinear: new Float32Array(4 * MAX_SEGMENTS * 3),
    along: [
      new Float32Array(MAX_DIMENSION * 3),
      new Float32Array(MAX_DIMENSION * 3),
      new Float32Array(MAX_DIMENSION * 3),
      new Float32Array(MAX_DIMENSION * 3),
    ],
    fall: [
      new Float32Array(MAX_DIMENSION),
      new Float32Array(MAX_DIMENSION),
      new Float32Array(MAX_DIMENSION),
      new Float32Array(MAX_DIMENSION),
    ],
  };
}

/** Прямоугольник кадра в CSS-пикселях окна с учётом размера OSD от бэкенда. */
export function computeFrameRect(
  palette: CanvasPalette,
  cssWidth: number,
  cssHeight: number,
): FrameRect {
  const osdWidth = palette.osd_width > 1 ? palette.osd_width : cssWidth;
  const osdHeight = palette.osd_height > 1 ? palette.osd_height : cssHeight;
  const left = clamp(palette.left * osdWidth, 0, osdWidth);
  const top = clamp(palette.top * osdHeight, 0, osdHeight);
  const right = clamp((1 - palette.right) * osdWidth, left, osdWidth);
  const bottom = clamp((1 - palette.bottom) * osdHeight, top, osdHeight);
  const scaleX = cssWidth / osdWidth;
  const scaleY = cssHeight / osdHeight;
  return {
    left: left * scaleX,
    top: top * scaleY,
    right: right * scaleX,
    bottom: bottom * scaleY,
  };
}

/** Границы кадра в пикселях буфера + толщины полос. */
export function computeBufferFrame(
  frame: FrameRect,
  bufferWidth: number,
  bufferHeight: number,
): BufferFrame {
  const x0 = clamp(Math.round(frame.left), 0, bufferWidth);
  const y0 = clamp(Math.round(frame.top), 0, bufferHeight);
  const x1 = clamp(Math.round(frame.right), x0, bufferWidth);
  const y1 = clamp(Math.round(frame.bottom), y0, bufferHeight);
  return {
    x0,
    y0,
    x1,
    y1,
    topRows: y0,
    bottomRows: bufferHeight - y1,
    leftCols: x0,
    rightCols: bufferWidth - x1,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0),
  };
}

function buildSegmentLinear(scratch: RenderScratch, palette: CanvasPalette): void {
  const count = palette.segment_count;
  for (let side = 0; side < 4; side += 1) {
    for (let index = 0; index < count; index += 1) {
      const color = colorAt(palette, side as Side, index);
      const target = (side * MAX_SEGMENTS + index) * 3;
      scratch.segmentLinear[target] = srgbByteToLinear(color[0]);
      scratch.segmentLinear[target + 1] = srgbByteToLinear(color[1]);
      scratch.segmentLinear[target + 2] = srgbByteToLinear(color[2]);
    }
  }
}

/**
 * Таблица цвета вдоль грани, индексируемая буферной координатой.
 * Интерполяция между сегментами — гауссова и в линейном свете: в gamma-пространстве
 * между сегментами появляются тёмные «провалы».
 */
export function buildAlongLut(
  scratch: RenderScratch,
  palette: CanvasPalette,
  frame: BufferFrame,
  bufferWidth: number,
  bufferHeight: number,
): void {
  const count = palette.segment_count;
  const layout = getSegmentLayout(palette);
  const sigma = layout.sigma;
  for (let side = 0; side < 4; side += 1) {
    const along = scratch.along[side];
    const horizontal = side === 0 || side === 2;
    const length = Math.min(MAX_DIMENSION, horizontal ? bufferWidth : bufferHeight);
    const reverse = side === 2 || side === 3;
    const frameStart = horizontal ? frame.x0 : frame.y0;
    const frameSpan = horizontal ? frame.width : frame.height;
    for (let index = 0; index < length; index += 1) {
      const position = clamp((index - frameStart) / frameSpan, 0, 1);
      const logical = reverse ? 1 - position : position;
      let total = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let segment = 0; segment < count; segment += 1) {
        const distance = (logical - layout.centers[segment]) / sigma;
        const weight = Math.exp(-0.5 * distance * distance);
        const base = (side * MAX_SEGMENTS + segment) * 3;
        red += scratch.segmentLinear[base] * weight;
        green += scratch.segmentLinear[base + 1] * weight;
        blue += scratch.segmentLinear[base + 2] * weight;
        total += weight;
      }
      const target = index * 3;
      if (total > 1e-5) {
        along[target] = red / total;
        along[target + 1] = green / total;
        along[target + 2] = blue / total;
      } else {
        const fallback = colorAt(palette, side as Side, position < 0.5 ? 0 : count - 1);
        along[target] = srgbByteToLinear(fallback[0]);
        along[target + 1] = srgbByteToLinear(fallback[1]);
        along[target + 2] = srgbByteToLinear(fallback[2]);
      }
    }
  }
}

function buildFallLut(
  scratch: RenderScratch,
  frame: BufferFrame,
  bufferWidth: number,
  bufferHeight: number,
): void {
  const fallTop = scratch.fall[0];
  const fallRight = scratch.fall[1];
  const fallBottom = scratch.fall[2];
  const fallLeft = scratch.fall[3];
  for (let y = 0; y < frame.topRows && y < bufferHeight; y += 1) {
    fallTop[y] = falloffProfile(frame.topRows > 0 ? (frame.topRows - y) / frame.topRows : 1);
  }
  for (let y = frame.y1; y < bufferHeight; y += 1) {
    fallBottom[y] = falloffProfile(frame.bottomRows > 0 ? (y - frame.y1) / frame.bottomRows : 1);
  }
  for (let x = 0; x < frame.leftCols && x < bufferWidth; x += 1) {
    fallLeft[x] = falloffProfile(frame.leftCols > 0 ? (frame.leftCols - x) / frame.leftCols : 1);
  }
  for (let x = frame.x1; x < bufferWidth; x += 1) {
    fallRight[x] = falloffProfile(frame.rightCols > 0 ? (x - frame.x1) / frame.rightCols : 1);
  }
}

export interface GlowTarget {
  data: Uint8ClampedArray;
}

const LINEAR_SCALE = LINEAR_TABLE_SIZE;

function writeGlowPixel(
  pixels: Uint8ClampedArray,
  base: number,
  red: number,
  green: number,
  blue: number,
  noise: number,
  intensity: number,
): void {
  pixels[base] = LINEAR_TO_SRGB[(red * LINEAR_SCALE + 0.5) | 0] + noise;
  pixels[base + 1] = LINEAR_TO_SRGB[(green * LINEAR_SCALE + 0.5) | 0] + noise;
  pixels[base + 2] = LINEAR_TO_SRGB[(blue * LINEAR_SCALE + 0.5) | 0] + noise;
  pixels[base + 3] = intensity;
}

/**
 * Попиксельная сборка свечения в буфер: цвет берётся из таблицы вдоль грани,
 * интенсивность — из аналитического профиля затухания. Свечение рисуется
 * строго вне прямоугольника кадра, поэтому на видео не заходит.
 *
 * Возвращает `false`, если рисовать нечего (нет полос или режим выключен).
 */
export function renderGlowFrame(
  target: GlowTarget,
  bufferWidth: number,
  bufferHeight: number,
  scratch: RenderScratch,
  palette: CanvasPalette,
  cssWidth: number,
  cssHeight: number,
  opacity: number,
): boolean {
  if (!palette.visible || opacity <= 0.002 || cssWidth <= 0 || cssHeight <= 0) return false;
  if (bufferWidth <= 0 || bufferHeight <= 0) return false;

  const pixels = target.data;
  if (pixels.length < bufferWidth * bufferHeight * 4) return false;
  pixels.fill(0);

  const frameRect = computeFrameRect(palette, cssWidth, cssHeight);
  const scaleX = bufferWidth / cssWidth;
  const scaleY = bufferHeight / cssHeight;
  const frame = computeBufferFrame(
    {
      left: frameRect.left * scaleX,
      top: frameRect.top * scaleY,
      right: frameRect.right * scaleX,
      bottom: frameRect.bottom * scaleY,
    },
    bufferWidth,
    bufferHeight,
  );
  if (frame.topRows + frame.bottomRows + frame.leftCols + frame.rightCols <= 0) return false;

  buildSegmentLinear(scratch, palette);
  buildAlongLut(scratch, palette, frame, bufferWidth, bufferHeight);
  buildFallLut(scratch, frame, bufferWidth, bufferHeight);

  const alongTop = scratch.along[0];
  const alongRight = scratch.along[1];
  const alongBottom = scratch.along[2];
  const alongLeft = scratch.along[3];
  const fallTop = scratch.fall[0];
  const fallRight = scratch.fall[1];
  const fallBottom = scratch.fall[2];
  const fallLeft = scratch.fall[3];
  const strength = GLOW_STRENGTH * clamp(opacity, 0, 1) * 255;
  const dither = ditherAmplitude(Math.max(
    frame.topRows,
    frame.bottomRows,
    frame.leftCols,
    frame.rightCols,
  ));
  const paint = (
    x: number,
    y: number,
    red: number,
    green: number,
    blue: number,
    intensity: number,
  ) => {
    if (intensity <= 0.003) return;
    const base = (y * bufferWidth + x) * 4;
    const noise = BAYER_8[(y & 7) * 8 + (x & 7)] * dither;
    writeGlowPixel(pixels, base, red, green, blue, noise, intensity * strength);
  };

  for (let y = 0; y < frame.topRows; y += 1) {
    const fall = fallTop[y];
    if (fall <= 0.003) continue;
    const intensity = fall * strength;
    const rowBase = y * bufferWidth;
    const ditherRow = (y & 7) * 8;
    for (let x = frame.x0; x < frame.x1; x += 1) {
      const offset = x * 3;
      writeGlowPixel(
        pixels,
        (rowBase + x) * 4,
        alongTop[offset],
        alongTop[offset + 1],
        alongTop[offset + 2],
        BAYER_8[ditherRow + (x & 7)] * dither,
        intensity,
      );
    }
  }
  for (let y = frame.y1; y < bufferHeight; y += 1) {
    const fall = fallBottom[y];
    if (fall <= 0.003) continue;
    const intensity = fall * strength;
    const rowBase = y * bufferWidth;
    const ditherRow = (y & 7) * 8;
    for (let x = frame.x0; x < frame.x1; x += 1) {
      const offset = x * 3;
      writeGlowPixel(
        pixels,
        (rowBase + x) * 4,
        alongBottom[offset],
        alongBottom[offset + 1],
        alongBottom[offset + 2],
        BAYER_8[ditherRow + (x & 7)] * dither,
        intensity,
      );
    }
  }
  for (let x = 0; x < frame.leftCols; x += 1) {
    const fall = fallLeft[x];
    if (fall <= 0.003) continue;
    const intensity = fall * strength;
    for (let y = frame.y0; y < frame.y1; y += 1) {
      const offset = y * 3;
      writeGlowPixel(
        pixels,
        (y * bufferWidth + x) * 4,
        alongLeft[offset],
        alongLeft[offset + 1],
        alongLeft[offset + 2],
        BAYER_8[(y & 7) * 8 + (x & 7)] * dither,
        intensity,
      );
    }
  }
  for (let x = frame.x1; x < bufferWidth; x += 1) {
    const fall = fallRight[x];
    if (fall <= 0.003) continue;
    const intensity = fall * strength;
    for (let y = frame.y0; y < frame.y1; y += 1) {
      const offset = y * 3;
      writeGlowPixel(
        pixels,
        (y * bufferWidth + x) * 4,
        alongRight[offset],
        alongRight[offset + 1],
        alongRight[offset + 2],
        BAYER_8[(y & 7) * 8 + (x & 7)] * dither,
        intensity,
      );
    }
  }

  // Углы: мягкое смешение двух соседних граней по вкладу в затухание.
  for (let y = 0; y < frame.topRows; y += 1) {
    const fallTopValue = fallTop[y];
    for (let x = 0; x < frame.leftCols; x += 1) {
      const total = fallTopValue + fallLeft[x];
      if (total <= 0.003) continue;
      const topOffset = x * 3;
      const sideOffset = y * 3;
      const weightTop = fallTopValue / total;
      const weightSide = 1 - weightTop;
      paint(
        x,
        y,
        alongTop[topOffset] * weightTop + alongLeft[sideOffset] * weightSide,
        alongTop[topOffset + 1] * weightTop + alongLeft[sideOffset + 1] * weightSide,
        alongTop[topOffset + 2] * weightTop + alongLeft[sideOffset + 2] * weightSide,
        Math.min(1, total),
      );
    }
    for (let x = frame.x1; x < bufferWidth; x += 1) {
      const total = fallTopValue + fallRight[x];
      if (total <= 0.003) continue;
      const topOffset = x * 3;
      const sideOffset = y * 3;
      const weightTop = fallTopValue / total;
      const weightSide = 1 - weightTop;
      paint(
        x,
        y,
        alongTop[topOffset] * weightTop + alongRight[sideOffset] * weightSide,
        alongTop[topOffset + 1] * weightTop + alongRight[sideOffset + 1] * weightSide,
        alongTop[topOffset + 2] * weightTop + alongRight[sideOffset + 2] * weightSide,
        Math.min(1, total),
      );
    }
  }
  for (let y = frame.y1; y < bufferHeight; y += 1) {
    const fallBottomValue = fallBottom[y];
    for (let x = 0; x < frame.leftCols; x += 1) {
      const total = fallBottomValue + fallLeft[x];
      if (total <= 0.003) continue;
      const bottomOffset = x * 3;
      const sideOffset = y * 3;
      const weightBottom = fallBottomValue / total;
      const weightSide = 1 - weightBottom;
      paint(
        x,
        y,
        alongBottom[bottomOffset] * weightBottom + alongLeft[sideOffset] * weightSide,
        alongBottom[bottomOffset + 1] * weightBottom + alongLeft[sideOffset + 1] * weightSide,
        alongBottom[bottomOffset + 2] * weightBottom + alongLeft[sideOffset + 2] * weightSide,
        Math.min(1, total),
      );
    }
    for (let x = frame.x1; x < bufferWidth; x += 1) {
      const total = fallBottomValue + fallRight[x];
      if (total <= 0.003) continue;
      const bottomOffset = x * 3;
      const sideOffset = y * 3;
      const weightBottom = fallBottomValue / total;
      const weightSide = 1 - weightBottom;
      paint(
        x,
        y,
        alongBottom[bottomOffset] * weightBottom + alongRight[sideOffset] * weightSide,
        alongBottom[bottomOffset + 1] * weightBottom + alongRight[sideOffset + 1] * weightSide,
        alongBottom[bottomOffset + 2] * weightBottom + alongRight[sideOffset + 2] * weightSide,
        Math.min(1, total),
      );
    }
  }

  return true;
}
