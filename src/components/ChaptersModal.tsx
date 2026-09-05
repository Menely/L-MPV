import { invoke } from "@tauri-apps/api/core";
import { usePlayerState, usePlayerProgress } from "../contexts/PlayerStateContext";

interface ChaptersModalProps {
  /** Обработчик закрытия панели. */
  onClose: () => void;
}

/**
 * Форматирование секунд в MM:SS или HH:MM:SS.
 */
function formatChapterTime(seconds: number): string {
  if (!seconds || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Окно со списком глав.
 */
export function ChaptersModal({ onClose }: ChaptersModalProps) {
  const { chapters } = usePlayerState();
  const { position } = usePlayerProgress();

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
        maxHeight: 'calc(100vh - 154px)',
        width: 'min(350px, calc(100vw - 28px))',
        pointerEvents: 'none',
        zIndex: 450,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div 
        className="media-info__section"
        style={{ 
          display: 'flex',
          flexDirection: 'column',
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
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Закрыть"
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            ✕
          </button>
        </div>

        <div style={{
          flex: 1,
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
                  {formatChapterTime(chapter.time)}
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
