import { memo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  copyPalette,
  createEmptyPalette,
  createScratch,
  MAX_DIMENSION,
  MAX_GLOW_BUFFER_PIXELS,
  normalizePalette,
  palettesEqual,
  renderGlowFrame,
  type AmbientPalette,
  type CanvasPalette,
  type RenderScratch,
} from "./ambilightRender";

export type { AmbientPalette } from "./ambilightRender";

const MAX_CANVAS_PIXELS = 1920 * 1080;

interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

interface GlowSurface {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  image: ImageData | null;
  width: number;
  height: number;
}

function createGlowSurface(): GlowSurface | null {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return null;
  return { canvas, context, image: null, width: 0, height: 0 };
}

/** Подгоняет расчётный буфер под окно и очищает его. */
function prepareSurface(surface: GlowSurface, cssWidth: number, cssHeight: number): boolean {
  const scale = Math.min(
    1,
    Math.sqrt(MAX_GLOW_BUFFER_PIXELS / Math.max(1, cssWidth * cssHeight)),
  );
  const width = Math.max(2, Math.min(MAX_DIMENSION, Math.round(cssWidth * scale)));
  const height = Math.max(2, Math.min(MAX_DIMENSION, Math.round(cssHeight * scale)));
  const context = surface.context;
  if (surface.width !== width || surface.height !== height || !surface.image) {
    surface.canvas.width = width;
    surface.canvas.height = height;
    surface.image = context.createImageData(width, height);
    surface.width = width;
    surface.height = height;
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.filter = "none";
  context.clearRect(0, 0, width, height);
  return surface.image.data.length >= width * height * 4;
}

function clearCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
}

export const AmbilightCanvas = memo(function AmbilightCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<CanvasPalette>(createEmptyPalette());
  const currentRef = useRef<CanvasPalette>(createEmptyPalette());
  const sizeRef = useRef<CanvasSize>({ width: 1, height: 1, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = createGlowSurface();
    if (!canvas || !surface) return;
    const scratch: RenderScratch = createScratch();

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
          // Геометрия OSD не анимируется: она меняется только при пересчёте кадра.
          current.osd_width = target.osd_width;
          current.osd_height = target.osd_height;
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
          if (prepareSurface(surface, size.width, size.height) && surface.image) {
            const drawn = renderGlowFrame(
              surface.image,
              surface.width,
              surface.height,
              scratch,
              current,
              size.width,
              size.height,
              glowOpacity,
            );
            if (drawn) {
              // Один проход масштабирования буфера на канвас: без blur по полному
              // разрешению, поэтому нет жёстких слоёв и второго источника полос.
              surface.context.putImageData(surface.image, 0, 0);
              context.save();
              context.globalCompositeOperation = "copy";
              context.globalAlpha = 1;
              context.filter = "none";
              context.imageSmoothingEnabled = true;
              context.imageSmoothingQuality = "high";
              context.drawImage(surface.canvas, 0, 0, size.width, size.height);
              context.restore();
              renderedGlow = true;
            } else if (renderedGlow) {
              context.clearRect(0, 0, size.width, size.height);
              renderedGlow = false;
            }
          }
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
