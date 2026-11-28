/**
 * @file AmbilightRenderer.ts
 * @description Модуль высокопроизводительного рендеринга маски затухания
 * света (AmbiLight) с переиспользованием буфера ImageData и кэшированием
 * предрасчитанной LUT-таблицы кривой спада.
 */

import type { AmbientLayout, AmbientSettings } from "../../../utils/ambientSettingsUtils";
import {
  FALLOFF_LUT_SIZE,
  INV_PERCEPTUAL_GAMMA,
  MIN_BAR_THRESHOLD_PX,
  buildTransmittanceLut,
  clamp,
  computeDirectionWeight,
  computeMaskBufferSize,
  interleavedGradientNoise,
} from "./falloffMath";

/**
 * Состояние кэша рендерера маски затухания AmbiLight.
 * Исключает лишние аллокации памяти при 60fps перетаскивании ползунков.
 */
export class AmbilightShadowRenderer {
  private cachedImageData: ImageData | null = null;
  private cachedWidth = 0;
  private cachedHeight = 0;
  private cachedLut: Float32Array | null = null;
  private cachedFade: number | null = null;
  private cachedHdrDim: boolean | null = null;

  /**
   * Возвращает или переиспользует буфер ImageData под требуемые размеры холста.
   */
  private acquireImageData(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): ImageData {
    if (
      this.cachedImageData &&
      this.cachedWidth === width &&
      this.cachedHeight === height
    ) {
      this.cachedImageData.data.fill(0);
      return this.cachedImageData;
    }

    const imageData = ctx.createImageData(width, height);
    this.cachedImageData = imageData;
    this.cachedWidth = width;
    this.cachedHeight = height;
    return imageData;
  }

  /**
   * Возвращает закэшированную LUT-таблицу кривой затухания или перестраивает её
   * только при изменении параметра fade либо режима HDR Dimming.
   */
  private getTransmittanceLut(fade: number, applyHdrDim: boolean): Float32Array {
    if (
      this.cachedLut &&
      this.cachedFade === fade &&
      this.cachedHdrDim === applyHdrDim
    ) {
      return this.cachedLut;
    }

    const lut = buildTransmittanceLut(fade, applyHdrDim);
    this.cachedLut = lut;
    this.cachedFade = fade;
    this.cachedHdrDim = applyHdrDim;
    return lut;
  }

