import type { ControlBarStyle } from "../../../utils/controlBarStyleUtils";
import type { TimeDisplayPosition } from "../../../utils/timePositionUtils";
import type { TimeFormatMode } from "../../../utils/timeFormatUtils";

export interface PlayerAppearanceProps {
  controlBarStyle: ControlBarStyle;
  setControlBarStyle: (style: ControlBarStyle) => void;
  saveControlBarStyle: (style: ControlBarStyle) => void;
  uiOpacity: number;
  setUiOpacity: (value: number) => void;
  saveUiOpacity: (value: number) => void;
  timePosition: TimeDisplayPosition;
  setTimePosition: (value: TimeDisplayPosition) => void;
  saveTimePosition: (value: TimeDisplayPosition) => void;
  timeFormat: TimeFormatMode;
  setTimeFormat: (value: TimeFormatMode) => void;
  saveTimeFormat: (value: TimeFormatMode) => void;
}
