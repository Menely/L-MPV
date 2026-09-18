import React from "react";
import {
  FolderOpen, Film, Download, Camera, RotateCcw, Monitor, AudioLines, Sparkles, MousePointer2, Play, CornerDownRight, MousePointerClick
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { AccordionSection } from "./AccordionSection";
import { ContextMenuSettingsTab } from "./ContextMenuSettingsTab";

interface GeneralSettingsTabProps {
  multiInstance: boolean;
  setMultiInstance: (v: boolean) => void;
  saveTracksToVideoDir: boolean;
  setSaveTracksToVideoDir: (v: boolean) => void;
  autoLoadTracks: boolean;
  setAutoLoadTracks: (v: boolean) => void;
  autoSelectExternalAudio: boolean;
  setAutoSelectExternalAudio: (v: boolean) => void;
  playNextOnEnd: boolean;
  setPlayNextOnEnd: (v: boolean) => void;
  hotloadEnabled: boolean;
  setHotloadEnabled: (v: boolean) => void;
  hideControlsInUpperHalf: boolean;
  setHideControlsInUpperHalf: (v: boolean) => void;
  openSections: Record<string, boolean>;
  onToggleSection: (id: string) => void;
  screenshotDir: string;
  handlePickFolder: () => void;
  handleResetDefault: () => void;
}

export function GeneralSettingsTab(props: GeneralSettingsTabProps) {
  const {
    multiInstance, setMultiInstance,
    saveTracksToVideoDir, setSaveTracksToVideoDir,
    autoLoadTracks, setAutoLoadTracks,
    autoSelectExternalAudio, setAutoSelectExternalAudio,
    playNextOnEnd, setPlayNextOnEnd,
    hotloadEnabled, setHotloadEnabled,
    hideControlsInUpperHalf, setHideControlsInUpperHalf,
    openSections, onToggleSection: toggleSection,
    screenshotDir, handlePickFolder, handleResetDefault
  } = props;

  // Стиль карточки подблока с парящей тенью и полупрозрачным фоном темы
  const cardStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 14px",
    background: "rgba(255, 255, 255, 0.025)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.32), 0 1px 3px rgba(0, 0, 0, 0.22)",
    transition: "border-color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
  };

  return (
    <div className="modal__section" style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── 1. Скриншоты и медиатека ── */}
      <AccordionSection
        isOpen={openSections["gen_screenshots"] === true}
        onToggle={() => toggleSection("gen_screenshots")}
        icon={<Camera size={16} />}
        title="Скриншоты и медиатека"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Camera size={14} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  Папка сохранения скриншотов
                </span>
              </div>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                Горячая клавиша: <strong style={{ color: "var(--accent)" }}>S</strong> (без субтитров: <strong style={{ color: "var(--accent)" }}>Shift+S</strong>)
              </span>
            </div>
            
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
              Кадры сохраняются в оригинальном исходном разрешении видеопотока без сжатия интерфейсом.
            </span>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <input
                type="text"
                readOnly
                value={screenshotDir || "Загрузка..."}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  background: "rgba(0, 0, 0, 0.4)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "0.80rem",
                  fontFamily: "var(--font-mono, monospace)",
                  outline: "none",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={screenshotDir}
              />
              <button
                type="button"
                onClick={handlePickFolder}
                className="btn btn--secondary btn--sm"
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  gap: 6,
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <FolderOpen size={14} /> Обзор...
              </button>
              <button
                type="button"
                onClick={handleResetDefault}
                className="btn btn--secondary btn--icon"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
                title="Сбросить на папку screenshots по умолчанию"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* ── 2. Воспроизведение и окна ── */}
      <AccordionSection
        isOpen={openSections["gen_playback"] === true}
        onToggle={() => toggleSection("gen_playback")}
        icon={<Play size={16} />}
        title="Воспроизведение и окна"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          
          {/* 1.1 Поведение по окончании видео (Сегментный селектор) */}
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <Film size={14} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Поведение по окончании видео
              </span>
            </div>
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35, marginBottom: 4 }}>
              Выберите, какое действие выполняет плеер после завершения воспроизведения текущего файла.
            </span>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className={`compact-segment-btn ${playNextOnEnd ? "compact-segment-btn--active" : ""}`}
                style={{ height: 42, padding: "6px 10px", flexDirection: "column", alignItems: "flex-start", textAlign: "left", gap: 2 }}
                onClick={async () => {
                  setPlayNextOnEnd(true);
                  try {
                    await invoke("set_play_next_on_end", { enabled: true });
                  } catch (err) {
                    console.error("Ошибка сохранения настройки play_next_on_end:", err);
                  }
                }}
              >
                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: playNextOnEnd ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  Следующее видео (по умолчанию)
                </span>
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 400 }}>
                  Автоматический переход к следующему файлу в плейлисте
                </span>
              </button>

              <button
                type="button"
                className={`compact-segment-btn ${!playNextOnEnd ? "compact-segment-btn--active" : ""}`}
                style={{ height: 42, padding: "6px 10px", flexDirection: "column", alignItems: "flex-start", textAlign: "left", gap: 2 }}
                onClick={async () => {
                  setPlayNextOnEnd(false);
                  try {
                    await invoke("set_play_next_on_end", { enabled: false });
                  } catch (err) {
                    console.error("Ошибка сохранения настройки play_next_on_end:", err);
                  }
                }}
              >
                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: !playNextOnEnd ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  Остановить воспроизведение
                </span>
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 400 }}>
                  Пауза на финальном кадре (Play запустит сначала)
                </span>
              </button>
            </div>
          </div>

          {/* 1.2 Режим нескольких окон (Multi-instance) */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={multiInstance}
                onChange={async (e) => {
                  const val = e.target.checked;
                  setMultiInstance(val);
                  try {
                    await invoke("set_multi_instance", { allow: val });
                  } catch (err) {
                    console.error(err);
                  }
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Monitor size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    Режим нескольких окон (Multi-instance)
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  Разрешить открытие нескольких независимых копий плеера одновременно при запуске новых файлов.
                  <span style={{ color: "var(--accent)", marginLeft: 4 }}>
                    (Вступает в силу после перезапуска приложения)
                  </span>
                </span>
              </div>
            </label>
          </div>

          {/* 1.3 Скрытие интерфейса в полноэкранном режиме */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={hideControlsInUpperHalf}
                onChange={(e) => {
                  const val = e.target.checked;
                  setHideControlsInUpperHalf(val);
                  localStorage.setItem('l-mpv-hide-controls-upper-half', val ? 'true' : 'false');
                  window.dispatchEvent(new Event('l-mpv-settings-changed'));
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <MousePointer2 size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    Скрытие интерфейса у верхнего края экрана
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  В режиме во весь экран моментально скрывать шапку окна и панель управления, когда курсор подводится к верхней части экрана, для чистого погружения в просмотр.
                </span>
              </div>
            </label>
          </div>

        </div>
      </AccordionSection>

      {/* ── 3. Аудиодорожки и субтитры ── */}
      <AccordionSection
        isOpen={openSections["gen_tracks"] === true}
        onToggle={() => toggleSection("gen_tracks")}
        icon={<AudioLines size={16} />}
        title="Аудиодорожки и субтитры"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          
          {/* 2.1 Автоматический подхват внешних дорожек */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={autoLoadTracks}
                onChange={async (e) => {
                  const val = e.target.checked;
                  setAutoLoadTracks(val);
                  try {
                    await invoke("set_auto_load_tracks", { enabled: val });
                  } catch (err) {
                    console.error("Ошибка сохранения настройки auto_load_tracks:", err);
                  }
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <AudioLines size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    Автоматический подхват внешних дорожек
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  Автоматически подключает совместимые аудиофайлы и субтитры из папки с видео и её подпапок (Audio, Subs, Subtitles...).
                </span>
              </div>
            </label>

            {/* Вложенная опция: авто-переключение на подхваченную дорожку */}
            {autoLoadTracks && (
              <div
                style={{
                  marginTop: 6,
                  marginLeft: 26,
                  paddingLeft: 12,
                  borderLeft: "2px solid var(--accent)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    style={{ marginTop: 2 }}
                    checked={autoSelectExternalAudio}
                    onChange={async (e) => {
                      const val = e.target.checked;
                      setAutoSelectExternalAudio(val);
                      try {
                        await invoke("set_auto_select_external_audio", { enabled: val });
                      } catch (err) {
                        console.error("Ошибка сохранения настройки auto_select_external_audio:", err);
                      }
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <CornerDownRight size={13} style={{ color: "var(--accent)" }} />
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        Переключать воспроизведение на найденную внешнюю аудиодорожку
                      </span>
                    </div>
                    <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2, lineHeight: 1.3 }}>
                      Если отключено, внешний звук добавляется в меню дорожек, но по умолчанию играет встроенная дорожка видео.
                    </span>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* 2.2 Хотлоад дорожек перетаскиванием (Drag & Drop) */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={hotloadEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setHotloadEnabled(val);
                  localStorage.setItem('l-mpv-hotload-enabled', val ? 'true' : 'false');
                  window.dispatchEvent(new Event('l-mpv-settings-changed'));
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    Хотлоад дорожек на лету (Drag & Drop)
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  Перетаскивание файла аудио или субтитров в окно плеера во время воспроизведения мгновенно подключит его к текущему видео вместо открытия нового файла.
                </span>
              </div>
            </label>
          </div>

          {/* 2.3 Папка для извлечения аудио и субтитров */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={saveTracksToVideoDir}
                onChange={(e) => {
                  const val = e.target.checked;
                  setSaveTracksToVideoDir(val);
                  localStorage.setItem('l-mpv-save-tracks-to-video-dir', val ? 'true' : 'false');
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Download size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    Сохранять извлеченные дорожки в папку видео
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  При экспорте дорожки через кнопку «Скачать» сохранять файл прямо в каталог с фильмом. Если выключено — открывается окно Проводника для выбора папки вручную.
                </span>
              </div>
            </label>
          </div>

        </div>
      </AccordionSection>

      {/* ── 4. Настройка контекстного меню (PКМ) ── */}
      <AccordionSection
        isOpen={openSections["gen_context_menu"] === true}
        onToggle={() => toggleSection("gen_context_menu")}
        icon={<MousePointerClick size={16} />}
        title="Контекстное меню (ПКМ)"
      >
        <div style={{ marginTop: 8 }}>
          <ContextMenuSettingsTab />
        </div>
      </AccordionSection>

    </div>
  );
}
