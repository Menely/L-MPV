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
 * - Строго одинаковая длина верхней строки таймлайна и нижнего ряда карточек
 * - Закон близости (связь через расстояние):
 *   * Левая станция: дорожки + звук + визуализатор (внутренний gap: 6px, прижаты влево)
 *   * Центральная станция: транспорт (строго по центру таймлайна на 50% ширины)
 *   * Правая станция: утилиты + полный экран (внутренний gap: 6px, прижаты вправо)
 *   * Воздушные промежутки между станциями дают интерфейсу дышать и разделяют функционал
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

      {/* Нижний ряд: 3 станции на сетке (1fr auto 1fr) с идеальным выравниванием по краям таймлайна */}
      <div className="controls-islands-row">
        {/* Левая станция: независимые парящие островки звука и дорожек (прижаты к левому краю) */}
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

        {/* Центральная станция: Транспортные кнопки управления (строго по центру таймлайна) */}
        <div className="controls-island controls-island--transport">
          {renderTransportButtons()}
        </div>

        {/* Правая станция: служебные утилиты и полный экран (прижаты к правому краю) */}
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

