import React from "react";
import type { VisualizerConfig } from "../AudioVisualizer";
import type { TimeDisplayPosition } from "../../../utils/timePositionUtils";
import type { TimeFormatMode } from "../../../utils/timeFormatUtils";
import type { MediaInfo } from "../../../contexts/PlayerStateContext";

/**
 * Общие свойства для компонентов представления стилей панели управления.
 */
export interface ControlsLayoutProps {
  /** Ссылка на корневой элемент панели для измерений и позиционирования. */
  controlsPillRef: React.RefObject<HTMLDivElement | null>;
  /** Флаг наведения курсора на панель управления. */
  isControlsHovered: boolean;
  /** Обработчик входа указателя в зону панели. */
  onPointerEnter: () => void;
  /** Обработчик выхода указателя из зоны панели. */
  onPointerLeave: () => void;
  /** Конфигурация аудиовизуализатора. */
  visualizerConfig: VisualizerConfig;
  /** Позиция отображения времени. */
  timePosition: TimeDisplayPosition;
  /** Формат отображения времени. */
  timeFormat: TimeFormatMode;
  /** Метаданные текущего медиафайла. */
  mediaInfo: MediaInfo | null;
  /** Переключение формата времени. */
  onCycleTimeFormat: () => void;
  /** Рендер выпадающих меню дорожек. */
  renderTrackPopovers: () => React.ReactNode;
  /** Рендер аудиовизуализатора над таймлайном. */
  renderAudioVisualizerAbove: () => React.ReactNode;
  /** Рендер плавающего бейджа времени над центром таймлайна. */
  renderFloatingCenterTime: () => React.ReactNode;
  /** Рендер строки таймлайна (для стилей с встроенным таймлайном). */
  renderTimelineRow: () => React.ReactNode;
  /** Рендер кнопок дорожек (аудио, субтитры). */
  renderTrackButtons: () => React.ReactNode;
  /** Рендер регулятора громкости. */
  renderVolumeSlider: () => React.ReactNode;
  /** Рендер транспортных кнопок воспроизведения/перемотки. */
  renderTransportButtons: () => React.ReactNode;
  /** Рендер утилитных кнопок панели (с опцией исключения кнопки полного экрана). */
  renderUtilityButtons: (options?: { excludeFullscreen?: boolean }) => React.ReactNode;
  /** Рендер отдельной кнопки полноэкранного режима. */
  renderFullscreenButton?: () => React.ReactNode;
  /** Флаг наведения на тепловую полосу. */
  isStripHovered?: boolean;
  /** Обработчик смены наведения на тепловую полосу. */
  setIsStripHovered?: (hovered: boolean) => void;
}

