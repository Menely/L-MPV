/**
 * Request keys aligned with the backend: 1s grid for keyframes, frame-accurate
 * (by fps, ms precision without it) for exact frames. Adjacent pixels that land
 * on the same video frame share one key and one cache entry.
 */
export function thumbnailTime(seconds: number, exact: boolean, fps = 0): number {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (!exact) return Math.floor(safe);
  if (Number.isFinite(fps) && fps > 0) return Math.round((Math.round(safe * fps) / fps) * 1000) / 1000;
  return Math.round(safe * 1000) / 1000;
}

export function supportsTimelineThumbnail(path: string, hasVideo: boolean): boolean {
  return hasVideo && path.length > 0 && !/^[a-z][a-z\d+.-]*:\/\//i.test(path);
}

/** The card may extend beyond the rail, but must stay inside the viewport. */
export function timelinePreviewLeft(ratio: number, railLeft: number, railWidth: number, cardWidth: number, viewportWidth: number, scale: number): number {
  const zoom = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const center = railLeft + Math.max(0, Math.min(1, ratio)) * railWidth;
  const half = cardWidth / 2;
  const clamped = Math.max(half + 8, Math.min(center, viewportWidth - half - 8));
  return (clamped - railLeft) / zoom;
}

/** Card frame width in CSS px (see timeline-preview.css). */
const CARD_FRAME_CSS_WIDTH = 230;
const THUMBNAIL_WIDTHS = [320, 400, 480] as const;

/**
 * Width of the live thumbnail in device pixels, rounded up to one of three
 * sizes so that a HiDPI screen gets a sharp frame without unbounded cache variants.
 */
export function thumbnailWidth(devicePixelRatio: number, uiScale: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const zoom = Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1;
  const needed = CARD_FRAME_CSS_WIDTH * dpr * zoom;
  return THUMBNAIL_WIDTHS.find((width) => width >= needed) ?? THUMBNAIL_WIDTHS[THUMBNAIL_WIDTHS.length - 1];
}

/** Same tolerance as the backend's position verification (preview.rs). */
export function frameTolerance(fps: number): number {
  return Number.isFinite(fps) && fps > 0 ? Math.max(1.5 / fps, 0.08) : 0.25;
}

export function thumbnailJob(time: number, exact: boolean, fps = 0) {
  const seconds = thumbnailTime(time, exact, fps);
  return { seconds, exact, key: `${exact ? "exact" : "grid"}:${seconds}` };
}
