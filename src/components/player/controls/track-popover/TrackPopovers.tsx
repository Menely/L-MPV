import React from "react";
import type { TrackInfo } from "../../../../contexts/PlayerStateContext";
import type { ControlBarStyle } from "../../../../utils/controlBarStyleUtils";
import { useTranslation } from "../../../../i18n/LanguageContext";
import { TrackPopoverHeader } from "./TrackPopoverHeader";
import { TrackRow } from "./TrackRow";

/**
 * Интерфейс пропсов всплывающего окна аудиодорожек и субтитров.
 */
export interface TrackPopoversProps {
  /** Активный тип открытого окна. */
  displayedPopover: "audio" | "sub" | null;
  /** Флаг анимации закрытия окна. */
  isPopoverClosing: boolean;
  /** Реф корня окна для обработки кликов вне зоны. */
  popoverRef: React.RefObject<HTMLDivElement | null>;
  /** Реф активной строки для автопрокрутки. */
  activeTrackItemRef: React.RefObject<HTMLButtonElement | null>;
  /** Текущий стиль плеера. */
  controlBarStyle: ControlBarStyle;
  /** Список всех дорожек файла. */
  tracks: TrackInfo[];
  /** Ключ скачиваемой дорожки (`audio-<id>` / `sub-<id>`). */
  downloadingTrackKey: string | null;
  /** Переключение аудиодорожки. */
  onSelectAudioTrack: (id: number) => void;
  /** Переключение субтитров (-1 — отключить). */
  onSelectSubTrack: (id: number) => void;
  /** Закрытие окна (immediate — без анимации). */
  onClose: (immediate?: boolean) => void;
  /** Скачивание дорожки. */
  onDownloadTrack: (track: TrackInfo) => void;
  /** Открытие окна поиска субтитров. */
  onOpenSubtitlesSearch?: () => void;
}

/**
 * Всплывающее окно выбора дорожек.
 * Разметка общая для всех стилей; внешний вид задаёт CSS-модификатор:
 * «Капсула» — шапка из двух островков и отдельный островок-список,
 * «Модерн» / «Классический» — единое цельное окно.
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

  if (displayedPopover !== "audio" && displayedPopover !== "sub") {
    return null;
  }

  const isAudio = displayedPopover === "audio";
  const kindTracks = tracks.filter((t) => t.type === displayedPopover);
  const isNoSubsActive = !isAudio && !kindTracks.some((t) => t.selected);

  const getLabel = (t: TrackInfo): string => {
    const base =
      t.title ||
      (isAudio
        ? dict.controls.trackLabel(t.id)
        : dict.controls.subtitleLabel(t.id));
    return t.lang ? `${base} (${t.lang})` : base;
  };

  const select = (id: number): void => {
    if (isAudio) {
      onSelectAudioTrack(id);
    } else {
      onSelectSubTrack(id);
    }
    onClose();
  };

  const rootClass = [
    "track-popover",
    controlBarStyle === "capsule" ? "track-popover--capsule" : "",
    isPopoverClosing ? "track-popover--closing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={popoverRef} className={rootClass}>
      <TrackPopoverHeader
        title={isAudio ? dict.controls.audioTracks : dict.controls.subtitles}
        count={kindTracks.length}
        searchLabel={isAudio ? undefined : dict.controls.searchSubtitles}
        onSearch={
          !isAudio && onOpenSubtitlesSearch
            ? () => {
                onClose(true);
                onOpenSubtitlesSearch();
              }
            : undefined
        }
      />

      <div className="track-popover__list">
        {!isAudio && (
          <TrackRow
            label={dict.controls.disableSubtitles}
            isActive={isNoSubsActive}
            onSelect={() => select(-1)}
          />
        )}
        {!isAudio && kindTracks.length > 0 && (
          <div className="track-popover__divider" aria-hidden="true" />
        )}
        {isAudio && kindTracks.length === 0 && (
          <div className="track-popover__empty">
            {dict.controls.noAudioTracks}
          </div>
        )}
        {kindTracks.map((t) => (
          <TrackRow
            key={t.id}
            label={getLabel(t)}
            isActive={t.selected}
            itemRef={t.selected ? activeTrackItemRef : undefined}
            onSelect={() => select(t.id)}
            downloadLabel={
              isAudio
                ? dict.controls.downloadAudio
                : dict.controls.downloadSubtitle
            }
            isDownloading={downloadingTrackKey === `${t.type}-${t.id}`}
            onDownload={() => onDownloadTrack(t)}
          />
        ))}
      </div>
    </div>
  );
};

