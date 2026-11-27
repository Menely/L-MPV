export interface RingSegment { index: number; start: number; size: number }

/**
 * Пропорциональное распределение дуг с одинаковыми зазорами.
 * Каждая ненулевая категория гарантированно получает видимый сектор,
 * благодаря чему даже микрокэши не исчезают и не ломают форму дуги.
 */
export function cacheRingSegments(weights: readonly number[]): RingSegment[] {
  const positive = weights
    .map((weight, index) => ({ weight, index }))
    .filter((item) => item.weight > 0 && Number.isFinite(item.weight));

  if (!positive.length) return [];
  if (positive.length === 1) {
    return [{ index: positive[0].index, start: 0, size: 360 }];
  }

  const count = positive.length;
  // Равный зазор между сегментами по окружности
  const gap = Math.min(4.5, Math.max(2.8, 32 / count));
  const available = 360 - gap * count;

  // Гарантированный минимальный угловой размер капсулы в градусах
  const minSize = Math.min(6.5, available / (count * 2.5));
  const totalWeight = positive.reduce((sum, item) => sum + item.weight, 0);

  const reserved = count * minSize;
  const pool = available - reserved;

  let currentStart = gap / 2;
  return positive.map((item) => {
    const share = totalWeight > 0 ? (item.weight / totalWeight) * pool : 0;
    const size = minSize + share;
    const segment = { index: item.index, start: currentStart, size };
    currentStart += size + gap;
    return segment;
  });
}

/**
 * Построение капсульной дуги с закруглёнными уголками без самопересечений.
 * Торцы сегментов строго радиальны, благодаря чему зазоры параллельны,
 * а соседние сегменты никогда не перекрываются и не смешиваются.
 */
export function roundedCacheArc(start: number, size: number): string {
  if (size <= 0) return "";
  const end = start + size;
  const large = size > 180 ? 1 : 0;

  const point = (radius: number, angleDeg: number) => {
    const radians = (angleDeg * Math.PI) / 180;
    const x = (88 + radius * Math.cos(radians)).toFixed(3);
    const y = (88 + radius * Math.sin(radians)).toFixed(3);
    return `${x} ${y}`;
  };

  // Радиус скругления уголков в пикселях (не более четверти внешней дуги)
  const outerArcPx = (86 * size * Math.PI) / 180;
  const r = Math.max(0.5, Math.min(3.5, outerArcPx / 4));

  // Угловой эквивалент скругления на внешнем (R=86) и внутреннем (R=64) радиусах
  const cOut = (r / 86) * (180 / Math.PI);
  const cIn = (r / 64) * (180 / Math.PI);

  const startOut = start + cOut;
  const endOut = end - cOut;
  const startIn = start + cIn;
  const endIn = end - cIn;

  // Если угловой размер достаточен для плавных уголков
  if (endOut > startOut && endIn > startIn) {
    return [
      `M ${point(86, startOut)}`,
      `A 86 86 0 ${large} 1 ${point(86, endOut)}`,
      `Q ${point(86, end)} ${point(86 - r, end)}`,
      `L ${point(64 + r, end)}`,
      `Q ${point(64, end)} ${point(64, endIn)}`,
      `A 64 64 0 ${large} 0 ${point(64, startIn)}`,
      `Q ${point(64, start)} ${point(64 + r, start)}`,
      `L ${point(86 - r, start)}`,
      `Q ${point(86, start)} ${point(86, startOut)}`,
      "Z",
    ].join(" ");
  }

  // Fallback для ультра-малых дуг: строгий сектор кольца без самопересечений
  return [
    `M ${point(86, start)}`,
    `A 86 86 0 ${large} 1 ${point(86, end)}`,
    `L ${point(64, end)}`,
    `A 64 64 0 ${large} 0 ${point(64, start)}`,
    "Z",
  ].join(" ");
}
