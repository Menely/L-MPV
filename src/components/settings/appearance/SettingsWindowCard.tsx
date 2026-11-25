import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";
import { SelectionRail } from "../../motion/SelectionRail";
import { getSavedUiSettingsStyle, saveUiSettingsStyle, type UiSettingsStyle } from "../../../theme/tokens";
import { AppearanceSetting } from "./AppearanceSetting";

export function SettingsWindowCard() {
  const { dict } = useTranslation();
  const labels = dict.settings.appearance.settingsWindow;
  const [settingsStyle, setSettingsStyle] = useState<UiSettingsStyle>(getSavedUiSettingsStyle);
  useEffect(() => {
    const handler = () => setSettingsStyle(getSavedUiSettingsStyle());
    window.addEventListener("l-mpv-ui-settings-style-changed", handler);
    return () => window.removeEventListener("l-mpv-ui-settings-style-changed", handler);
  }, []);
  return (
    <div className="option-card player-appearance-window">
      <AppearanceSetting title={labels.title} icon={<SlidersHorizontal size={16} />}
        resetTitle={labels.resetTitle} changed={settingsStyle !== "modal"} onReset={() => saveUiSettingsStyle("modal")}>
        <SelectionRail activeKey={settingsStyle} className="settings-window-compact-grid" role="group" aria-label={labels.title}>
          <button type="button" className="compact-segment-btn" aria-pressed={settingsStyle === "sidebar"} onClick={() => saveUiSettingsStyle("sidebar")}>{labels.sidebar}</button>
          <button type="button" className="compact-segment-btn" aria-pressed={settingsStyle === "modal"} onClick={() => saveUiSettingsStyle("modal")}>{labels.modal}</button>
        </SelectionRail>
      </AppearanceSetting>
    </div>
  );
}
