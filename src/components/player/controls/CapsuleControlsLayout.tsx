import React from "react";
import type { ControlsLayoutProps } from "./types";
import { Timeline } from "../Timeline";
import { TimeDisplay } from "../TimeDisplay";
import { WaveformActivityStrip } from "../heatmap";
import { AudioVisualizer } from "../AudioVisualizer";
import { useTranslation } from "../../../i18n/LanguageContext";

/**
 * Модульное представление панели управления для стиля «Капсула»:
 * - Парящая полоса таймлайна в отдельной карточке
 * - Вынесенное время в самостоятельный парящий островок-кнопку
 * - Левая группа: независимый островок дорожек + независимый островок звука и визуализатора
 * - Центр: независимый островок транспорта (play/pause/seek)
 * - Правая группа: независимый островок утилит + отдельный островок полноэкранного режима
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
  renderFullscreenButton,
  isStripHovered = false,
  setIsStripHovered,
}) => {
  const { dict } = useTranslation();

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

      {/* Верхняя строка: парящий таймлайн и отдельная карточка-кнопка времени */}
      <div className="controls-timeline-wrap">
        {timePosition === "timeline_left" && (
          <button
            type="button"
            className="controls-island controls-island--time"
            onClick={onCycleTimeFormat}
            title={dict.controls.timeFormatHint}
            aria-label={dict.controls.timeFormatHint}
          >
            <TimeDisplay
              timeFormat={timeFormat}
              onCycleFormat={onCycleTimeFormat}
              speed={mediaInfo?.speed}
              isInteractive={false}
            />
          </button>
        )}

        <div className="controls-island controls-island--timeline">
          {renderAudioVisualizerAbove()}
          {renderFloatingCenterTime()}
          <div className="timeline-col timeline-col--capsule">
            <WaveformActivityStrip
              isTimelineHovered={isControlsHovered || isStripHovered}
              onHoverChange={setIsStripHovered}
            />
            <Timeline />
          </div>
        </div>

        {timePosition === "timeline_right" && (
          <button
            type="button"
            className="controls-island controls-island--time"
            onClick={onCycleTimeFormat}
            title={dict.controls.timeFormatHint}
            aria-label={dict.controls.timeFormatHint}
          >
            <TimeDisplay
              timeFormat={timeFormat}
              onCycleFormat={onCycleTimeFormat}
              speed={mediaInfo?.speed}
              isInteractive={false}
            />
          </button>
        )}
      </div>

      {/* 3 секции на сетке: левая группа островков, транспорт по центру, правая группа островков */}
      <div className="controls-islands-row">
        {/* Левая группа: независимые парящие островки (Дорожки | Звук | Визуализатор) */}
        <div className="controls-group controls-group--left">
          {/* Островок 1: Аудиодорожки и субтитры */}
          <div className="controls-island controls-island--tracks">
            {renderTrackButtons()}
          </div>

          {/* Островок 2: Звук (громкость) */}
          <div className="controls-island controls-island--volume">
            {renderVolumeSlider()}
            {timePosition === "volume_right" && (
              <TimeDisplay
                className="time-display--toolbar"
                timeFormat={timeFormat}
                onCycleFormat={onCycleTimeFormat}
                speed={mediaInfo?.speed}
              />
            )}
          </div>

          {/* Островок 3: Аудиовизуализатор (только если включён и режим тулбара) */}
          {visualizerConfig.enabled && visualizerConfig.placement === "toolbar" && (
            <div className="controls-island controls-island--visualizer">
              <AudioVisualizer placement="toolbar" />
            </div>
          )}
        </div>

        {/* Островок 3: Транспортные кнопки управления (строго по центру без наложений) */}
        <div className="controls-island controls-island--transport">
          {renderTransportButtons()}
        </div>

        {/* Правая группа: 2 независимых парящих островка (Утилиты | Полноэкранный режим) */}
        <div className="controls-group controls-group--right">
          {/* Островок 4: Время и утилиты */}
          <div className="controls-island controls-island--utilities">
            {timePosition === "toolbar_right" && (
              <TimeDisplay
                className="time-display--toolbar"
                timeFormat={timeFormat}
                onCycleFormat={onCycleTimeFormat}
                speed={mediaInfo?.speed}
              />
            )}
            {renderUtilityButtons({ excludeFullscreen: true })}
          </div>

          {/* Островок 5: Отдельная карточка полноэкранного режима */}
          {renderFullscreenButton && (
            <div className="controls-island controls-island--fullscreen">
              {renderFullscreenButton()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

