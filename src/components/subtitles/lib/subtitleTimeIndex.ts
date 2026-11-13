import type { SubtitleLine } from "../subtitleTypes";

/** Immutable time index. Rebuilt only when lines change, not on playback ticks. */
export function createSubtitleTimeIndex(lines: readonly SubtitleLine[]) {
  const byIndex = new Map<number, SubtitleLine>();
  for (const line of lines) if (!byIndex.has(line.index)) byIndex.set(line.index, line);
  const ordered = lines.map((line, order) => ({ line, order }))
    .sort((a, b) => a.line.start - b.line.start || a.order - b.order);
  let size = 1;
  while (size < ordered.length) size *= 2;
  const maxEnd = new Float64Array(size * 2).fill(-Infinity);
  for (let i = 0; i < ordered.length; i++) maxEnd[size + i] = ordered[i].line.end;
  for (let i = size - 1; i > 0; i--) maxEnd[i] = Math.max(maxEnd[i * 2], maxEnd[i * 2 + 1]);
  const chronological = lines.every((line, i) => i === 0 || line.start >= lines[i - 1].start);
  const upperBound = (time: number) => {
    let low = 0, high = ordered.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (ordered[mid].line.start <= time) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  return {
    get: (index: number) => byIndex.get(index),
    active(time: number): SubtitleLine[] {
      const until = upperBound(time);
      const matches: typeof ordered = [];
      const visit = (node: number, left: number, right: number) => {
        if (left >= until || maxEnd[node] <= time) return;
        if (right - left === 1) {
          const entry = ordered[left];
          if (entry && time >= entry.line.start && time < entry.line.end) matches.push(entry);
          return;
        }
        const mid = (left + right) >>> 1;
        visit(node * 2, left, mid);
        visit(node * 2 + 1, mid, right);
      };
      visit(1, 0, size);
      // Preserve original stable ordering before the existing overlap comparator.
      return matches.sort((a, b) => a.order - b.order).map(entry => entry.line);
    },
    lastStarted(time: number): number {
      if (chronological) return ordered[upperBound(time) - 1]?.line.index ?? -1;
      // Preserve the existing fallback for unusual imported unsorted lists.
      let index = -1;
      for (const line of lines) {
        if (line.start <= time) index = line.index;
        else if (index !== -1 && line.start > time + .05) break;
      }
      return index;
    },
  };
}
