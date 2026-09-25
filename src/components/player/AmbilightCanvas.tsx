import { memo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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
}

type Side = 0 | 1 | 2 | 3;
type Rgb = [number, number, number];

const MAX_CANVAS_PIXELS = 1920 * 1080;
const MAX_GLOW_BUFFER_PIXELS = 640 * 360;

interface CanvasPalette {
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
}

interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

interface SegmentLayout {
  centers: number[];
  radius: number;
}

interface GlowBuffer {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  pixelWidth: number;
  pixelHeight: number;
}

function createEmptyPalette(segmentCount = 7): CanvasPalette {
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
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizePalette(value: unknown): CanvasPalette | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const segmentCount = Math.round(clamp(finiteNumber(source.segment_count, 7), 3, 16));
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
  };
}

function copyPalette(palette: CanvasPalette): CanvasPalette {
  return {
    ...palette,
    colors: palette.colors.slice(),
  };
}

function colorAt(palette: CanvasPalette, side: Side, index: number): Rgb {
  const safeIndex = clamp(Math.round(index), 0, palette.segment_count - 1);
  const offset = (side * palette.segment_count + safeIndex) * 3;
  return [
    palette.colors[offset] || 0,
    palette.colors[offset + 1] || 0,
    palette.colors[offset + 2] || 0,
  ];
}

function mixColor(left: Rgb, right: Rgb, amount: number): Rgb {
  return [
    left[0] + (right[0] - left[0]) * amount,
    left[1] + (right[1] - left[1]) * amount,
    left[2] + (right[2] - left[2]) * amount,
  ];
}

function rgbToCss(color: Rgb): string {
  return `rgb(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])})`;
}

function getSegmentLayout(palette: CanvasPalette): SegmentLayout {
  const count = palette.segment_count;
  const gapRatio = palette.gap / 100;
  const segmentWidth = 1 / (count + gapRatio * (count - 1));
  const gapWidth = segmentWidth * gapRatio;
  const radius = Math.max(
    segmentWidth * 0.4,
    segmentWidth * (palette.spread / 100) * 0.72,
  );
  const centers = Array.from({ length: count }, (_, index) =>
    (index + 0.5) * segmentWidth + index * gapWidth
  );
  return { centers, radius };
}

function sampleColor(palette: CanvasPalette, side: Side, position: number): Rgb {
  position = clamp(position, 0, 1);
  const layout = getSegmentLayout(palette);
  const segmentWidth = 1 / Math.max(1, palette.segment_count);
  const sigma = Math.max(layout.radius / 1.25, segmentWidth * 0.18);
  let red = 0;
  let green = 0;
  let blue = 0;
  let weightTotal = 0;

  for (let index = 0; index < layout.centers.length; index += 1) {
    const normalizedDistance = (position - layout.centers[index]) / sigma;
    const weight = Math.exp(-0.5 * normalizedDistance * normalizedDistance);
    const color = colorAt(palette, side, index);
    red += color[0] * weight;
    green += color[1] * weight;
    blue += color[2] * weight;
    weightTotal += weight;
  }

  if (weightTotal > 0.00001) {
    return [red / weightTotal, green / weightTotal, blue / weightTotal];
  }
  return colorAt(palette, side, position < 0.5 ? 0 : palette.segment_count - 1);
}

function createSideGradient(
  context: CanvasRenderingContext2D,
  palette: CanvasPalette,
  x: number,
  y: number,
  width: number,
  height: number,
  side: Side,
  reverse: boolean,
): CanvasGradient {
  const horizontal = side === 0 || side === 2;
  const gradient = horizontal
    ? context.createLinearGradient(x, y, x + width, y)
    : context.createLinearGradient(x, y, x, y + height);
  const layout = getSegmentLayout(palette);
  const positions = [0, 1];
  for (const center of layout.centers) {
    positions.push(
      clamp(center - layout.radius * 1.8, 0, 1),
      center,
      clamp(center + layout.radius * 1.8, 0, 1),
    );
  }
  positions.sort((left, right) => left - right);
  let previous = -1;
  for (const position of positions) {
    if (position <= previous + 0.000001) continue;
    previous = position;
    const logicalPosition = reverse ? 1 - position : position;
    gradient.addColorStop(position, rgbToCss(sampleColor(palette, side, logicalPosition)));
  }
  return gradient;
}

