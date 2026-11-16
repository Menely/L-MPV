/** Schematic Capsule layout: timeline and time above one grouped dock. */
export function CapsuleControlsPreview() {
  return (
    <div className="visual-bar-preview" aria-hidden="true">
      <div className="visual-bar-preview__screen">
        <div className="visual-bar-preview__glow" />
        <div className="visual-bar-preview__capsule-wrap">
          <div className="visual-bar-preview__capsule-top">
            <div className="visual-bar-preview__capsule-timeline">
              <div className="visual-bar-preview__progress" style={{ width: "45%" }} />
            </div>
            <div className="visual-bar-preview__capsule-time" />
          </div>
          <div className="visual-bar-preview__capsule-islands">
            <span className="visual-bar-preview__capsule-group" />
            <div className="visual-bar-preview__btn-play" />
            <span className="visual-bar-preview__capsule-group visual-bar-preview__capsule-group--right" />
          </div>
        </div>
      </div>
    </div>
  );
}
