import React from "react";
import type { ControlsLayoutProps } from "./types";
import { TimeDisplay } from "../TimeDisplay";
import { AudioVisualizer } from "../AudioVisualizer";

/**
 * Модульное представление панели управления для стиля «Модерн»:
 * - Единая парящая капсула
 * - Встроенный верхний таймлайн
 * - Трехколоночная нижняя строка управления (дорожки/громкость, транспорт, утилиты)
 */
export const ModernControlsLayout: React.FC<ControlsLayoutProps> = ({
  controlsPillRef,
  isControlsHovered: _isControlsHovered,
  onPointerEnter,
  onPointerLeave,
  visualizerConfig,
  timePosition,
  timeFormat,
  mediaInfo,
  onCycleTimeFormat,
  renderTrackPopovers,
  renderAudioVisualizerAbove,
  renderFloatingCenterTime,
  renderTimelineRow,
  renderTrackButtons,
  renderVolumeSlider,
  renderTransportButtons,
  renderUtilityButtons,
}) => {
  return (
    <div
      ref={controlsPillRef}
      className={`player-controls ${
        visualizerConfig.enabled && visualizerConfig.placement === "above_timeline"
          ? "player-controls--has-visualizer-above"
          : ""
      }`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {renderTrackPopovers()}
      {renderAudioVisualizerAbove()}
      {renderFloatingCenterTime()}
      {renderTimelineRow()}

      <div className="controls-row">
        <div className="controls-row__left">
          {renderTrackButtons()}
          {renderVolumeSlider()}
          {timePosition === "volume_right" && (
            <TimeDisplay
              className="time-display--toolbar"
              timeFormat={timeFormat}
              onCycleFormat={onCycleTimeFormat}
              speed={mediaInfo?.speed}
            />
          )}
          <AudioVisualizer placement="toolbar" />
        </div>

        <div className="controls-row__center">
          {renderTransportButtons()}
        </div>

        <div className="controls-row__right">
          {timePosition === "toolbar_right" && (
            <TimeDisplay
              className="time-display--toolbar"
              timeFormat={timeFormat}
              onCycleFormat={onCycleTimeFormat}
              speed={mediaInfo?.speed}
            />
          )}
          {renderUtilityButtons()}
        </div>
      </div>
    </div>
  );
};

