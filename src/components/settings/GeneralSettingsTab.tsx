import {
  FolderOpen, Film, Download, Camera, RotateCcw, Monitor, AudioLines, Sparkles, MousePointer2
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { AccordionSection } from "./AccordionSection";

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

  return (
    <>
                    <div className="modal__section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* 1. Папка сохранения скриншотов */}
              <AccordionSection
                isOpen={!!openSections["gen_screenshots"]}
                onToggle={() => toggleSection("gen_screenshots")}
                icon={<Camera size={16} />}
                title="Папка сохранения скриншотов"
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
                  <input
                    type="text"
                    readOnly
                    value={screenshotDir || "Загрузка..."}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      background: "rgba(0, 0, 0, 0.45)",
                      border: "1px solid var(--border-pill)",
                      borderRadius: "var(--radius-md)",
                      color: "var(--text-primary)",
                      fontSize: "0.88rem",
                      fontFamily: "monospace",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handlePickFolder}
                    className="btn btn--secondary btn--sm"
                    style={{
                      height: 38,
                      padding: "0 16px",
                      borderRadius: "var(--radius-md)",
                      fontSize: "0.88rem",
                      fontWeight: 600,
                      gap: 8,
                    }}
                  >
                    <FolderOpen size={16} /> Обзор...
                  </button>
                  <button
                    onClick={handleResetDefault}
                    className="btn btn--secondary btn--icon"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              </AccordionSection>

              {/* 2. Режим нескольких окон (Multi-instance) */}
              <AccordionSection
                isOpen={!!openSections["gen_multi_instance"]}
                onToggle={() => toggleSection("gen_multi_instance")}
                icon={<Monitor size={16} />}
                title="Режим нескольких окон (Multi-instance)"
              >
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
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
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Разрешить открытие нескольких копий плеера одновременно
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      (Изменение вступит в силу после полного перезапуска приложения)
                    </span>
                  </div>
                </label>
              </AccordionSection>

              {/* 3. Извлечение аудио и субтитров */}
              <AccordionSection
                isOpen={!!openSections["gen_track_extraction"]}
                onToggle={() => toggleSection("gen_track_extraction")}
                icon={<Download size={16} />}
                title="Извлечение аудио и субтитров"
              >
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={saveTracksToVideoDir}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setSaveTracksToVideoDir(val);
                      localStorage.setItem('l-mpv-save-tracks-to-video-dir', val ? 'true' : 'false');
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Скачивать дорожки в ту же папку, где находится видео
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      Если отключено, при нажатии «Скачать» будет открываться диалоговое окно Проводника с выбором папки
                    </span>
                  </div>
                </label>
              </AccordionSection>

              {/* 4. Автоматическое подключение дорожек */}
              <AccordionSection
                isOpen={!!openSections["gen_auto_tracks"]}
                onToggle={() => toggleSection("gen_auto_tracks")}
                icon={<AudioLines size={16} />}
                title="Автоматическое подключение дорожек"
              >
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
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
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Автоматически подхватывать внешние аудиодорожки и субтитры
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      Подключает файлы для текущей серии из папки с видео и её подпапок первого уровня (Audio, Subs и др.)
                    </span>
                  </div>
                </label>

                {autoLoadTracks && (
                  <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, marginLeft: 28, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      className="ui-checkbox"
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
                      <span style={{ fontSize: "0.86rem", color: "var(--text-primary)", fontWeight: 500 }}>
                        Автоматически переключать звук на подхваченную внешнюю аудиодорожку
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Если выключено (по умолчанию), внешнее аудио добавляется в список, но воспроизводится оригинальный звук видео
                      </span>
                    </div>
                  </label>
                )}
              </AccordionSection>

              {/* 5. Хотлоад дорожек (Drag & Drop) */}
              <AccordionSection
                isOpen={!!openSections["gen_hotload"]}
                onToggle={() => toggleSection("gen_hotload")}
                icon={<Sparkles size={16} />}
                title="Хотлоад дорожек (Drag & Drop)"
              >
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={hotloadEnabled}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setHotloadEnabled(val);
                      localStorage.setItem('l-mpv-hotload-enabled', val ? 'true' : 'false');
                      window.dispatchEvent(new Event('l-mpv-settings-changed'));
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Подключать перетаскиваемые файлы к видео на лету (Хотлоад)
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      Если включено, перетаскивание аудиофайла или субтитров в окно плеера во время воспроизведения подключит их к текущему видео вместо открытия нового файла
                    </span>
                  </div>
                </label>
              </AccordionSection>

              {/* 6. Поведение по окончании видео */}
              <AccordionSection
                isOpen={!!openSections["gen_end_action"]}
                onToggle={() => toggleSection("gen_end_action")}
                icon={<Film size={16} />}
                title="Поведение по окончании видео"
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="radio"
                      name="playNextOnEnd"
                      checked={playNextOnEnd}
                      onChange={async () => {
                        setPlayNextOnEnd(true);
                        try {
                          await invoke("set_play_next_on_end", { enabled: true });
                        } catch (err) {
                          console.error("Ошибка сохранения настройки play_next_on_end:", err);
                        }
                      }}
                      style={{
                        width: 18,
                        height: 18,
                        accentColor: "var(--accent)",
                        cursor: "pointer"
                      }}
                    />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                        Переключать на следующее видео (по умолчанию)
                      </span>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Автоматически воспроизводить следующий файл в плейлисте после завершения текущего
                      </span>
                    </div>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="radio"
                      name="playNextOnEnd"
                      checked={!playNextOnEnd}
                      onChange={async () => {
                        setPlayNextOnEnd(false);
                        try {
                          await invoke("set_play_next_on_end", { enabled: false });
                        } catch (err) {
                          console.error("Ошибка сохранения настройки play_next_on_end:", err);
                        }
                      }}
                      style={{
                        width: 18,
                        height: 18,
                        accentColor: "var(--accent)",
                        cursor: "pointer"
                      }}
                    />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                        Ничего не делать
                      </span>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Останавливать воспроизведение на последнем кадре (нажатие на пуск перезапустит видео с начала)
                      </span>
                    </div>
                  </label>
                </div>
              </AccordionSection>

              {/* 7. Автоматическое скрытие интерфейса */}
              <AccordionSection
                isOpen={!!openSections["gen_hide_controls_upper"]}
                onToggle={() => toggleSection("gen_hide_controls_upper")}
                icon={<MousePointer2 size={16} />}
                title="Скрытие интерфейса в полноэкранном режиме"
              >
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={hideControlsInUpperHalf}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setHideControlsInUpperHalf(val);
                      localStorage.setItem('l-mpv-hide-controls-upper-half', val ? 'true' : 'false');
                      window.dispatchEvent(new Event('l-mpv-settings-changed'));
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Скрывать весь интерфейс при наведении мыши на самый верх в полноэкранном режиме
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      В режиме во весь экран, когда курсор подводится к верхнему краю, весь интерфейс (верхняя шапка и нижняя панель управления) моментально скрывается
                    </span>
                  </div>
                </label>
              </AccordionSection>
            </div>
    </>
  );
}
