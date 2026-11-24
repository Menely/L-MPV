/** Readiness must stay responsive even while initial playback is held on pause. */
export function playbackPollDelay(state: {
  path: string;
  paused: boolean;
  video_track?: boolean;
  has_video: boolean;
  video_ready: boolean;
}, hasMediaInfo: boolean): number {
  if (!state.path) return hasMediaInfo ? 1000 : 150;
  const awaitingOutput = state.video_track === undefined || (state.has_video && !state.video_ready);
  return state.paused && !awaitingOutput ? 1000 : 100;
}
