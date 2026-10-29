import React from "react";
import { Download, Loader2, Search } from "lucide-react";
import type { TrackInfo } from "../../../contexts/PlayerStateContext";
import type { ControlBarStyle } from "../../../utils/controlBarStyleUtils";
import { useTranslation } from "../../../i18n/LanguageContext";

/**
 * Интерфейс пропсов для модульного всплывающего меню аудиодорожек и субтитров.
 */
export interface TrackPopoversProps {
  /** Активный тип открытого меню ("audio" | "sub" | null). */
  displayedPopover: "audio" | "sub" | null;
  /** Флаг анимации закрытия меню. */
  isPopoverClosing: boolean;
  /** Реф корневого контейнера меню для обработки кликов вне зоны. */
  popoverRef: React.RefObject<HTMLDivElement | null>;
  /** Реф активного элемента списка для автоматической прокрутки. */
  activeTrackItemRef: React.RefObject<HTMLButtonElement | null>;
  /** Текущий стиль панели управления плеером. */
  controlBarStyle: ControlBarStyle;
  /** Список всех аудио- и субтитровых дорожек. */
  tracks: TrackInfo[];
  /** Ключ дорожки, которая скачивается в текущий момент. */
  downloadingTrackKey: string | null;
  /** Обработчик переключения аудиодорожки. */
  onSelectAudioTrack: (id: number) => void;
  /** Обработчик переключения субтитров. */
  onSelectSubTrack: (id: number) => void;
  /** Обработчик закрытия всплывающего меню. */
  onClose: (immediate?: boolean) => void;
  /** Обработчик запроса на скачивание дорожки. */
  onDownloadTrack: (track: TrackInfo) => void;
  /** Обработчик открытия модального окна поиска субтитров. */
  onOpenSubtitlesSearch?: () => void;
}

/**
 * Модульный компонент всплывающего меню аудиодорожек и субтитров.
 * В стиле «Капсула» разделяется на парящие островки (заголовок, действия, список).
 * В остальных стилях отображается в виде элегантного цельного окна.
 */
export const TrackPopovers: React.FC<TrackPopoversProps> = ({
  displayedPopover,
  isPopoverClosing,
  popoverRef,
  activeTrackItemRef,
  controlBarStyle,
  tracks,
  downloadingTrackKey,
  onSelectAudioTrack,
  onSelectSubTrack,
  onClose,
  onDownloadTrack,
  onOpenSubtitlesSearch,
}) => {
  const { dict } = useTranslation();

  if (!displayedPopover || (displayedPopover !== "audio" && displayedPopover !== "sub")) {
    return null;
  }

  const isCapsule = controlBarStyle === "capsule";
  const audioTracks = tracks.filter((t) => t.type === "audio");
  const subTracks = tracks.filter((t) => t.type === "sub");
  const isNoSubsActive = !subTracks.some((t) => t.selected);

  return (
    <div
      ref={popoverRef}
      className={`track-popover ${
        isCapsule ? "track-popover--capsule" : ""
      } ${isPopoverClosing ? "track-popover--closing" : ""}`}
    >
      {/* 1. Заголовок попапа (в капсульном режиме — отдельная парящая карточка) */}
      <div className="track-popover__title">
        {displayedPopover === "audio"
          ? dict.controls.audioTracks
          : dict.controls.subtitles}
      </div>

      {/* 2. Меню аудиодорожек */}
      {displayedPopover === "audio" &&
        (audioTracks.length > 0 ? (
          <div className="track-popover__list">
            {audioTracks.map((t) => (
              <div key={t.id} className="track-popover__row">
                <button
                  type="button"
                  className={`track-popover__item ${
                    t.selected ? "track-popover__item--active" : ""
                  }`}
                  ref={t.selected ? activeTrackItemRef : null}
                  onClick={() => {
                    onSelectAudioTrack(t.id);
                    onClose();
                  }}
                >
                  <span className="track-popover__item-title">
                    {t.title || dict.controls.trackLabel(t.id)}{" "}
                    {t.lang ? `(${t.lang})` : ""}
                  </span>
                  <span className="track-popover__item-check">
                    {t.selected && <span className="track-radio-dot" aria-hidden="true" />}
                  </span>
                </button>
                <button
                  type="button"
                  className="track-download-btn"
                  title={dict.controls.downloadAudio}
                  aria-label={dict.controls.downloadAudio}
                  disabled={downloadingTrackKey === `audio-${t.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownloadTrack(t);
                  }}
                >
                  {downloadingTrackKey === `audio-${t.id}` ? (
                    <Loader2 size={14} className="spin-animation" />
                  ) : (
                    <Download size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="track-popover__item track-popover__item--empty">
            {dict.controls.noAudioTracks}
          </div>
        ))}

      {/* 3. Меню субтитров */}
      {displayedPopover === "sub" && (
        <>
          {/* Строка управления субтитрами */}
          <div className={isCapsule ? "track-popover__action-card" : "track-popover__row track-popover__row--header-action"}>
            <button
              type="button"
              className={`track-popover__item ${
                isNoSubsActive ? "track-popover__item--active" : ""
              }`}
              onClick={() => {
                onSelectSubTrack(-1);
                onClose();
              }}
            >
              <span className="track-popover__item-title">
                {dict.controls.disableSubtitles}
              </span>
              <span className="track-popover__item-check">
                {isNoSubsActive && <span className="track-radio-dot" aria-hidden="true" />}
              </span>
            </button>
            {onOpenSubtitlesSearch && (
              <button
                type="button"
                className="track-download-btn"
                title={dict.controls.searchSubtitles}
                aria-label={dict.controls.searchSubtitles}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(true);
                  onOpenSubtitlesSearch();
                }}
              >
                <Search size={14} />
              </button>
            )}
          </div>

          {/* Список субтитровых дорожек */}
          {subTracks.length > 0 && (
            <div className="track-popover__list">
              {subTracks.map((t) => (
                <div key={t.id} className="track-popover__row">
                  <button
                    type="button"
                    className={`track-popover__item ${
                      t.selected ? "track-popover__item--active" : ""
                    }`}
                    ref={t.selected ? activeTrackItemRef : null}
                    onClick={() => {
                      onSelectSubTrack(t.id);
                      onClose();
                    }}
                  >
                    <span className="track-popover__item-title">
                      {t.title || dict.controls.subtitleLabel(t.id)}{" "}
                      {t.lang ? `(${t.lang})` : ""}
                    </span>
                    <span className="track-popover__item-check">
                      {t.selected && <span className="track-radio-dot" aria-hidden="true" />}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="track-download-btn"
                    title={dict.controls.downloadSubtitle}
                    aria-label={dict.controls.downloadSubtitle}
                    disabled={downloadingTrackKey === `sub-${t.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownloadTrack(t);
                    }}
                  >
                    {downloadingTrackKey === `sub-${t.id}` ? (
                      <Loader2 size={14} className="spin-animation" />
                    ) : (
                      <Download size={14} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

