import type { CSSProperties } from "react";
import { cacheRingSegments, roundedCacheArc } from "../lib/cacheRingGeometry";

export interface CacheSlice {
  id: string;
  bytes: number;
  color: string;
  name?: string;
  formattedSize?: string;
}

/**
 * Интерактивное кольцо кэша с эффектом выдвижения сегмента (Arc Pop-out) при наведении.
 */
export function CacheUsageRing({
  slices,
  total,
  label,
  value,
  hoveredId,
  onHoverSlice,
}: {
  slices: CacheSlice[];
  total: number;
  label: string;
  value: string;
  hoveredId?: string | null;
  onHoverSlice?: (id: string | null) => void;
}) {
  let offset = 0;
  const positive = slices.filter((slice) => slice.bytes > 0);
  const capsule = cacheRingSegments(positive.map((slice) => slice.bytes));

  const POP_OUT_DISTANCE = 5;

  const activeSlice = positive.find((s) => s.id === hoveredId);
  const hasHover = Boolean(activeSlice);

  return (
    <div
      className={`system-cache-ring ${hasHover ? "has-hover" : ""}`}
      aria-hidden="true"
      onMouseLeave={() => onHoverSlice?.(null)}
    >
      <svg
        viewBox="0 0 176 176"
        className={`system-cache-ring__arcs ${hasHover ? "has-hover" : ""}`}
      >
        {total === 0 && (
          <circle cx="88" cy="88" r="75" className="system-cache-ring__empty" />
        )}

        {/* Обычный режим (Modern / Classic) */}
        {positive.map((slice) => {
          const start = offset;
          const size = (slice.bytes / total) * 100;
          offset += size;

          const midPercent = start + size / 2;
          const midAngleDeg = (midPercent / 100) * 360;
          const rad = (midAngleDeg * Math.PI) / 180;
          const isPopped = hoveredId === slice.id;
          const dx = isPopped ? Math.cos(rad) * POP_OUT_DISTANCE : 0;
          const dy = isPopped ? Math.sin(rad) * POP_OUT_DISTANCE : 0;

          return (
            <circle
              key={slice.id}
              cx="88"
              cy="88"
              r="75"
              pathLength="100"
              className={`system-cache-ring__segment ${isPopped ? "is-popped" : ""}`}
              onMouseEnter={() => onHoverSlice?.(slice.id)}
              style={
                {
                  stroke: slice.color,
                  "--segment-size": size,
                  "--segment-offset": start,
                  "--pop-color": slice.color,
                  transform: isPopped ? `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)` : undefined,
                } as CSSProperties
              }
            />
          );
        })}

        {/* Капсульный режим (Capsule) */}
        {capsule.map((segment) => {
          const slice = positive[segment.index];
          if (!slice) return null;

          const midAngleDeg = segment.start + segment.size / 2;
          const rad = (midAngleDeg * Math.PI) / 180;
          const isPopped = hoveredId === slice.id;
          const dx = isPopped ? Math.cos(rad) * POP_OUT_DISTANCE : 0;
          const dy = isPopped ? Math.sin(rad) * POP_OUT_DISTANCE : 0;

          return capsule.length === 1 ? (
            <circle
              key={segment.index}
              className={`system-cache-ring__capsule ${isPopped ? "is-popped" : ""}`}
              cx="88"
              cy="88"
              r="75"
              stroke={slice.color}
              onMouseEnter={() => onHoverSlice?.(slice.id)}
              style={
                {
                  "--pop-color": slice.color,
                  transform: isPopped ? `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)` : undefined,
                } as CSSProperties
              }
            />
          ) : (
            <path
              key={segment.index}
              className={`system-cache-ring__capsule ${isPopped ? "is-popped" : ""}`}
              d={roundedCacheArc(segment.start, segment.size)}
              fill={slice.color}
              onMouseEnter={() => onHoverSlice?.(slice.id)}
              style={
                {
                  "--pop-color": slice.color,
                  transform: isPopped ? `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)` : undefined,
                } as CSSProperties
              }
            />
          );
        })}
      </svg>

      <div className="system-cache-ring__center">
        {activeSlice ? (
          <>
            <span
              className="system-cache-ring__center-cat"
              style={{ color: activeSlice.color }}
            >
              {activeSlice.name || label}
            </span>
            <strong className="system-cache-ring__center-val">
              {activeSlice.formattedSize || value}
            </strong>
            <span className="system-cache-ring__center-pct">
              {total > 0 ? `${((activeSlice.bytes / total) * 100).toFixed(1)}%` : ""}
            </span>
          </>
        ) : (
          <>
            <span>{label}</span>
            <strong>{value}</strong>
          </>
        )}
      </div>
    </div>
  );
}
