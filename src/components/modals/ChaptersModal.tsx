import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useSurfaceDismiss } from "../motion/useSurfaceDismiss";
import { MotionSurface } from "../motion/MotionSurface";
import { usePlayerState, usePlayerProgress } from "../../contexts/PlayerStateContext";
import { useTranslation } from "../../i18n/LanguageContext";
import { formatTime } from "../../utils/timeUtils";
import {
  type ControlBarStyle,
  getSavedControlBarStyle,
} from "../../utils/controlBarStyleUtils";

interface ChaptersModalProps {
  /** Обработчик закрытия панели. */
  onClose: () => void;
}

/**
 * Окно со списком глав.
 */
export function ChaptersModal({ onClose }: ChaptersModalProps) {
  const { chapters, seekTo } = usePlayerState();
  const { position } = usePlayerProgress();
  const { dict } = useTranslation();
  const { handleClose } = useSurfaceDismiss({ onClose });

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
              <X size={isCapsule ? 16 : 18} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="chapters-list">
          {chapters.length > 0 ? (
            chapters.map((chapter) => (
              <button
                type="button"
                key={chapter.index}
                className={`chapter-item ${chapter.index === activeIndex ? "chapter-item--active" : ""}`}
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
                <span className="chapter-item__title">
                  {chapter.title || dict.chapters.chapterItem(chapter.index + 1)}
                </span>
                <span className="chapter-item__time">
                  {formatTime(chapter.time)}
                </span>
              </button>
            ))
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
