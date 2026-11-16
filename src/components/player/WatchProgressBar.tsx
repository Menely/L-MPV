import { usePlayerProgress } from "../../contexts/PlayerStateContext";

export function WatchProgressBar({ percent }: { percent: number }) {
  if (!Number.isFinite(percent) || percent < 0.5) return null;
  const watched = percent >= 90;
  return <div className="playlist-item__progress-track" aria-hidden="true">
    <div className={`playlist-item__progress-fill${watched ? " playlist-item__progress-fill--watched" : ""}`}
      style={{ width: `${watched ? 100 : Math.min(100, Math.max(0, percent))}%` }} />
  </div>;
}

/** Only the current row subscribes to frequent playback updates. */
export function LiveWatchProgressBar({ fallback }: { fallback: number }) {
  const { position, duration } = usePlayerProgress();
  return <WatchProgressBar percent={duration > 0 ? position / duration * 100 : fallback} />;
}
