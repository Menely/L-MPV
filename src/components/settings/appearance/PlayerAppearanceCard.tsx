import { useEffect, useRef, useState } from "react";
import { PanelBottom, RotateCcw } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";
import { SelectionRail } from "../../motion/SelectionRail";
import { SettingsIcon } from "../components/SettingsIcon";
import { CapsuleControlsPreview } from "../components/CapsuleControlsPreview";
import { AppearanceDetailsScroll } from "./AppearanceDetailsScroll";
import { PlayerStyleDetails } from "./PlayerStyleDetails";
import { GlassBlurSetting } from "../../../features/liquidGlass/GlassBlurSetting";
import type { PlayerAppearanceProps } from "./appearanceTypes";
import { getPlayerTheme, setPlayerTheme, type PlayerTheme } from "../../../features/liquidGlass/preferences";
import "../../../styles/player-appearance-settings.css";

export function PlayerAppearanceCard(props: PlayerAppearanceProps) {
  const { dict } = useTranslation();
  const { controlBarStyle, setControlBarStyle, saveControlBarStyle } = props;
  const [theme, setTheme] = useState(getPlayerTheme);
  const classicStyles = useRef<Record<PlayerTheme, "modern" | "docked">>({ lmpv: "modern", glass: "modern" });
  useEffect(() => {
    if (controlBarStyle !== "capsule") classicStyles.current[theme] = controlBarStyle;
  }, [theme, controlBarStyle]);
  useEffect(() => {
    const sync = () => setTheme(getPlayerTheme());
    window.addEventListener("l-mpv-settings-changed", sync);
    return () => window.removeEventListener("l-mpv-settings-changed", sync);
  }, []);
  const selectTheme = (next: PlayerTheme) => {
    if (next !== theme) setPlayerTheme(next);
  };
  const chooseStyle = (style: typeof controlBarStyle) => {
    setControlBarStyle(style);
    saveControlBarStyle(style);
  };
  const classic = controlBarStyle !== "capsule";
  return (
    <section className="option-card player-appearance" aria-label={dict.settings.appearance.controlBarStyleTitle}>
      <div className="player-appearance__header">
        <div className="row-center row-gap-3"><SettingsIcon><PanelBottom size={16} /></SettingsIcon>
          <span className="t-label">{dict.settings.appearance.controlBarStyleTitle}</span>
          <button type="button" className="btn btn--secondary btn--sm player-appearance__reset"
            data-reset-hidden={controlBarStyle === "modern"} disabled={controlBarStyle === "modern"} tabIndex={controlBarStyle === "modern" ? -1 : 0} title={dict.settings.appearance.resetModern}
            aria-label={dict.settings.appearance.resetModern} onClick={() => chooseStyle("modern")}>
            <RotateCcw size={11} />
          </button></div>
      </div>
      <div className="player-appearance__body">
        <div className="player-appearance__selector">
        <SelectionRail activeKey={theme} className="media-info__tabs player-appearance__themes" role="tablist" aria-label={dict.settings.appearance.interfaceTheme}>
          <button type="button" className={`media-info__tab-btn ${theme === "lmpv" ? "media-info__tab-btn--active" : ""}`} role="tab" aria-selected={theme === "lmpv"} onClick={() => selectTheme("lmpv")}>L-MPV</button>
          <button type="button" className={`media-info__tab-btn ${theme === "glass" ? "media-info__tab-btn--active" : ""}`} role="tab" aria-selected={theme === "glass"} onClick={() => selectTheme("glass")}>Liquid Glass</button>
        </SelectionRail>
        <div className="player-appearance__styles" role="group" aria-label={dict.settings.appearance.controlBarStyleTitle}>
          <button type="button" className="player-appearance__style" aria-pressed={!classic} onClick={() => chooseStyle("capsule")}>
            <CapsuleControlsPreview />
            <span className="visual-bar-card__label">Capsule</span>
          </button>
          <button type="button" className="player-appearance__style" aria-pressed={classic} onClick={() => chooseStyle(classicStyles.current[theme])}>
            <div className="visual-bar-preview" aria-hidden="true"><div className="visual-bar-preview__screen"><div className="visual-bar-preview__glow" />
              {(classic ? controlBarStyle : classicStyles.current[theme]) === "docked" ? (
                <div className="visual-bar-preview__docked-bar">
                  <div className="visual-bar-preview__docked-timeline"><div className="visual-bar-preview__progress" style={{ width: "45%" }} /></div>
                  <div className="visual-bar-preview__docked-controls"><div className="visual-bar-preview__btn-play" /><div className="visual-bar-preview__line" /><div className="visual-bar-preview__dot" /></div>
                </div>
              ) : (
                <div className="visual-bar-preview__floating-island"><div className="visual-bar-preview__btn-play" /><div className="visual-bar-preview__track"><div className="visual-bar-preview__progress" style={{ width: "45%" }} /></div><div className="visual-bar-preview__dot" /></div>
              )}
            </div></div>
            <span className="visual-bar-card__label">Classic</span>
          </button>
        </div>
        </div>
        <AppearanceDetailsScroll hidden={false} label={dict.settings.appearance.controlBarStyleTitle}>
          {classic && <div className="player-appearance__setting">
            <span className="t-label">{dict.settings.appearance.panelPlacement}</span>
            <div className="settings-window-compact-grid" role="group" aria-label={dict.settings.appearance.panelPlacement}>
              <button type="button" className="compact-segment-btn" aria-pressed={controlBarStyle === "modern"} onClick={() => chooseStyle("modern")}>{dict.settings.appearance.panelFloating}</button>
              <button type="button" className="compact-segment-btn" aria-pressed={controlBarStyle === "docked"} onClick={() => chooseStyle("docked")}>{dict.settings.appearance.panelDocked}</button>
            </div>
          </div>}
          {theme === "glass" && <GlassBlurSetting />}
          <PlayerStyleDetails {...props} />
        </AppearanceDetailsScroll>
      </div>
    </section>
  );
}
