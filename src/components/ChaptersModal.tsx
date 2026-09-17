import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { usePlayerState, usePlayerProgress } from "../contexts/PlayerStateContext";
import { formatTime } from "../utils/timeUtils";

interface ChaptersModalProps {
  /** Обработчик закрытия панели. */
  onClose: () => void;
}

/**
 * Окно со списком глав.
 */
export function ChaptersModal({ onClose }: ChaptersModalProps) {
  const { chapters } = usePlayerState();
  const { position } = usePlayerProgress();
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    const isNoAnim = typeof document !== "undefined" && document.documentElement.classList.contains("no-animations");
    if (isNoAnim) {
      onClose();
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, 120);
  }, [isClosing, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, [handleClose]);

  // Определение активной главы
  let activeIndex = -1;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (position >= chapters[i].time) {
      activeIndex = chapters[i].index;
      break;
    }
  }

  return (
    <div 
      className="chapters-modal-overlay"
      style={{
        position: 'fixed',
        bottom: '94px',
        right: '14px',
        maxHeight: 'calc(100% - 154px)',
        width: 'min(350px, calc(100vw - 28px))',
        pointerEvents: 'none',
        zIndex: 450,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div 
        className={`media-info__section chapters-modal-card ${isClosing ? "chapters-modal-card--closing" : ""}`}
        style={{ 
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '100%',
          overflow: 'hidden',
          background: 'var(--bg-pill)',
          backdropFilter: 'blur(var(--ui-blur)) saturate(1.6)',
          WebkitBackdropFilter: 'blur(var(--ui-blur)) saturate(1.6)',
          border: '1px solid var(--border-pill)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
          boxShadow: 'var(--shadow-md)',
          pointerEvents: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <div style={{
            fontSize: 'var(--fs-lg)',
            fontWeight: 600,
            color: 'var(--text-primary)'
          }}>
            Главы ({chapters.length})
          </div>
          <button 
            className="modal__close"
            onClick={handleClose}
            title="Закрыть (Esc)"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex', 
          flexDirection: 'column', 
          gap: '8px',
          paddingRight: '4px'
        }}>
          {chapters.length > 0 ? (
            chapters.map((chapter) => (
              <button
                key={chapter.index}
                className="media-info__row"
                style={{
                  background: chapter.index === activeIndex ? 'var(--bg-active)' : 'transparent',
                  border: '1px solid transparent',
                  borderColor: chapter.index === activeIndex ? 'var(--accent)' : 'transparent',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (chapter.index !== activeIndex) {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (chapter.index !== activeIndex) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
                onClick={async () => {
                  try {
                    await invoke("seek_chapter", { index: chapter.index });
                    // Убрано onClose(), чтобы окно оставалось открытым
                  } catch (e) {
                    console.error("Ошибка перехода к главе:", e);
                  }
                }}
              >
                <span style={{ 
                  color: chapter.index === activeIndex ? 'var(--accent)' : 'var(--text-primary)',
                  fontWeight: chapter.index === activeIndex ? 600 : 400
                }}>
                  {chapter.title}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {formatTime(chapter.time)}
                </span>
              </button>
            ))
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px 0' }}>
              В этом файле нет размеченных глав.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