function drawCornerBlend(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  a0: Rgb,
  a1: Rgb,
  b0: Rgb,
  b1: Rgb,
): void {
  if (width <= 0 || height <= 0) return;
  const start = mixColor(a0, b0, 0.5);
  const end = mixColor(a1, b1, 0.5);
  const gradient = context.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, rgbToCss(start));
  gradient.addColorStop(0.5, rgbToCss(mixColor(start, end, 0.5)));
  gradient.addColorStop(1, rgbToCss(end));
  context.fillStyle = gradient;
  context.fillRect(x, y, width, height);
}

type NearEdge = "min" | "max";

function drawFeatheredSide(
  context: CanvasRenderingContext2D,
  gradient: CanvasGradient,
  x: number,
  y: number,
  width: number,
  height: number,
  side: Side,
  near: NearEdge,
  strength: number,
): void {
  const horizontal = side === 0 || side === 2;
  const layers = [
    { fraction: 1, alpha: 0.16 },
    { fraction: 0.82, alpha: 0.14 },
    { fraction: 0.64, alpha: 0.13 },
    { fraction: 0.46, alpha: 0.12 },
    { fraction: 0.28, alpha: 0.12 },
    { fraction: 0.12, alpha: 0.12 },
  ];
  for (const layer of layers) {
    let layerX = x;
    let layerY = y;
    let layerWidth = width;
    let layerHeight = height;
    if (horizontal) {
      layerHeight = height * layer.fraction;
      layerY = near === "max" ? y + height - layerHeight : y;
    } else {
      layerWidth = width * layer.fraction;
      layerX = near === "max" ? x + width - layerWidth : x;
    }
    context.globalAlpha = layer.alpha * strength;
    context.fillStyle = gradient;
    context.fillRect(layerX, layerY, layerWidth, layerHeight);
  }
  context.globalAlpha = 1;
}

function createGlowBuffer(): GlowBuffer | null {
  const glowCanvas = document.createElement("canvas");
  const glowContext = glowCanvas.getContext("2d");
  if (!glowContext) return null;
  return {
    canvas: glowCanvas,
    context: glowContext,
    pixelWidth: 0,
    pixelHeight: 0,
  };
}

function prepareGlowBuffer(
  buffer: GlowBuffer,
  width: number,
  height: number,
): void {
  const scale = Math.min(
    1,
    Math.sqrt(MAX_GLOW_BUFFER_PIXELS / Math.max(1, width * height)),
  );
  const pixelWidth = Math.max(2, Math.round(width * scale));
  const pixelHeight = Math.max(2, Math.round(height * scale));
  if (buffer.pixelWidth !== pixelWidth || buffer.pixelHeight !== pixelHeight) {
    buffer.canvas.width = pixelWidth;
    buffer.canvas.height = pixelHeight;
    buffer.pixelWidth = pixelWidth;
    buffer.pixelHeight = pixelHeight;
  }
  const context = buffer.context;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, pixelWidth, pixelHeight);
  context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "screen";
  context.filter = "none";
}

