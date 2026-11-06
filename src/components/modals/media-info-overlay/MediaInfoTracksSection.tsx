import React from "react";
import type { TrackInfo, Chapter } from "../../../contexts/PlayerStateContext";
import { formatTime } from "../../../utils/timeUtils";
import { useTranslation } from "../../../i18n/LanguageContext";

/**
 * Пропсы секции дорожек аудио, субтитров и глав медиафайла.
 */
export interface MediaInfoTracksSectionProps {
  /** Список всех медиадорожек файла (аудио, субтитры). */
  tracks: TrackInfo[];
  /** Список глав медиафайла. */
  chapters: Chapter[];
  /** Текущая позиция воспроизведения в секундах. */
  currentPosition: number;
  /** Обработчик переключения аудиодорожки. */
  onSelectAudioTrack: (id: number) => void;
  /** Обработчик переключения субтитров. */
  onSelectSubtitleTrack: (id: number) => void;
  /** Обработчик перехода к главе. */
  onSeekToChapter: (chapter: Chapter) => void;
}

/**
 * Модульная секция потоков и глав медиафайла (Вкладка 3).
 * В стиле «Капсула» разделяется на самостоятельные парящие карточки:
 * 1. Аудиодорожки (с интерактивным выбором и бейджем активной)
 * 2. Субтитры (с указанием формата и языка)
 * 3. Главы (с таймкодами и переходом)
 */
export const MediaInfoTracksSection: React.FC<MediaInfoTracksSectionProps> = ({
  tracks,
  chapters,
  currentPosition,
  onSelectAudioTrack,
  onSelectSubtitleTrack,
  onSeekToChapter,
}) => {
  const { dict } = useTranslation();

  const audioTracks = tracks.filter((t) => t.type === "audio");
  const subTracks = tracks.filter((t) => t.type === "sub");

  // Определение индекса текущей активной главы
  let currentChapterIndex = -1;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (currentPosition + 0.1 >= chapters[i].time) {
      currentChapterIndex = i;
      break;
    }
  }
  const currentChapter =
    currentChapterIndex >= 0 ? chapters[currentChapterIndex] : null;

  return (
    <>
      {/* ─── Карточка 1: Аудиодорожки ─── */}
      <div className="media-info__section">
        <div className="media-info__section-header">
          <span className="media-info__section-title">
            {dict.mediaInfoModal.audioTracksTitle} ({audioTracks.length})
          </span>
        </div>
        {audioTracks.length > 0 ? (
          <div className="media-info__stream-list">
            {audioTracks.map((track) => {
              const isSelected = track.selected;
              const title =
                track.title || track.lang || `Track #${track.id}`;
              const langBadge = track.lang ? track.lang.toUpperCase() : null;

              return (
                <button
                  key={track.id}
                  type="button"
                  className={`media-info__stream-item ${
                    isSelected ? "media-info__stream-item--active" : ""
                  }`}
                  onClick={() => onSelectAudioTrack(track.id)}
                  title={`${title} (${track.codec})`}
                >
                  <div className="media-info__stream-left">
                    {langBadge && (
                      <span className="media-info__badge-lang">
                        {langBadge}
                      </span>
                    )}
                    <span className="media-info__stream-title">{title}</span>
                  </div>
                  <div className="media-info__stream-right">
                    {track.codec && (
                      <span className="media-info__badge-codec">
                        {track.codec}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="media-info__empty-text">
            {dict.mediaInfoModal.noAudioTracks}
          </div>
        )}
      </div>

      {/* ─── Карточка 2: Субтитры ─── */}
      <div className="media-info__section">
        <div className="media-info__section-header">
          <span className="media-info__section-title">
            {dict.mediaInfoModal.subTracksTitle} ({subTracks.length})
          </span>
        </div>
        {subTracks.length > 0 ? (
          <div className="media-info__stream-list">
            {subTracks.map((track) => {
              const isSelected = track.selected;
              const title =
                track.title || track.lang || `Sub #${track.id}`;
              const langBadge = track.lang ? track.lang.toUpperCase() : null;

              return (
                <button
                  key={track.id}
                  type="button"
                  className={`media-info__stream-item ${
                    isSelected ? "media-info__stream-item--active" : ""
                  }`}
                  onClick={() => onSelectSubtitleTrack(track.id)}
                  title={`${title} (${track.codec})`}
                >
                  <div className="media-info__stream-left">
                    {langBadge && (
                      <span className="media-info__badge-lang">
                        {langBadge}
                      </span>
                    )}
                    <span className="media-info__stream-title">{title}</span>
                  </div>
                  <div className="media-info__stream-right">
                    {track.codec && (
                      <span className="media-info__badge-codec">
                        {track.codec}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="media-info__empty-text">
            {dict.mediaInfoModal.noSubTracks}
          </div>
        )}
      </div>

      {/* ─── Карточка 3: Главы ─── */}
      <div className="media-info__section">
        <div className="media-info__section-header">
          <span className="media-info__section-title">
            {dict.mediaInfoModal.chaptersTitle} ({chapters.length})
          </span>
        </div>
        {chapters.length > 0 ? (
          <div className="media-info__chapters-wrapper">
            {currentChapter && (
              <div className="media-info__current-chapter">
                <span className="media-info__chapter-count">
                  {dict.mediaInfoModal.chapterCount(
                    currentChapterIndex + 1,
                    chapters.length
                  )}
                </span>
                <span className="media-info__chapter-name">
                  {currentChapter.title || `${dict.mediaInfoModal.chaptersTitle} ${currentChapterIndex + 1}`}
                </span>
              </div>
            )}
            <div className="media-info__stream-list media-info__stream-list--scroll">
              {chapters.map((chapter, idx) => {
                const isCurrent = idx === currentChapterIndex;
                const chapterTitle =
                  chapter.title || `${dict.mediaInfoModal.chaptersTitle} ${idx + 1}`;
                return (
                  <button
                    key={chapter.index}
                    type="button"
                    className={`media-info__stream-item media-info__stream-item--chapter ${
                      isCurrent ? "media-info__stream-item--active" : ""
                    }`}
                    onClick={() => onSeekToChapter(chapter)}
                  >
                    <span className="media-info__chapter-idx">
                      {idx + 1}.
                    </span>
                    <span className="media-info__stream-title">
                      {chapterTitle}
                    </span>
                    <span className="media-info__chapter-time">
                      {formatTime(chapter.time)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="media-info__empty-text">
            {dict.mediaInfoModal.noChapters}
          </div>
        )}
      </div>
    </>
  );
};

