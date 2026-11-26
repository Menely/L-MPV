import { VolumeMorphIcon } from "../controls/VolumeMorphIcon";

interface VolumeOsdCardProps {
  volume: number;
  label: string;
  closing: boolean;
}

/** Компактный режим отображения громкости в стиле углового Glass HUD. */
export function VolumeOsdCard({ volume, label, closing }: VolumeOsdCardProps) {
  const isMuted = volume === 0;
  const isBoosted = volume > 100;
  const fillPercent = Math.min(100, volume);

  return (
    <div
      className={`volume-feedback-osd${closing ? " volume-feedback-osd--closing" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="volume-feedback-osd__icon-slot">
        <VolumeMorphIcon
          volume={volume}
          size={19}
          className={`volume-feedback-osd__icon ${
            isMuted
              ? "volume-feedback-osd__icon--muted"
              : "volume-feedback-osd__icon--accent"
          }`}
        />
      </div>
      <div className="volume-feedback-osd__content">
        <div className="volume-feedback-osd__text">
          <span className="volume-feedback-osd__label">{label}</span>
          <span
            className={`volume-feedback-osd__value${
              isBoosted ? " volume-feedback-osd__value--boost" : ""
            }`}
          >
            {Math.round(volume)}%
          </span>
        </div>
        <div className="volume-feedback-osd__bar-track" aria-hidden="true">
          <div
            className={`volume-feedback-osd__bar-fill${
              isBoosted ? " volume-feedback-osd__bar-fill--boost" : ""
            }`}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
