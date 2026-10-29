import React from "react";
import type { ControlsLayoutProps } from "./types";
import { Timeline } from "../Timeline";
import { TimeDisplay } from "../TimeDisplay";
import { WaveformActivityStrip } from "../heatmap";
import { AudioVisualizer } from "../AudioVisualizer";

/**
 * Модульное представление панели управления для стиля «Капсула»:
 * - Парящая полоса таймлайна в отдельной карточке
 * - Вынесенное время в самостоятельный парящий островок
 * - 3 независимых парящих островка (треки/громкость, транспорт, утилиты)
 */
export const CapsuleControlsLayout: React.FC<ControlsLayoutProps> = ({
  controlsPillRef,
  isControlsHovered,
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
  renderTrackButtons,
  renderVolumeSlider,
  renderTransportButtons,
  renderUtilityButtons,
  isStripHovered = false,
  setIsStripHovered,
}) => {
  return (
    <div
      ref={controlsPillRef}
      className={`player-controls player-controls--capsule ${
        visualizerConfig.enabled && visualizerConfig.placement === "above_timeline"
          ? "player-controls--has-visualizer-above"
          : ""
      }`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {renderTrackPopovers()}

      {/* Верхняя строка: парящий таймлайн и отдельная карточка времени */}
      <div className="controls-timeline-wrap">
        {timePosition === "timeline_left" && (
          <div className="controls-island controls-island--time">
            <TimeDisplay
              timeFormat={timeFormat}
              onCycleFormat={onCycleTimeFormat}
              speed={mediaInfo?.speed}
            />
          </div>
        )}

        <div className="controls-island controls-island--timeline">
          {renderAudioVisualizerAbove()}
          {renderFloatingCenterTime()}
          <div className="timeline-col">
            <WaveformActivityStrip
              isTimelineHovered={isControlsHovered || isStripHovered}
              onHoverChange={setIsStripHovered}
            />
            <Timeline />
          </div>
        </div>

        {timePosition === "timeline_right" && (
          <div className="controls-island controls-island--time">
            <TimeDisplay
              timeFormat={timeFormat}
              onCycleFormat={onCycleTimeFormat}
              speed={mediaInfo?.speed}
            />
          </div>
        )}
      </div>

      {/* 3 отдельных парящих островка */}
      <div className="controls-islands-row">
        {/* Островок 1: Аудиодорожки, субтитры, громкость */}
        <div className="controls-island controls-island--tracks">
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

        {/* Островок 2: Транспортные кнопки управления */}
        <div className="controls-island controls-island--transport">
          {renderTransportButtons()}
        </div>

        {/* Островок 3: Время и утилиты */}
        <div className="controls-island controls-island--utilities">
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

