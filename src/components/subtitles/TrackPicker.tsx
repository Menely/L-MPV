import type { RefObject } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { TrackInfo } from "../../contexts/PlayerStateContext";
import { useTranslation } from "../../i18n/LanguageContext";

interface TrackPickerProps {
  subTracks: TrackInfo[];
  activeTrack: TrackInfo | undefined;
  currentDisplayedTrack: TrackInfo | null;
  selectedTrackId: number | null;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (trackId: number) => void;
  onDisable: () => void;
  pickerRef: RefObject<HTMLDivElement | null>;
}

/**
 * Выпадающий селектор дорожки субтитров с пунктом отключения.
 * Чистый презентационный компонент: состояние и анализ — в вызывающем коде.
 */
export function TrackPicker({
  subTracks,
  activeTrack,
  currentDisplayedTrack,
  selectedTrackId,
  isOpen,
  onToggle,
  onSelect,
  onDisable,
  pickerRef,
}: TrackPickerProps) {
  const { dict } = useTranslation();

  return (
    <div
      ref={pickerRef}
      style={{
        position: "relative",
        flex: 1,
        minWidth: 0,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "7px 10px",
          background: "rgba(255, 255, 255, 0.05)",
          border: "1px solid var(--border-pill)",
          borderRadius: "var(--radius-xs)",
          color: "var(--text-primary)",
          fontSize: "0.8rem",
          cursor: "pointer",
          transition: "background 0.15s ease",
          gap: 6,
        }}
        className="hover-bright"
        title={dict.subtitlesSearch.selectTrack}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          <span
            style={{
              padding: "1px 6px",
              borderRadius: "3px",
              background: "rgba(59, 130, 246, 0.2)",
              color: "var(--accent)",
              fontSize: "0.7rem",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {dict.subtitlesSearch.tracksCount(subTracks.length)}
          </span>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "0.8rem",
            }}
          >
            {currentDisplayedTrack
              ? `${currentDisplayedTrack.title || dict.subtitlesSearch.defaultTrackName(currentDisplayedTrack.id)} ${
                  currentDisplayedTrack.lang ? `(${currentDisplayedTrack.lang})` : ""
                }`
              : dict.subtitlesSearch.selectTrack}
          </span>
        </div>
        <ChevronDown
          size={14}
          style={{
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
            flexShrink: 0,
            color: "var(--text-muted)",
          }}
        />
      </button>

      {/* Выпадающее меню выбора дорожек */}
      {isOpen && (
        <div
          className="custom-scrollbar"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 30,
            background: "var(--bg-glass)",
            backdropFilter: "var(--ui-backdrop-heavy)",
            WebkitBackdropFilter: "var(--ui-backdrop-heavy)",
            border: "1px solid var(--border-pill)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-lg)",
            maxHeight: "220px",
            overflowY: "auto",
            padding: "4px",
          }}
        >
          <button
            type="button"
            onClick={onDisable}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 8px",
              background: !activeTrack ? "var(--bg-active)" : "transparent",
              border: "none",
              borderRadius: "var(--radius-xs)",
              color: !activeTrack ? "var(--accent)" : "var(--text-secondary)",
              fontSize: "0.8rem",
              cursor: "pointer",
              textAlign: "left",
              marginBottom: "3px",
            }}
            className="hover-bright"
          >
            <span>{dict.subtitlesSearch.disableSubtitles}</span>
            {!activeTrack && <Check size={14} />}
          </button>

          {subTracks.map((t) => {
            const isSelected =
              selectedTrackId !== null ? t.id === selectedTrackId : t.selected;

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  background: isSelected ? "var(--bg-active)" : "transparent",
                  border: "none",
                  borderRadius: "var(--radius-xs)",
                  color: isSelected ? "var(--accent)" : "var(--text-primary)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  textAlign: "left",
                  gap: 6,
                }}
                className="hover-bright"
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    overflow: "hidden",
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      opacity: 0.6,
                      flexShrink: 0,
                    }}
                  >
                    #{t.id}
                  </span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.title || dict.subtitlesSearch.defaultTrackName(t.id)}
                  </span>
                  {t.lang && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        opacity: 0.7,
                        flexShrink: 0,
                      }}
                    >
                      [{t.lang}]
                    </span>
                  )}
                  {t.codec && (
                    <span
                      style={{
                        fontSize: "0.65rem",
                        padding: "1px 4px",
                        borderRadius: "2px",
                        background: "rgba(255, 255, 255, 0.08)",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                      }}
                    >
                      {t.codec.toUpperCase()}
                    </span>
                  )}
                </div>
                {isSelected && <Check size={14} style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
