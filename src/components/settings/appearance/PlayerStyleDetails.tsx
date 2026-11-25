import type { CSSProperties } from "react";
import { Clock, SlidersHorizontal, Timer } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";
import { SelectionRail } from "../../motion/SelectionRail";
import { TIME_POSITION_OPTIONS } from "../../../utils/timePositionUtils";
import { TIME_FORMAT_OPTIONS } from "../../../utils/timeFormatUtils";
import { DEFAULT_UI_OPACITY } from "../../../theme/tokens";
import {
  GlassBlurSetting,
  GlassDispersionSetting,
  GlassRefractionSetting,
} from "../../../theme/liquidGlass/ClassicAppearance";
import type { PlayerTheme } from "../../../theme/liquidGlass/preferences";
import { AppearanceSetting } from "./AppearanceSetting";
import type { PlayerAppearanceProps } from "./appearanceTypes";

export function PlayerStyleDetails(props: PlayerAppearanceProps & { theme?: PlayerTheme }) {
  const { dict } = useTranslation();
  const labels = dict.settings.appearance;
  const { uiOpacity, setUiOpacity, saveUiOpacity, timePosition, setTimePosition,
    saveTimePosition, timeFormat, setTimeFormat, saveTimeFormat, theme = "lmpv" } = props;
  const opacityChanged = Math.abs(uiOpacity - DEFAULT_UI_OPACITY) > 0.005;
  const changeOpacity = (value: number) => { setUiOpacity(value); saveUiOpacity(value); };
  const positions = {
    timeline_left: labels.timePosLeft, timeline_right: labels.timePosRight,
    volume_right: labels.timePosSound, toolbar_right: labels.timePosToolbar,
    timeline_floating_center: labels.timePosCenter, titlebar: "Titlebar",
  };
  const percentage = Math.round((uiOpacity - 0.1) / 0.9 * 100);
  return (<>
    {theme === "glass" ? (
      <>
        <GlassBlurSetting />
        <GlassRefractionSetting />
        <GlassDispersionSetting />
      </>
    ) : (
      <AppearanceSetting title={labels.opacityLabel} icon={<SlidersHorizontal size={16} />}
        resetTitle={labels.reset88} changed={opacityChanged} onReset={() => changeOpacity(DEFAULT_UI_OPACITY)}>
        <div className="player-appearance__opacity">
          <input type="range" min={0.1} max={1} step={0.01} value={uiOpacity}
            onChange={event => changeOpacity(Number(event.target.value))} className="ui-premium-slider"
            style={{ "--track-fill": `linear-gradient(to right, var(--accent) ${percentage}%, var(--border-hover) ${percentage}%)` } as CSSProperties}
            aria-label={labels.opacityAria} aria-valuetext={`${Math.round(uiOpacity * 100)}%`} />
          <output className="t-label-accent">{Math.round(uiOpacity * 100)}%</output>
        </div>
      </AppearanceSetting>
    )}
    <AppearanceSetting title={labels.timePositionTitle} icon={<Clock size={16} />}
      resetTitle={labels.resetRight} changed={timePosition !== "timeline_right"}
      onReset={() => { setTimePosition("timeline_right"); saveTimePosition("timeline_right"); }}>
      <SelectionRail activeKey={timePosition} className="time-pos-compact-grid" role="group" aria-label={labels.timePositionTitle}>
        {TIME_POSITION_OPTIONS.map(option => <button key={option.id} type="button"
          className="compact-segment-btn" aria-pressed={timePosition === option.id}
          onClick={() => { setTimePosition(option.id); saveTimePosition(option.id); }}>
          {positions[option.id]}
        </button>)}
      </SelectionRail>
    </AppearanceSetting>
    <AppearanceSetting title={labels.timeFormatTitle} icon={<Timer size={16} />}
      resetTitle={labels.resetElapsedTotal} changed={timeFormat !== "elapsed_total"}
      onReset={() => { setTimeFormat("elapsed_total"); saveTimeFormat("elapsed_total"); }}>
      <SelectionRail activeKey={timeFormat} className="time-format-compact-grid" role="group" aria-label={labels.timeFormatTitle}>
        {TIME_FORMAT_OPTIONS.map(option => <button key={option.id} type="button"
          className="compact-segment-btn compact-segment-btn--mono" aria-pressed={timeFormat === option.id}
          onClick={() => { setTimeFormat(option.id); saveTimeFormat(option.id); }}>
          {option.id === "finish_time" ? labels.timeFormatEndsAt("22:15") : option.example}
        </button>)}
      </SelectionRail>
    </AppearanceSetting>
  </>);
}
