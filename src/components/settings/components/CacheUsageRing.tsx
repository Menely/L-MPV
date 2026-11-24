import type { CSSProperties } from "react";
import { cacheRingSegments, roundedCacheArc } from "../lib/cacheRingGeometry";

export interface CacheSlice { id: string; bytes: number; color: string }

/** Colored arc lengths remain proportional after reserving equal Capsule gaps. */
export function CacheUsageRing({ slices, total, label, value }: {
  slices: CacheSlice[]; total: number; label: string; value: string;
}) {
  let offset = 0;
  const positive = slices.filter(slice => slice.bytes > 0);
  const capsule = cacheRingSegments(positive.map(slice => slice.bytes));
  return <div className="system-cache-ring" aria-hidden="true">
    <svg viewBox="0 0 176 176" className="system-cache-ring__arcs">
      {total === 0 && <circle cx="88" cy="88" r="75" className="system-cache-ring__empty" />}
      {positive.map(slice => {
        const start = offset;
        const size = slice.bytes / total * 100;
        offset += size;
        return <circle key={slice.id} cx="88" cy="88" r="75" pathLength="100"
          className="system-cache-ring__segment" style={{
            stroke: slice.color, "--segment-size": size, "--segment-offset": start,
          } as CSSProperties} />;
      })}
      {capsule.map(segment => capsule.length === 1
        ? <circle key={segment.index} className="system-cache-ring__capsule" cx="88" cy="88" r="75" stroke={positive[segment.index].color} />
        : <path key={segment.index} className="system-cache-ring__capsule" d={roundedCacheArc(segment.start, segment.size)} fill={positive[segment.index].color} />)}
    </svg>
    <div className="system-cache-ring__center"><span>{label}</span><strong>{value}</strong></div>
  </div>;
}
