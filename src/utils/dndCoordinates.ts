/** dnd-kit measures viewport pixels; CSS translations inside zoom use local pixels. */
export function toLocalDragTransform<T extends { x: number; y: number }>(
  transform: T | null,
  scale: number,
): T | null {
  if (!transform) return null;
  const zoom = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return { ...transform, x: transform.x / zoom, y: transform.y / zoom };
}
