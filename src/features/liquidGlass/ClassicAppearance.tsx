import { useSyncExternalStore, type CSSProperties } from "react";
import { useTranslation } from "../../i18n/LanguageContext";
import { getSavedControlBarStyle, saveControlBarStyle } from "../../utils/controlBarStyleUtils";
import { getGlassBlur, saveGlassBlur, subscribePlayerTheme } from "./preferences";

const getDocked = () => getSavedControlBarStyle("glass") === "docked";

export function ClassicChoice() {
  const docked = useSyncExternalStore(subscribePlayerTheme, getDocked);
  return (
    <div className="player-appearance__styles">
      <div className="player-appearance__style" aria-current="true" data-glass-classic-preview="">
        <div className="visual-bar-preview" aria-hidden="true">
          <div className="visual-bar-preview__screen">
            <div className={docked ? "visual-bar-preview__docked-bar" : "visual-bar-preview__floating-island"}>
              <div className="visual-bar-preview__btn-play" />
              <div className="visual-bar-preview__track"><div className="visual-bar-preview__progress" style={{ width: "45%" }} /></div>
              <div className="visual-bar-preview__dot" />
            </div>
          </div>
        </div>
        <span className="visual-bar-card__label">Classic</span>
      </div>
    </div>
  );
}

export function ClassicSettings() {
  const { dict } = useTranslation();
  const labels = dict.settings.appearance;
  const docked = useSyncExternalStore(subscribePlayerTheme, getDocked);
  const blur = useSyncExternalStore(subscribePlayerTheme, getGlassBlur);
  return (
    <>
      <div className="player-appearance__setting">
        <span className="t-label">{labels.panelPlacement}</span>
        <div className="settings-window-compact-grid" role="group" aria-label={labels.panelPlacement}>
          <button type="button" className="compact-segment-btn" aria-pressed={!docked}
            onClick={() => saveControlBarStyle("modern", "glass")}>{labels.panelFloating}</button>
          <button type="button" className="compact-segment-btn" aria-pressed={docked}
            onClick={() => saveControlBarStyle("docked", "glass")}>{labels.panelDocked}</button>
        </div>
      </div>
      <div className="player-appearance__setting">
        <span className="t-label">{labels.glassBlur}</span>
        <div className="player-appearance__opacity">
          <input type="range" min={0} max={100} value={blur} className="ui-premium-slider"
            onChange={(event) => saveGlassBlur(Number(event.currentTarget.value))}
            style={{ "--track-fill": `linear-gradient(to right, var(--accent) ${blur}%, var(--border-hover) ${blur}%)` } as CSSProperties}
            aria-label={labels.glassBlur} aria-valuetext={`${blur}%`} />
          <output className="t-label-accent">{blur}%</output>
        </div>
      </div>
    </>
  );
}