function drawPalette(
  context: CanvasRenderingContext2D,
  glowBuffer: GlowBuffer,
  palette: CanvasPalette,
  width: number,
  height: number,
  opacity: number,
): void {
  context.clearRect(0, 0, width, height);
  if (!palette.visible || opacity <= 0.002 || width <= 0 || height <= 0) return;

  prepareGlowBuffer(glowBuffer, width, height);
  const source = glowBuffer.context;
  const top = palette.top * height;
  const right = palette.right * width;
  const bottom = palette.bottom * height;
  const left = palette.left * width;
  const videoX = clamp(left, 0, width);
  const videoY = clamp(top, 0, height);
  const videoRight = clamp(width - right, videoX, width);
  const videoBottom = clamp(height - bottom, videoY, height);
  const videoWidth = Math.max(0, videoRight - videoX);
  const videoHeight = Math.max(0, videoBottom - videoY);
  if (videoWidth <= 0 || videoHeight <= 0) return;
  const gradients = [
    createSideGradient(source, palette, videoX, videoY, videoWidth, 0, 0, false),
    createSideGradient(source, palette, videoRight, videoY, 0, videoHeight, 1, false),
    createSideGradient(source, palette, videoX, videoBottom, videoWidth, 0, 2, true),
    createSideGradient(source, palette, videoX, videoY, 0, videoHeight, 3, true),
  ];

  if (top > 0 && videoWidth > 0) {
    drawFeatheredSide(
      source,
      gradients[0],
      videoX,
      0,
      videoWidth,
      top,
      0,
      "max",
      1,
    );
  }
  if (right > 0 && videoHeight > 0) {
    drawFeatheredSide(
      source,
      gradients[1],
      videoRight,
      videoY,
      right,
      videoHeight,
      1,
      "min",
      1,
    );
  }
  if (bottom > 0 && videoWidth > 0) {
    drawFeatheredSide(
      source,
      gradients[2],
      videoX,
      videoBottom,
      videoWidth,
      bottom,
      2,
      "min",
      1,
    );
  }
  if (left > 0 && videoHeight > 0) {
    drawFeatheredSide(
      source,
      gradients[3],
      0,
      videoY,
      left,
      videoHeight,
      3,
      "max",
      1,
    );
  }

  source.globalAlpha = 0.48;
  if (top > 0 && left > 0) {
    drawCornerBlend(
      source,
      0,
      0,
      left,
      top,
      sampleColor(palette, 0, 0),
      sampleColor(palette, 0, left / Math.max(1, videoWidth)),
      sampleColor(palette, 3, 1),
      sampleColor(palette, 3, 1 - top / Math.max(1, videoHeight)),
    );
  }
  if (top > 0 && right > 0) {
    drawCornerBlend(
      source,
      videoRight,
      0,
      right,
      top,
      sampleColor(palette, 0, 1 - right / Math.max(1, videoWidth)),
      sampleColor(palette, 0, 1),
      sampleColor(palette, 1, 0),
      sampleColor(palette, 1, top / Math.max(1, videoHeight)),
    );
  }
  if (bottom > 0 && right > 0) {
    drawCornerBlend(
      source,
      videoRight,
      videoBottom,
      right,
      bottom,
      sampleColor(palette, 2, 1 - right / Math.max(1, videoWidth)),
      sampleColor(palette, 2, 1),
      sampleColor(palette, 1, 1 - bottom / Math.max(1, videoHeight)),
      sampleColor(palette, 1, 1),
    );
  }
  if (bottom > 0 && left > 0) {
    drawCornerBlend(
      source,
      0,
      videoBottom,
      left,
      bottom,
      sampleColor(palette, 2, 1),
      sampleColor(palette, 2, 1 - left / Math.max(1, videoWidth)),
      sampleColor(palette, 3, bottom / Math.max(1, videoHeight)),
      sampleColor(palette, 3, 0),
    );
  }

  const innerDepth = Math.max(
    4,
    Math.min(56, Math.min(videoWidth, videoHeight) * 0.055),
  );
  if (videoWidth > innerDepth * 2 && videoHeight > innerDepth * 2) {
    drawFeatheredSide(
      source,
      gradients[0],
      videoX,
      videoY,
      videoWidth,
      innerDepth,
      0,
      "min",
      0.14,
    );
    drawFeatheredSide(
      source,
      gradients[1],
      videoRight - innerDepth,
      videoY,
      innerDepth,
      videoHeight,
      1,
      "max",
      0.14,
    );
    drawFeatheredSide(
      source,
      gradients[2],
      videoX,
      videoBottom - innerDepth,
      videoWidth,
      innerDepth,
      2,
      "max",
      0.14,
    );
    drawFeatheredSide(
      source,
      gradients[3],
      videoX,
      videoY,
      innerDepth,
      videoHeight,
      3,
      "min",
      0.14,
    );

    source.globalAlpha = 0.1;
    drawCornerBlend(
      source,
      videoX,
      videoY,
      innerDepth,
      innerDepth,
      sampleColor(palette, 0, 0),
      sampleColor(palette, 0, innerDepth / videoWidth),
      sampleColor(palette, 3, 1),
      sampleColor(palette, 3, 1 - innerDepth / videoHeight),
    );
    drawCornerBlend(
      source,
      videoRight - innerDepth,
      videoY,
      innerDepth,
      innerDepth,
      sampleColor(palette, 0, 1 - innerDepth / videoWidth),
      sampleColor(palette, 0, 1),
      sampleColor(palette, 1, 0),
      sampleColor(palette, 1, innerDepth / videoHeight),
    );
    drawCornerBlend(
      source,
      videoRight - innerDepth,
      videoBottom - innerDepth,
      innerDepth,
      innerDepth,
      sampleColor(palette, 2, 1 - innerDepth / videoWidth),
      sampleColor(palette, 2, 1),
      sampleColor(palette, 1, 1 - innerDepth / videoHeight),
      sampleColor(palette, 1, 1),
    );
    drawCornerBlend(
      source,
      videoX,
      videoBottom - innerDepth,
      innerDepth,
      innerDepth,
      sampleColor(palette, 2, 1),
      sampleColor(palette, 2, 1 - innerDepth / videoWidth),
      sampleColor(palette, 3, innerDepth / videoHeight),
      sampleColor(palette, 3, 0),
    );
  }
  source.globalAlpha = 1;

  const blurRadius = clamp(Math.min(width, height) * 0.055, 20, 64);
  context.save();
  context.globalCompositeOperation = "screen";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.globalAlpha = opacity * 0.42;
  context.filter = `blur(${blurRadius}px)`;
  context.drawImage(glowBuffer.canvas, 0, 0, width, height);
  context.globalAlpha = opacity * 0.34;
  context.filter = `blur(${blurRadius * 0.45}px)`;
  context.drawImage(glowBuffer.canvas, 0, 0, width, height);
  context.restore();
}

function clearCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function palettesEqual(left: CanvasPalette, right: CanvasPalette): boolean {
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
    && left.colors.length === right.colors.length
    && left.colors.every((value, index) => value === right.colors[index]);
}

export const AmbilightCanvas = memo(function AmbilightCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<CanvasPalette>(createEmptyPalette());
  const currentRef = useRef<CanvasPalette>(createEmptyPalette());
  const sizeRef = useRef<CanvasSize>({ width: 1, height: 1, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const glowBuffer = createGlowBuffer();
    if (!canvas || !glowBuffer) return;

    let disposed = false;
    let rafId: number | null = null;
    let unlisten: (() => void) | null = null;
    let lastTime = performance.now();
    let glowOpacity = 0;
    let renderedGlow = false;
    let requestRender = () => {};
    targetRef.current = createEmptyPalette();
    currentRef.current = createEmptyPalette();
    sizeRef.current = { width: 1, height: 1, dpr: 1 };

    const updateCanvasSize = () => {
      if (disposed) return;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        1.5,
        Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, width * height)),
      );
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const previousSize = sizeRef.current;
      if (
        Math.abs(previousSize.width - width) > 0.01
        || Math.abs(previousSize.height - height) > 0.01
        || Math.abs(previousSize.dpr - dpr) > 0.001
      ) {
        sizeRef.current = { width, height, dpr };
        requestRender();
      }
    };

    const applyPalette = (value: unknown) => {
      if (disposed) return;
      const palette = normalizePalette(value);
      if (!palette) return;
      const previousTarget = targetRef.current;
      if (previousTarget.generation > 0 && palette.generation < previousTarget.generation) return;
      const unchanged = palettesEqual(previousTarget, palette);
      targetRef.current = palette;
      const current = currentRef.current;
      if (
        palette.visible
        && (palette.segment_count !== current.segment_count
          || palette.colors.length !== current.colors.length)
      ) {
        currentRef.current = copyPalette(palette);
      }
      if (!unchanged) requestRender();
    };

    const render = (time: number) => {
      if (disposed) return;
      rafId = null;
      const delta = Math.min(64, Math.max(1, time - lastTime));
      lastTime = time;
      const size = sizeRef.current;
      const target = targetRef.current;
      let current = currentRef.current;
      let colorsSettled = true;
      if (target.visible) {
        if (current.colors.length !== target.colors.length) {
          current = copyPalette(target);
        } else {
          let currentLuma = 0;
          let targetLuma = 0;
          for (let index = 0; index < current.colors.length; index += 3) {
            currentLuma += current.colors[index] * 0.2126
              + current.colors[index + 1] * 0.7152
              + current.colors[index + 2] * 0.0722;
            targetLuma += target.colors[index] * 0.2126
              + target.colors[index + 1] * 0.7152
              + target.colors[index + 2] * 0.0722;
          }
          const tau = targetLuma >= currentLuma ? target.attack_ms : target.release_ms;
          const amount = tau <= 0 ? 1 : 1 - Math.exp(-delta / tau);
          let maxDelta = 0;
          for (let index = 0; index < current.colors.length; index += 1) {
            const difference = target.colors[index] - current.colors[index];
            current.colors[index] += difference * amount;
            maxDelta = Math.max(maxDelta, Math.abs(difference));
          }
          for (const key of ["top", "right", "bottom", "left", "spread", "gap"] as const) {
            const difference = target[key] - current[key];
            current[key] += difference * amount;
            maxDelta = Math.max(maxDelta, Math.abs(difference));
          }
          current.visible = true;
          current.generation = target.generation;
          current.segment_count = target.segment_count;
          if (maxDelta < 0.5) current = copyPalette(target);
          else colorsSettled = false;
        }
      }
      currentRef.current = current;

      const targetOpacity = target.visible ? 1 : 0;
      const opacityDifference = Math.abs(targetOpacity - glowOpacity);
      let opacitySettled = false;
      if (opacityDifference <= 0.002) {
        glowOpacity = targetOpacity;
        opacitySettled = true;
      } else {
        const fadeTau = target.visible
          ? Math.max(160, target.attack_ms)
          : Math.max(280, target.release_ms);
        glowOpacity += (targetOpacity - glowOpacity) * (1 - Math.exp(-delta / fadeTau));
        opacitySettled = Math.abs(targetOpacity - glowOpacity) <= 0.002;
        if (opacitySettled) glowOpacity = targetOpacity;
      }

      const context = canvas.getContext("2d");
      if (context) {
        context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
        context.filter = "none";
        if (glowOpacity > 0.002 && current.visible) {
          drawPalette(
            context,
            glowBuffer,
            current,
            size.width,
            size.height,
            glowOpacity,
          );
          renderedGlow = true;
        } else if (renderedGlow) {
          context.clearRect(0, 0, size.width, size.height);
          renderedGlow = false;
        }
      }
      const shouldContinue = target.visible
        ? !colorsSettled || !opacitySettled
        : glowOpacity > 0;
      if (shouldContinue) {
        rafId = requestAnimationFrame(render);
      }
    };

    requestRender = () => {
      if (disposed || rafId !== null) return;
      lastTime = performance.now();
      rafId = requestAnimationFrame(render);
    };

    updateCanvasSize();
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    const parent = canvas.parentElement;
    resizeObserver.observe(parent || canvas);
    window.addEventListener("resize", updateCanvasSize);
    requestRender();

    listen<AmbientPalette>("ambient-palette", (event) => applyPalette(event.payload))
      .then((stopListening) => {
        if (disposed) {
          stopListening();
        } else {
          unlisten = stopListening;
        }
      })
      .catch(() => {});
    invoke<AmbientPalette | null>("get_ambient_palette")
      .then((palette) => {
        if (palette) applyPalette(palette);
      })
      .catch(() => {});

    return () => {
      disposed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateCanvasSize);
      unlisten?.();
      clearCanvas(canvas);
    };
  }, []);

  return <canvas ref={canvasRef} className="ambient-canvas" aria-hidden="true" />;
});

AmbilightCanvas.displayName = "AmbilightCanvas";
