import type { CSSProperties } from "react";

export interface CacheSlice { id: string; bytes: number; color: string }

function roundedSegment(start: number, size: number): string {
  const gap = Math.min(8, size * .35);
  const from = start + gap / 2;
  const to = start + size - gap / 2;
  const corner = Math.min(8, (to - from) / 3);
  const point = (radius: number, angle: number) => {
    const radians = angle * Math.PI / 180;
    return `${88 + radius * Math.cos(radians)} ${88 + radius * Math.sin(radians)}`;
  };
  const large = to - from - 2 * corner > 180 ? 1 : 0;
  return `M ${point(86, from + corner)} A 86 86 0 ${large} 1 ${point(86, to - corner)}
    Q ${point(86, to)} ${point(75, to)} Q ${point(64, to)} ${point(64, to - corner)}
    A 64 64 0 ${large} 0 ${point(64, from + corner)}
    Q ${point(64, from)} ${point(75, from)} Q ${point(86, from)} ${point(86, from + corner)} Z`;
}

/** Capsule arcs stay inside their proportional sectors, including very small categories. */
export function CacheUsageRing({ slices, total, label, value }: {
  slices: CacheSlice[]; total: number; label: string; value: string;
}) {
  let offset = 0;
  return <div className="system-cache-ring" aria-hidden="true">
    <svg viewBox="0 0 176 176" className="system-cache-ring__arcs">
      {total === 0 && <circle cx="88" cy="88" r="75" className="system-cache-ring__empty" />}
      {slices.filter(slice => slice.bytes > 0).map(slice => {
        const start = offset;
        const size = slice.bytes / total * 100;
        offset += size;
        return <g key={slice.id}>
          <circle cx="88" cy="88" r="75" pathLength="100"
          className="system-cache-ring__segment" style={{
            stroke: slice.color, "--segment-size": size, "--segment-offset": start,
          } as CSSProperties} />
          <path className="system-cache-ring__capsule" d={roundedSegment(start * 3.6, size * 3.6)} fill={slice.color} />
        </g>;
      })}
    </svg>
    <div className="system-cache-ring__center"><span>{label}</span><strong>{value}</strong></div>
  </div>;
}
