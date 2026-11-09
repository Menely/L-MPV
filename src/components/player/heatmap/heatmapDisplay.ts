import type { HeatmapDataResponse } from "./heatmapTypes";

/** Density follows the timeline's CSS width, independently of display scaling/DPR. */
export function getHeatmapColumnCount(width: number, sourceCount: number): number {
  if (!Number.isFinite(width) || width <= 0 || sourceCount <= 0) return 0;
  return Math.min(sourceCount, Math.max(1, Math.min(2048, Math.round(width * 512 / 1920))));
}

/** Duration-weighted averages: compressed bitrate or audio energy, never dB values. */
function aggregateIntervals(
  rates: number[], response: HeatmapDataResponse, width: number, timelineDuration: number,
): number[] {
  const step = response.step_duration_sec;
  const duration = timelineDuration > 0 ? timelineDuration : response.duration_sec;
  if (!rates.length || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(step) || step <= 0) return [];
  const count = getHeatmapColumnCount(width, rates.length);
  if (!count) return [];
  const prefix = new Float64Array(rates.length + 1);
  for (let i = 0; i < rates.length; i++) {
    const span = Math.max(0, Math.min(step, response.duration_sec - i * step));
    prefix[i + 1] = prefix[i] + Math.max(0, rates[i]) * span;
  }
  const integral = (time: number) => {
    const t = Math.max(0, Math.min(time, response.duration_sec));
    const i = Math.min(rates.length - 1, Math.floor(t / step));
    return prefix[i] + Math.max(0, rates[i]) * Math.min(step, Math.max(0, t - i * step));
  };
  const columns = Array.from({ length: count }, (_, i) => {
    const start = i * duration / count;
    const end = (i + 1) * duration / count;
    return (integral(end) - integral(start)) / (end - start);
  });
  return columns;
}

export function aggregateVideoBitrate(response: HeatmapDataResponse, width: number, duration: number): number[] {
  return response.metrics.type === "video_bitrate"
    ? aggregateIntervals(response.metrics.payload.bitrate_kbps, response, width, duration) : [];
}

export function prepareAudioDisplay(response: HeatmapDataResponse, width: number, duration: number): number[] {
  if (response.metrics.type !== "audio") return [];
  const energy = response.metrics.payload.rms_db.map(db => db <= -60 ? 0 : 10 ** (db / 10));
  return aggregateIntervals(energy, response, width, duration).map(value => {
    const db = value > 0 ? Math.max(-60, 10 * Math.log10(value)) : -60;
    return Math.round(Math.min(1, Math.max(0, (db + 60) / 60)) ** 0.8 * 255);
  });
}

/** Balanced scaling is based on visible interval averages, not isolated raw spikes. */
export function prepareVideoDisplay(response: HeatmapDataResponse, width: number, timelineDuration: number): number[] {
  if (response.metrics.type !== "video_bitrate") return response.visual_bins;
  const columns = aggregateVideoBitrate(response, width, timelineDuration);
  // Keep physical source detail; the display uses a fixed balanced scale.
  const sorted = columns.filter(rate => rate > 0).sort((a, b) => a - b);
  const reference = Math.max(1, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.985))] || 0);
  return columns.map(rate => Math.round(Math.pow(Math.min(1, Math.max(0, rate / reference)), 0.75) * 255));
}

/** One retained preparation per canvas; playback ticks do not rebuild/sort the profile. */
export function createHeatmapDisplayCache() {
  let cached: { response: HeatmapDataResponse; width: number; duration: number; values: number[] } | null = null;
  return (response: HeatmapDataResponse | null, width: number, duration: number) => {
    if (!response) { cached = null; return []; }
    const roundedWidth = Math.floor(width);
    if (!cached || cached.response !== response || cached.width !== roundedWidth || cached.duration !== duration) {
      const prepare = response.metrics.type === "audio" ? prepareAudioDisplay : prepareVideoDisplay;
      cached = { response, width: roundedWidth, duration, values: prepare(response, roundedWidth, duration) };
    }
    return cached.values;
  };
}
