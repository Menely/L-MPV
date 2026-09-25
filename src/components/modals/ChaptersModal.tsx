import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { isMotionAllowed, getCloseTimeoutMs } from "../../utils/animationUtils";
import { usePlayerState, usePlayerProgress } from "../../contexts/PlayerStateContext";
import { useTranslation } from "../../i18n/LanguageContext";
import { formatTime } from "../../utils/timeUtils";

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
  const [isClosing, setIsClosing] = useState(false);
  const isClosingRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);

    if (!isMotionAllowed()) {
      onClose();
      return;
    }

    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, getCloseTimeoutMs("fast"));
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      isClosingRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [handleClose]);

  // Локальный выбор главы пользователем для мгновенного тактильного отклика
  const [selectedChapterIndex, setSelectedChapterIndex] = useState<number | null>(null);

  // Определение активной главы с запасом 150мс на погрешность тайминга ключевых кадров
  let calculatedActiveIndex = -1;
  const posWithEpsilon = position + 0.15;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (posWithEpsilon >= chapters[i].time) {
      calculatedActiveIndex = chapters[i].index;
      break;
    }
  }

  // Приоритет отдан явно выбранной главе до завершения позиционирования
  const activeIndex = selectedChapterIndex !== null ? selectedChapterIndex : calculatedActiveIndex;

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
    <div className="chapters-modal-overlay">
      <div 
        className={`chapters-modal-card ${isClosing ? "chapters-modal-card--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chapters-modal-header">
          <div className="chapters-modal-title">
            {dict.chapters.title(chapters.length)}
          </div>
          <button 
            className="modal__close"
            onClick={handleClose}
            title={dict.chapters.close}
            aria-label={dict.chapters.close}
          >
            <X size={18} />
          </button>
        </div>

        <div className="chapters-list">
          {chapters.length > 0 ? (
            chapters.map((chapter) => (
              <button
                key={chapter.index}
                className={`chapter-item ${chapter.index === activeIndex ? "chapter-item--active" : ""}`}
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
                  {chapter.title}
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
      </div>
    </div>
  );
}
