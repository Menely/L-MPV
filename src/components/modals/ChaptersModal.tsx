import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Film, X } from "lucide-react";
import { useSurfaceDismiss } from "../motion/useSurfaceDismiss";
import { MotionSurface } from "../motion/MotionSurface";
import { usePlayerState, usePlayerProgress } from "../../contexts/PlayerStateContext";
import { useTranslation } from "../../i18n/LanguageContext";
import { formatTime } from "../../utils/timeUtils";
import { supportsTimelineThumbnail } from "../../utils/timelineThumbnail";
import { useChapterThumbnails } from "../../hooks/useChapterThumbnails";
import {
  notifyLiquidGlassAnimation,
  notifyLiquidGlassSync,
} from "../../theme/liquidGlass/LiquidGlassSync";
import {
  type ControlBarStyle,
  getSavedControlBarStyle,
} from "../../theme/controlBarStyle";

const CHAPTER_THUMBNAIL_WIDTH = 320;

interface ChaptersModalProps {
  /** Обработчик закрытия панели. */
  onClose: () => void;
}

/**
 * Окно со списком глав.
 */
export function ChaptersModal({ onClose }: ChaptersModalProps) {
  const { mediaInfo, tracks, chapters, seekTo } = usePlayerState();
  const { position } = usePlayerProgress();
  const { dict } = useTranslation();
  const { handleClose } = useSurfaceDismiss({ onClose });
  const listRef = useRef<HTMLDivElement>(null);
  const initialScrollDoneRef = useRef(false);

  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() =>
    getSavedControlBarStyle()
  );

  useEffect(() => {
    const syncStyle = () => {
      setControlBarStyle(getSavedControlBarStyle());
    };
    window.addEventListener("ui-settings-changed", syncStyle);
    window.addEventListener("l-mpv-control-bar-style-changed", syncStyle);
    window.addEventListener("l-mpv-settings-changed", syncStyle);
    return () => {
      window.removeEventListener("ui-settings-changed", syncStyle);
      window.removeEventListener("l-mpv-control-bar-style-changed", syncStyle);
      window.removeEventListener("l-mpv-settings-changed", syncStyle);
    };
  }, []);

  const isCapsule = controlBarStyle === "capsule";
  const mediaPath = mediaInfo?.path || "";
  const hasVideo = mediaInfo?.has_video ?? false;
  const selectedVideoTrack =
    tracks.find((track) => track.type === "video" && track.selected)?.id ?? null;
  const showThumbnails = supportsTimelineThumbnail(mediaPath, hasVideo);

  useLayoutEffect(() => {
    notifyLiquidGlassSync();
    notifyLiquidGlassAnimation(180);
    return () => {
      queueMicrotask(() => {
        notifyLiquidGlassSync();
        notifyLiquidGlassAnimation(180);
      });
    };
  }, [controlBarStyle, chapters.length, showThumbnails]);

  const { thumbnails, markThumbnailFailed } = useChapterThumbnails({
    listRef,
    path: mediaPath,
    videoTrack: selectedVideoTrack,
    enabled: showThumbnails,
    chapters,
    width: CHAPTER_THUMBNAIL_WIDTH,
  });

  // Локальный выбор главы пользователем для мгновенного тактильного отклика
  const [selectedChapterIndex, setSelectedChapterIndex] = useState<number | null>(null);

  // Определение активной главы с запасом 150мс на погрешность тайминга ключевых кадров
  let calculatedActiveIndex = -1;
  const posWithEpsilon = position + 0.15;
  for (let i = chapters.length - 1; i>= 0; i--) {
    if (posWithEpsilon>= chapters[i].time) {
      calculatedActiveIndex = chapters[i].index;
      break;
    }
  }

  // Приоритет отдан явно выбранной главе до завершения позиционирования
  const activeIndex = selectedChapterIndex !== null ? selectedChapterIndex : calculatedActiveIndex;
  const activeOrderIndex = chapters.findIndex((c) => c.index === activeIndex);
  const countBadge =
    chapters.length > 0
      ? activeOrderIndex >= 0
        ? `${activeOrderIndex + 1} / ${chapters.length}`
        : `${chapters.length}`
      : "";

  // Автоматический сброс временного выбора, когда воспроизведение подтвердило позицию или по таймауту безопасности
  useEffect(() => {
    if (selectedChapterIndex === null) return;
    if (calculatedActiveIndex === selectedChapterIndex) {
      setSelectedChapterIndex(null);
      return;
    }
    const safetyTimer = setTimeout(() => {
      setSelectedChapterIndex(null);
    }, 1200);
    return () => clearTimeout(safetyTimer);
  }, [calculatedActiveIndex, selectedChapterIndex]);

  // При переключении медиафайла разрешаем повторный стартовый скролл к активной главе
  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [mediaPath]);

  // При открытии окна глав прокручиваем список к текущей активной главе
  useEffect(() => {
    if (initialScrollDoneRef.current || activeIndex < 0 || !listRef.current) return;
    const activeButton = listRef.current.querySelector<HTMLElement>(
      `[data-chapter-index="${activeIndex}"]`
    );
    if (activeButton) {
      initialScrollDoneRef.current = true;
      activeButton.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, chapters.length]);

  return (
    <div className="chapters-modal-overlay" onClick={handleClose}>
      <MotionSurface
        kind="popover"
        className={`chapters-modal-card${isCapsule ? " chapters-modal-card--capsule" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chapters-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chapters-modal-header">
          <div className="chapters-modal-header-left">
            <h2 id="chapters-modal-title" className="chapters-modal-title">
              {dict.chapters.title}
            </h2>
            {countBadge && (
              <span className="chapters-modal-badge" aria-hidden="true">
                {countBadge}
              </span>
            )}
          </div>
          <div className="chapters-modal-header-actions">
            <button
              type="button"
              className="modal__close chapters-modal__close"
              onClick={handleClose}
              aria-label={dict.chapters.close}
            >
              <X size={isCapsule ? 16 : 18} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div ref={listRef} className="chapters-list">
          {chapters.length > 0 ? (
            chapters.map((chapter) => {
              const thumb = thumbnails[chapter.index];
              const thumbStateClass = thumb?.src
                ? "chapter-item__thumb--ready"
                : thumb?.failed
                  ? "chapter-item__thumb--failed"
                  : "chapter-item__thumb--loading";

              return (
                <button
                  type="button"
                  key={chapter.index}
                  data-chapter-index={chapter.index}
                  className={`chapter-item ${showThumbnails ? "chapter-item--with-thumb" : ""} ${
                    chapter.index === activeIndex ? "chapter-item--active" : ""
                  }`}
                  aria-current={chapter.index === activeIndex ? "true" : undefined}
                  onClick={async () => {
                    try {
                      setSelectedChapterIndex(chapter.index);
                      await seekTo(chapter.time);
                      invoke("seek_chapter", { index: chapter.index }).catch(() => {});
                    } catch (e) {
                      console.error("Ошибка перехода к главе:", e);
                    }
                  }}
                >
                  {showThumbnails ? (
                    <>
                      <div
                        className={`chapter-item__thumb ${thumbStateClass}`}
                        aria-hidden="true"
                      >
                        {thumb?.src ? (
                          <img
                            src={thumb.src}
                            alt=""
                            draggable={false}
                            onError={() => markThumbnailFailed(chapter.index)}
                          />
                        ) : (
                          <Film size={15} strokeWidth={1.75} />
                        )}
                      </div>
                      <div className="chapter-item__content">
                        <span className="chapter-item__title">
                          {chapter.title || dict.chapters.chapterItem(chapter.index + 1)}
                        </span>
                        <span className="chapter-item__time">
                          {formatTime(chapter.time)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="chapter-item__title">
                        {chapter.title || dict.chapters.chapterItem(chapter.index + 1)}
                      </span>
                      <span className="chapter-item__time">
                        {formatTime(chapter.time)}
                      </span>
                    </>
                  )}
                </button>
              );
            })
          ) : (
            <div className="chapters-empty">
              {dict.chapters.noChapters}
            </div>
          )}
        </div>
      </MotionSurface>
    </div>
  );
}
