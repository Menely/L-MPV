import { memo, useId } from "react";

interface BitrateSparklineProps {
  /** История точек битрейта в бит/с. */
  data: number[];
}

const WIDTH = 80;
const HEIGHT = 15;

/**
 * Мемоизированный векторный SVG Sparkline-график колебаний битрейта.
 * Изолирован от частых ререндеров родительских компонентов воспроизведения.
 */
export const BitrateSparkline = memo(function BitrateSparkline({
  data,
}: BitrateSparklineProps) {
  const gradientId = useId();

  if (!data || data.length < 2) return null;

  const validData = data.filter((v) => Number.isFinite(v) && v > 0);
  if (validData.length < 2) return null;

  const min = Math.min(...validData) * 0.95;
  const max = Math.max(...validData) * 1.05;
  if (!Number.isFinite(max) || max <= 0) return null;
  const range = max - min || 1;

  const points = validData.map((val, idx) => {
    const x = (idx / (validData.length - 1)) * WIDTH;
    const y = HEIGHT - ((val - min) / range) * (HEIGHT - 4) - 2;
    return { x, y };
  });

  const pathD = points.reduce(
    (acc, pt, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`,
    "",
  );
  const areaD = `${pathD} L ${WIDTH},${HEIGHT} L 0,${HEIGHT} Z`;
  const lastPoint = points[points.length - 1];

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="media-info__sparkline"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent, #6366f1)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--accent, #6366f1)" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path
        d={pathD}
        fill="none"
        stroke="var(--accent, #6366f1)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={lastPoint.x.toFixed(1)}
        cy={lastPoint.y.toFixed(1)}
        r="2"
        fill="var(--accent, #6366f1)"
        className="media-info__sparkline-dot"
      />
    </svg>
  );
});

BitrateSparkline.displayName = "BitrateSparkline";
