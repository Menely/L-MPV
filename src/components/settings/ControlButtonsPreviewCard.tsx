import { useTranslation } from "../../i18n/LanguageContext";
import React from "react";
import {
  Undo,
  Redo,
  SkipBack,
  SkipForward,
  Play,
  Volume2,
  AudioLines,
  Subtitles,
  Repeat,
  Shuffle,
  Pin,
  Info,
  FileText,
  AudioWaveform,
  Camera,
  ListVideo,
  Maximize,
  FastForward,
} from "lucide-react";

interface ControlButtonsPreviewCardProps {
  visibleButtons: Record<string, boolean>;
  skipOpeningSeconds: number;
}

/**
 * Интерактивная карточка предпросмотра панели управления
 * в стиле превью аудио-визуализатора.
 */
export const ControlButtonsPreviewCard: React.FC<ControlButtonsPreviewCardProps> = ({
  visibleButtons,
  skipOpeningSeconds,
}) => {
  const { dict } = useTranslation();
  const isBtnVisible = (id: string, def = true) => {
    return visibleButtons[id] !== undefined ? visibleButtons[id] : def;
  };

  const rightButtons = [
    {
      id: "skipOpening",
      defaultVisible: false,
      render: () => (
        <div
          key="skipOpening"
          title={dict.settings.appearance.controlButtons.openingSkip(skipOpeningSeconds)}
          style={{
            height: 20,
            padding: "0 4px",
            display: "flex",
            alignItems: "center",
            gap: 1,
            color: "var(--accent)",
            background: "rgba(255, 255, 255, 0.06)",
            borderRadius: "var(--radius-xs, 4px)",
            fontSize: "0.62rem",
            fontWeight: 600,
            transition: "all 0.15s ease",
          }}
        >
          <FastForward size={10} />
          <span>+{skipOpeningSeconds}s</span>
        </div>
      ),
    },
    { id: "alwaysOnTop", title: dict.settings.appearance.controlButtons.alwaysOnTop, icon: <Pin size={12} /> },
    { id: "info", title: dict.settings.appearance.controlButtons.fileInfo, icon: <Info size={13} /> },
    { id: "mediaInfo", title: dict.settings.appearance.controlButtons.mediaInfo, icon: <FileText size={13} /> },
    { id: "visualizer", title: dict.settings.appearance.controlButtons.visualizer, icon: <AudioWaveform size={13} /> },
    { id: "playlist", title: dict.settings.appearance.controlButtons.playlist, icon: <ListVideo size={13} /> },
    { id: "screenshot", title: dict.settings.appearance.controlButtons.screenshot, icon: <Camera size={13} /> },
    { id: "fullscreen", title: dict.settings.appearance.controlButtons.fullscreen, icon: <Maximize size={13} /> },
  ];

  const roundIconBtnStyle: React.CSSProperties = {
    width: 22,
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-secondary)",
    borderRadius: "50%",
    transition: "all 0.15s ease",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "14px 16px",
        marginBottom: 12,
        background: "rgba(0, 0, 0, 0.35)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        gap: 10,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--text-primary)" }}>
            {dict.settings.appearance.controlButtons.preview}
          </span>
          <span
            style={{
              fontSize: "0.80rem",
              fontWeight: 700,
              color: "var(--accent)",
              textShadow: "0 0 10px var(--accent-glow)",
            }}
          >
            {dict.settings.appearance.controlButtons.liveView}
          </span>
        </div>
        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
          {dict.settings.appearance.controlButtons.onPlayback}
        </span>
      </div>

      {/* Миниатюрная копия плавающей панели плеера */}
      <div
        style={{
          width: "100%",
          background: "var(--bg-pill, rgba(13, 17, 23, 0.88))",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid var(--border-pill)",
          borderRadius: "var(--radius-controls, 16px)",
          padding: "6px 12px 8px",
          boxShadow: "var(--shadow-pill, 0 4px 20px rgba(0, 0, 0, 0.45))",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          transition: "border-radius var(--t-spring) var(--ease-spring-smooth)",
        }}
      >
        {/* Имитация таймлайна со временем воспроизведения справа */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
          }}
        >
          <div
            style={{
              position: "relative",
              flex: 1,
              height: 4,
              background: "rgba(255, 255, 255, 0.15)",
              borderRadius: "var(--radius-xs, 3px)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "42%",
                background: "var(--accent-gradient, var(--accent))",
                borderRadius: "var(--radius-xs, 3px)",
                boxShadow: "0 0 6px var(--accent-glow)",
              }}
            />
          </div>
          <span
            style={{
              fontSize: "0.64rem",
              color: "var(--text-secondary)",
              fontFamily: "monospace",
              letterSpacing: "0.02em",
              flexShrink: 0,
              fontWeight: 500,
            }}
          >
            01:42
          </span>
        </div>

        {/* Строка кнопок с адаптивной flex-сеткой */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            minHeight: 32,
            gap: 4,
          }}
        >
          {/* Левая группа (дорожки, звук без громоздкого ползунка) */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            <div title={dict.settings.appearance.controlButtons.track} style={roundIconBtnStyle}>
              <AudioLines size={13} />
            </div>
            <div title={dict.settings.appearance.controlButtons.subs} style={roundIconBtnStyle}>
              <Subtitles size={13} />
            </div>
            <div title={dict.settings.appearance.controlButtons.volume} style={roundIconBtnStyle}>
              <Volume2 size={13} />
            </div>
          </div>

          {/* Центральная группа (основная навигация и плей/пауза) */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {isBtnVisible("repeat", true) && (
              <div
                title={dict.settings.appearance.controlButtons.repeat}
                style={{ ...roundIconBtnStyle, color: "var(--accent)" }}
              >
                <Repeat size={12} />
              </div>
            )}
            <div title={dict.settings.appearance.controlButtons.prev} style={roundIconBtnStyle}>
              <SkipBack size={13} />
            </div>
            <div title={dict.settings.appearance.controlButtons.minus10} style={roundIconBtnStyle}>
              <Undo size={13} />
            </div>

            {/* Play/Pause */}
            <div
              title={dict.settings.appearance.controlButtons.playPause}
              style={{
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent)",
                filter: "drop-shadow(0 0 6px var(--accent-glow))",
                borderRadius: "50%",
              }}
            >
              <Play size={16} fill="currentColor" />
            </div>

            <div title={dict.settings.appearance.controlButtons.plus10} style={roundIconBtnStyle}>
              <Redo size={13} />
            </div>
            <div title={dict.settings.appearance.controlButtons.next} style={roundIconBtnStyle}>
              <SkipForward size={13} />
            </div>

            {isBtnVisible("shuffle", true) && (
              <div
                title={dict.settings.appearance.controlButtons.shuffle}
                style={{ ...roundIconBtnStyle, color: "var(--text-secondary)" }}
              >
                <Shuffle size={12} />
              </div>
            )}
          </div>

          {/* Правая группа (настраиваемые опциональные кнопки) */}
          <div style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
            {rightButtons.map((btn) => {
              if (!isBtnVisible(btn.id, btn.defaultVisible ?? true)) {
                return null;
              }
              if ("render" in btn && btn.render) {
                return btn.render();
              }
              return (
                <div key={btn.id} title={btn.title} style={roundIconBtnStyle}>
                  {btn.icon}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
