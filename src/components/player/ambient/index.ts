/**
 * @file index.ts
 * @description Публичный API модульной подсистемы экранной подсветки Ambient / AmbiLight.
 */

export { AmbientOverlay, type AmbientOverlayProps } from "./AmbientOverlay";
export { AmbilightShadowRenderer, renderAmbilightShadowMask } from "./AmbilightRenderer";
export {
  MAX_MASK_DIMENSION,
  computeMaskBufferSize,
  areAmbientLayoutsEqual,
  hasVisibleBars,
} from "./falloffMath";
