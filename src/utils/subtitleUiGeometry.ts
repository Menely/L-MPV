/** Coordinates are viewport CSS pixels, including the player's CSS zoom. */
export function subtitleControlsOffset(height: number, unscaledHeight: number, bottom: number): number {
  if (!Number.isFinite(height) || height <= 0 || unscaledHeight <= 0) return 0;
  const scale = height / unscaledHeight;
  return Math.ceil(height + (Math.max(0, bottom) + 12) * scale);
}
