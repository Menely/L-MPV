export interface RingSegment { index: number; start: number; size: number }

/** Reserve equal gaps first, then distribute the remaining arc proportionally. */
export function cacheRingSegments(weights: readonly number[]): RingSegment[] {
  const positive = weights.map((weight, index) => ({ weight, index }))
    .filter(item => item.weight > 0 && Number.isFinite(item.weight));
  if (!positive.length) return [];
  const total = positive.reduce((sum, item) => sum + item.weight, 0);
  // Below one pixel at the smallest ring size, a slice would leave an empty-looking gap.
  // Keep those exact values in the table and in the continuous ring, without reserving gaps here.
  const visible = positive.filter(item => item.weight / total >= .003);
  if (!visible.length) visible.push(positive.reduce((a, b) => a.weight > b.weight ? a : b));
  const visibleTotal = visible.reduce((sum, item) => sum + item.weight, 0);
  const gap = visible.length > 1 ? Math.min(8, 180 / visible.length) : 0;
  const available = 360 - gap * visible.length;
  let start = gap / 2;
  return visible.map(item => {
    const size = item.weight / visibleTotal * available;
    const segment = { index: item.index, start, size };
    start += size + gap;
    return segment;
  });
}

export function roundedCacheArc(start: number, size: number): string {
  const end = start + size;
  const corner = Math.min(8, size / 3);
  const point = (radius: number, angle: number) => {
    const radians = angle * Math.PI / 180;
    return `${88 + radius * Math.cos(radians)} ${88 + radius * Math.sin(radians)}`;
  };
  const large = size - 2 * corner > 180 ? 1 : 0;
  return `M ${point(86, start + corner)} A 86 86 0 ${large} 1 ${point(86, end - corner)}
    Q ${point(86, end)} ${point(75, end)} Q ${point(64, end)} ${point(64, end - corner)}
    A 64 64 0 ${large} 0 ${point(64, start + corner)}
    Q ${point(64, start)} ${point(75, start)} Q ${point(86, start)} ${point(86, start + corner)} Z`;
}
