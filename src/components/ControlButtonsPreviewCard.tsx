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
          title={`Перемотка опенинга (+${skipOpeningSeconds}с)`}
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
          <span>+{skipOpeningSeconds}с</span>
        </div>
      ),
    },
    { id: "alwaysOnTop", title: "Поверх всех окон", icon: <Pin size={12} /> },
    { id: "info", title: "Информация о файле", icon: <Info size={13} /> },
    { id: "mediaInfo", title: "Свойства MediaInfo (Shift+F10)", icon: <FileText size={13} /> },
    { id: "visualizer", title: "Аудио-визуалайзер", icon: <AudioWaveform size={13} /> },
    { id: "playlist", title: "Плейлист", icon: <ListVideo size={13} /> },
    { id: "screenshot", title: "Сделать скриншот", icon: <Camera size={13} /> },
    { id: "fullscreen", title: "Полный экран", icon: <Maximize size={13} /> },
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
            Предпросмотр:
          </span>
          <span
            style={{
              fontSize: "0.80rem",
              fontWeight: 700,
              color: "var(--accent)",
              textShadow: "0 0 10px var(--accent-glow)",
            }}
          >
            Живой вид панели управления
          </span>
        </div>
        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
          Отображение кнопок при воспроизведении
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
        {/* Имитация полосы прогресса таймлайна */}
        <div
          style={{
            position: "relative",
            width: "100%",
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
            <div title="Аудиодорожка" style={roundIconBtnStyle}>
              <AudioLines size={13} />
            </div>
            <div title="Субтитры" style={roundIconBtnStyle}>
              <Subtitles size={13} />
            </div>
            <div title="Громкость" style={roundIconBtnStyle}>
              <Volume2 size={13} />
            </div>
            <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", marginLeft: 2, fontFamily: "monospace", opacity: 0.85 }}>
              01:42
            </span>
          </div>

          {/* Центральная группа (основная навигация и плей/пауза) */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {isBtnVisible("repeat", true) && (
              <div
                title="Повтор"
                style={{ ...roundIconBtnStyle, color: "var(--accent)" }}
              >
                <Repeat size={12} />
              </div>
            )}
            <div title="Предыдущий файл" style={roundIconBtnStyle}>
              <SkipBack size={13} />
            </div>
            <div title="-10 сек" style={roundIconBtnStyle}>
              <Undo size={13} />
            </div>

            {/* Play/Pause */}
            <div
              title="Воспроизведение / Пауза"
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

            <div title="+10 сек" style={roundIconBtnStyle}>
              <Redo size={13} />
            </div>
            <div title="Следующий файл" style={roundIconBtnStyle}>
              <SkipForward size={13} />
            </div>

            {isBtnVisible("shuffle", true) && (
              <div
                title="Случайный порядок"
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
