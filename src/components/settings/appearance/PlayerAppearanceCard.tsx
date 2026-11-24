import { useEffect, useRef, useSyncExternalStore } from "react";
import { PanelBottom } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";
import { SelectionRail } from "../../motion/SelectionRail";
import { SettingsIcon } from "../components/SettingsIcon";
import { CapsuleControlsPreview } from "../components/CapsuleControlsPreview";
import { AppearanceDetailsScroll } from "./AppearanceDetailsScroll";
import { PlayerStyleDetails } from "./PlayerStyleDetails";
import { getPlayerTheme, setPlayerTheme, subscribePlayerTheme } from "../../../features/liquidGlass/preferences";
import { getSavedControlBarStyle, saveControlBarStyle as saveThemeControlBarStyle } from "../../../utils/controlBarStyleUtils";
import type { PlayerAppearanceProps } from "./appearanceTypes";
import "../../../styles/player-appearance-settings.css";

const getGlassStyle = () => getSavedControlBarStyle("glass");

export function PlayerAppearanceCard(props: PlayerAppearanceProps) {
  const { dict } = useTranslation();
  const { controlBarStyle, setControlBarStyle, saveControlBarStyle } = props;
  const theme = useSyncExternalStore(subscribePlayerTheme, getPlayerTheme);
  const glassStyle = useSyncExternalStore(subscribePlayerTheme, getGlassStyle);
  const activeStyle = theme === "glass" ? glassStyle : controlBarStyle;
  const classicStyle = useRef<"modern" | "docked">(activeStyle === "docked" ? "docked" : "modern");
  useEffect(() => {
    if (activeStyle !== "capsule") classicStyle.current = activeStyle;
  }, [activeStyle]);
  const chooseStyle = (style: typeof controlBarStyle) => {
    setControlBarStyle(style);
    if (theme === "glass") {
      saveThemeControlBarStyle(style, "glass");
      return;
    }
    saveControlBarStyle(style);
  };
  const classic = activeStyle !== "capsule";
  const previewDocked = (classic ? activeStyle : classicStyle.current) === "docked";
  return (
    <section
      className={`option-card player-appearance ${theme === "glass" ? "player-appearance--glass" : ""}`}
      aria-label={dict.settings.appearance.controlBarStyleTitle}
    >
      <div className="player-appearance__header">
        <div className="row-center row-gap-3"><SettingsIcon><PanelBottom size={16} /></SettingsIcon>
          <span className="t-label">{dict.settings.appearance.controlBarStyleTitle}</span>
        </div>
      </div>
      <div className="player-appearance__body">
        <div className="player-appearance__selector">
          <SelectionRail activeKey={theme} className="media-info__tabs player-appearance__themes" role="tablist" aria-label={dict.settings.appearance.interfaceTheme}>
            <button type="button" className={`media-info__tab-btn ${theme === "lmpv" ? "media-info__tab-btn--active" : ""}`} role="tab" aria-selected={theme === "lmpv"} onClick={() => setPlayerTheme("lmpv")}>L-MPV</button>
            <button type="button" className={`media-info__tab-btn ${theme === "glass" ? "media-info__tab-btn--active" : ""}`} role="tab" aria-selected={theme === "glass"} onClick={() => setPlayerTheme("glass")}>Liquid Glass</button>
          </SelectionRail>
          <div className="player-appearance__styles" role="group" aria-label={dict.settings.appearance.controlBarStyleTitle}>
            <button type="button" className="player-appearance__style" aria-pressed={!classic} onClick={() => chooseStyle("capsule")}>
              <CapsuleControlsPreview />
              <span className="visual-bar-card__label">Capsule</span>
            </button>
            <button type="button" className="player-appearance__style" aria-pressed={classic} onClick={() => chooseStyle(classicStyle.current)}>
              <div className="visual-bar-preview" aria-hidden="true"><div className="visual-bar-preview__screen"><div className="visual-bar-preview__glow" />
                {previewDocked ? (
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
              <button type="button" className="compact-segment-btn" aria-pressed={activeStyle === "modern"} onClick={() => chooseStyle("modern")}>{dict.settings.appearance.panelFloating}</button>
              <button type="button" className="compact-segment-btn" aria-pressed={activeStyle === "docked"} onClick={() => chooseStyle("docked")}>{dict.settings.appearance.panelDocked}</button>
            </div>
          </div>}
          <PlayerStyleDetails {...props} theme={theme} />
        </AppearanceDetailsScroll>
      </div>
    </section>
  );
}
