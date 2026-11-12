/** Keep transport-independent request keys aligned with the backend's 1s grid. */
export function thumbnailTime(seconds: number, exact: boolean): number {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return exact ? Math.round(safe * 1000) / 1000 : Math.floor(safe);
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

/** Include UHD/DCI and cropped widescreen or portrait 4K sources. */
export function supportsTrickplaySize(width: number, height: number): boolean {
  return width > 0 && height > 0 && (Math.max(width, height) >= 3840 || Math.min(width, height) >= 2160);
}

export function thumbnailJob(time: number, exact: boolean) {
  const seconds = thumbnailTime(time, exact);
  return { seconds, exact, key: `${exact ? "exact" : "grid"}:${seconds}` };
}