  /**
   * Отрисовывает маску затухания AmbiLight на переданный 2D-контекст Canvas.
   */
  public render(
    ctx: CanvasRenderingContext2D,
    layout: AmbientLayout,
    settings: AmbientSettings,
  ): void {
    const { width: targetW, height: targetH } = computeMaskBufferSize(layout.w, layout.h);

    if (ctx.canvas.width !== targetW || ctx.canvas.height !== targetH) {
      ctx.canvas.width = targetW;
      ctx.canvas.height = targetH;
    }

    if (layout.w <= 0 || layout.h <= 0) {
      ctx.clearRect(0, 0, targetW, targetH);
      return;
    }

    const mt = layout.mt >= MIN_BAR_THRESHOLD_PX ? Math.min(layout.mt, layout.h) : 0;
    const mb = layout.mb >= MIN_BAR_THRESHOLD_PX ? Math.min(layout.mb, layout.h) : 0;
    const ml = layout.ml >= MIN_BAR_THRESHOLD_PX ? Math.min(layout.ml, layout.w) : 0;
    const mr = layout.mr >= MIN_BAR_THRESHOLD_PX ? Math.min(layout.mr, layout.w) : 0;

    if (mt === 0 && mb === 0 && ml === 0 && mr === 0) {
      ctx.clearRect(0, 0, targetW, targetH);
      return;
    }

    const x1 = ml;
    const x2 = Math.max(x1, layout.w - mr);
    const y1 = mt;
    const y2 = Math.max(y1, layout.h - mb);
    const vw = x2 - x1;
    const vh = y2 - y1;
    const halfVw = vw * 0.5;
    const halfVh = vh * 0.5;
    const centerX = x1 + halfVw;
    const centerY = y1 + halfVh;

    const rTop = mt;
    const rBottom = mb;
    const rLeft = ml;
    const rRight = mr;

    const onlyVerticalBars = ml === 0 && mr === 0 && vw > 0;
    const onlyHorizontalBars = mt === 0 && mb === 0 && vh > 0;

    const applyHdrDim = Boolean(layout.isHdr && settings.hdr_dim);
    const lut = this.getTransmittanceLut(settings.fade, applyHdrDim);
    const lutMaxIdx = FALLOFF_LUT_SIZE - 1;

    const debandingNorm = clamp(settings.debanding / 100, 0, 1);
    const ditherAmplitude = debandingNorm > 0 ? 1.2 + debandingNorm * 1.8 : 0;

    const imageData = this.acquireImageData(ctx, targetW, heightOrFallback(targetH));
    const data = imageData.data;

    const stepX = layout.w / targetW;
    const stepY = layout.h / targetH;
    const videoStartIx = Math.max(0, Math.ceil(x1 / stepX - 0.5));
    const videoEndIx = Math.min(targetW - 1, Math.floor(x2 / stepX - 0.5));

    for (let iy = 0; iy < targetH; iy++) {
      const py = (iy + 0.5) * stepY;
      const dyTop = py < y1 ? y1 - py : 0;
      const dyBottom = py > y2 ? py - y2 : 0;
      const dy = dyTop + dyBottom;

      // Быстрый пропуск строк, полностью лежащих внутри области видео
      if (dy === 0 && ml === 0 && mr === 0) {
        continue;
      }

      let uyBase = 0;
      if (dyTop > 0) {
        uyBase = rTop > 0 ? dyTop / rTop : 1;
      } else if (dyBottom > 0) {
        uyBase = rBottom > 0 ? dyBottom / rBottom : 1;
      }

      const vOn = dyTop > 0
        ? settings.direction_top
        : (dyBottom > 0 ? settings.direction_bottom : true);
      const rowOffset = iy * targetW * 4;

      for (let ix = 0; ix < targetW; ix++) {
        // Быстрый перескок горизонтального участка внутри видеокадра
        if (dy === 0 && ix >= videoStartIx && ix <= videoEndIx) {
          ix = videoEndIx;
          continue;
        }

        const px = (ix + 0.5) * stepX;
        const dxLeft = px < x1 ? x1 - px : 0;
        const dxRight = px > x2 ? px - x2 : 0;
        const dx = dxLeft + dxRight;

        if (dx === 0 && dy === 0) {
          continue;
        }

        let ux = 0;
        if (dxLeft > 0) {
          ux = rLeft > 0 ? dxLeft / rLeft : 1;
        } else if (dxRight > 0) {
          ux = rRight > 0 ? dxRight / rRight : 1;
        }

        let uy = uyBase;

        // Деликатное угловое смягчение на внешнем крае при 2-сторонних полосах
        if (onlyVerticalBars && dy > 0) {
          const nx = Math.abs(px - centerX) / halfVw;
          if (nx > 0.55) {
            const edge = (nx - 0.55) / 0.45;
            ux = 0.15 * edge * edge * Math.min(1, uy * 1.1);
          }
        } else if (onlyHorizontalBars && dx > 0) {
          const ny = Math.abs(py - centerY) / halfVh;
          if (ny > 0.55) {
            const edge = (ny - 0.55) / 0.45;
            uy = 0.15 * edge * edge * Math.min(1, ux * 1.1);
          }
        }

        const d = Math.hypot(ux, uy);
        const pixelOffset = rowOffset + ix * 4;

        const hOn = dxLeft > 0
          ? settings.direction_left
          : (dxRight > 0 ? settings.direction_right : true);
        const dirWeight = computeDirectionWeight(dx, dy, hOn, vOn);
        if (dirWeight <= 0) {
          data[pixelOffset + 3] = 255;
          continue;
        }

        let transmittance: number;
        if (d >= 1) {
          transmittance = lut[lutMaxIdx];
        } else {
          // Линейная интерполяция по предрасчитанной LUT-таблице
          const fIdx = d * lutMaxIdx;
          const i0 = Math.floor(fIdx);
          const i1 = i0 < lutMaxIdx ? i0 + 1 : lutMaxIdx;
          const frac = fIdx - i0;
          transmittance = lut[i0] + (lut[i1] - lut[i0]) * frac;
        }

        if (dirWeight < 1) {
          transmittance *= Math.pow(dirWeight, INV_PERCEPTUAL_GAMMA);
        }

        const alphaFloat = (1 - transmittance) * 255;
        if (alphaFloat <= 0) {
          continue;
        }

        if (ditherAmplitude > 0 && alphaFloat < 255) {
          const dither = (interleavedGradientNoise(ix, iy) - 0.5) * ditherAmplitude;
          data[pixelOffset + 3] = clamp(Math.round(alphaFloat + dither), 0, 255);
        } else {
          data[pixelOffset + 3] = Math.round(alphaFloat);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Освобождает закэшированные буферы при размонтировании компонента.
   */
  public dispose(): void {
    this.cachedImageData = null;
    this.cachedLut = null;
    this.cachedWidth = 0;
    this.cachedHeight = 0;
    this.cachedFade = null;
    this.cachedHdrDim = null;
  }
}

function heightOrFallback(height: number): number {
  return height > 0 ? height : 1;
}

/**
 * Удобная обёртка для разовой отрисовки маски затухания без сохранения экземпляра.
 */
export function renderAmbilightShadowMask(
  ctx: CanvasRenderingContext2D,
  layout: AmbientLayout,
  settings: AmbientSettings,
): void {
  const renderer = new AmbilightShadowRenderer();
  try {
    renderer.render(ctx, layout, settings);
  } finally {
    renderer.dispose();
  }
}
