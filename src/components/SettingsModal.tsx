import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  Camera,
  Keyboard,
  RotateCcw,
  SlidersHorizontal,
  Palette,
  Monitor,
  Link,
  Link2,
  Loader2,
  Download,
  AudioLines,
  ExternalLink,
  Trash2,
} from "lucide-react";
import {
  HOTKEY_ACTIONS,
  getCustomHotkeys,
  saveCustomHotkeys,
  resetCustomHotkeys,
  getKeyDisplay,
} from "../utils/hotkeyUtils";
import { PASTEL_PRESETS, VIBRANT_PRESETS, GRADIENT_PRESETS, applyAccentColor } from "../utils/colorUtils";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [screenshotDir, setScreenshotDir] = useState<string>("");
  const [uiOpacity, setUiOpacity] = useState<number>(0.88);
  const [activeColor, setActiveColor] = useState<string>("#7fc7ff");
  const [showTrackNames, setShowTrackNames] = useState<boolean>(true);
  const [multiInstance, setMultiInstance] = useState<boolean>(false);
  const [saveTracksToVideoDir, setSaveTracksToVideoDir] = useState<boolean>(true);
  const [visibleButtons, setVisibleButtons] = useState<Record<string, boolean>>({});
  const [customHotkeys, setCustomHotkeys] = useState<Record<string, string>>(getCustomHotkeys());
  const [recordingAction, setRecordingAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "appearance" | "hotkeys" | "integration">("general");
  const [integrationLogs, setIntegrationLogs] = useState<string[]>([]);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isUnregistering, setIsUnregistering] = useState<boolean>(false);

  // Загружаем текущий путь к скриншотам из mpv
  useEffect(() => {
    const loadDir = async () => {
      try {
        const dir = await invoke<string>("get_screenshot_dir");
        setScreenshotDir(dir);
      } catch (e) {
        console.error("Ошибка загрузки папки скриншотов:", e);
      }
    };
    loadDir();

    // Загрузка прозрачности
    const savedOpacity = localStorage.getItem('l-mpv-ui-opacity');
    if (savedOpacity) {
      setUiOpacity(parseFloat(savedOpacity));
    }

    const savedAccent = localStorage.getItem('l-mpv-accent-color');
    if (savedAccent) {
      setActiveColor(savedAccent);
    }

    const savedShowTracks = localStorage.getItem('l-mpv-show-track-names');
    if (savedShowTracks !== null) {
      setShowTrackNames(savedShowTracks === 'true');
    }

    const savedBtns = localStorage.getItem('l-mpv-visible-buttons');
    if (savedBtns) {
      setVisibleButtons(JSON.parse(savedBtns));
    }

    const savedTrackDirSetting = localStorage.getItem('l-mpv-save-tracks-to-video-dir');
    if (savedTrackDirSetting !== null) {
      setSaveTracksToVideoDir(savedTrackDirSetting === 'true');
    }

    const loadMultiInstance = async () => {
      try {
        const val = await invoke<boolean>("get_multi_instance");
        setMultiInstance(val);
      } catch (e) {
        console.error("Ошибка загрузки multi_instance:", e);
      }
    };
    loadMultiInstance();
  }, []);

  // Выбор папки скриншотов через диалог Tauri
  const handlePickFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Выберите папку для сохранения скриншотов",
      });
      if (selected && typeof selected === "string") {
        await invoke("set_screenshot_dir", { path: selected });
        setScreenshotDir(selected);
      }
    } catch (e) {
      console.error("Ошибка выбора папки:", e);
    }
  };

  // Сброс папки скриншотов на значение по умолчанию ("screenshots")
  const handleResetDefault = async () => {
    try {
      const defaultPath = "screenshots";
      await invoke("set_screenshot_dir", { path: defaultPath });
      setScreenshotDir(defaultPath);
    } catch (e) {
      console.error("Ошибка сброса пути:", e);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 600, maxWidth: "90vw", maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        {/* Шапка модального окна */}
        <div className="modal__header" style={{ padding: "16px 20px", flexShrink: 0 }}>
          <h2 className="modal__title" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "1.15rem" }}>
            <SlidersHorizontal size={20} color="var(--accent)" /> Настройки
          </h2>
          <button className="modal__close" onClick={onClose} id="btn-settings-close" style={{ width: 32, height: 32, fontSize: "16px" }}>
            ✕
          </button>
        </div>

        {/* Навигация по вкладкам */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            padding: "0 20px",
            background: "rgba(0,0,0,0.15)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setActiveTab("general")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 18px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "general" ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === "general" ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: "0.92rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all var(--t-fast) var(--ease-smooth)",
            }}
          >
            <SlidersHorizontal size={17} /> Общие
          </button>
          <button
            onClick={() => setActiveTab("appearance")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 18px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "appearance" ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === "appearance" ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: "0.92rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all var(--t-fast) var(--ease-smooth)",
            }}
          >
            <Palette size={17} /> Кастом
          </button>
          <button
            onClick={() => setActiveTab("hotkeys")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 18px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "hotkeys" ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === "hotkeys" ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: "0.92rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all var(--t-fast) var(--ease-smooth)",
            }}
          >
            <Keyboard size={17} /> Горячие клавиши
          </button>
          <button
            onClick={() => setActiveTab("integration")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 18px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "integration" ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === "integration" ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: "0.92rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all var(--t-fast) var(--ease-smooth)",
            }}
          >
            <Link size={17} /> Интеграция
          </button>
        </div>

        {/* Тело модального окна */}
        <div className="modal__body" style={{ padding: "20px" }}>
          {activeTab === "general" && (
            <div className="modal__section">
              <div
                className="modal__section-title"
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", color: "var(--accent)", fontWeight: 600, textTransform: "none", letterSpacing: "normal" }}
              >
                <Camera size={16} /> Папка сохранения скриншотов
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14, marginBottom: 24 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
                    className="control-btn"
                    title="Выбрать папку"
                    style={{
                      width: "auto",
                      height: 38,
                      padding: "0 16px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--accent-glass)",
                      border: "1px solid var(--border-pill)",
                      color: "var(--accent)",
                      fontSize: "0.88rem",
                      fontWeight: 600,
                      gap: 8,
                    }}
                  >
                    <FolderOpen size={16} /> Обзор...
                  </button>
                  <button
                    onClick={handleResetDefault}
                    className="control-btn"
                    title="Сбросить на значение по умолчанию"
                    style={{
                      width: "auto",
                      height: 38,
                      padding: "0 12px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6
                    }}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>

                {/* Настройка Multi-instance */}
                <div
                  className="modal__section-title"
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", color: "var(--accent)", fontWeight: 600, textTransform: "none", letterSpacing: "normal", marginTop: 24, justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Monitor size={16} /> Режим нескольких окон (Multi-instance)
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
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
                    style={{
                      width: 18,
                      height: 18,
                      accentColor: "var(--accent)",
                      cursor: "pointer"
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Разрешить открытие нескольких копий плеера одновременно
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      (Изменение вступит в силу после полного перезапуска приложения)
                    </span>
                  </div>
                </label>

                {/* Настройка скачивания дорожек */}
                <div
                  className="modal__section-title"
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", color: "var(--accent)", fontWeight: 600, textTransform: "none", letterSpacing: "normal", marginTop: 24, justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Download size={16} /> Извлечение аудио и субтитров
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={saveTracksToVideoDir}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setSaveTracksToVideoDir(val);
                      localStorage.setItem('l-mpv-save-tracks-to-video-dir', val ? 'true' : 'false');
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
                      Скачивать дорожки в ту же папку, где находится видео
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      Если отключено, при нажатии «Скачать» будет открываться диалоговое окно Проводника с выбором папки
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="modal__section">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Настройка акцентного цвета */}
                <div
                  className="modal__section-title"
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", color: "var(--accent)", fontWeight: 600, textTransform: "none", letterSpacing: "normal", justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Palette size={16} /> Акцентный цвет
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Пастельные цвета
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <button
                      onClick={async () => {
                        try {
                          const winColor = await invoke<string>("get_windows_accent_color");
                          applyAccentColor(winColor);
                          setActiveColor("windows");
                          localStorage.setItem('l-mpv-accent-color', 'windows');
                        } catch (e) {
                          console.error("Ошибка получения цвета Windows", e);
                        }
                      }}
                      title="Использовать цвет Windows"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.1)",
                        border: activeColor === "windows" ? "2px solid white" : "2px solid transparent",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        transition: "all var(--t-fast) var(--ease-smooth)",
                      }}
                    >
                      <Monitor size={16} />
                    </button>
                    {PASTEL_PRESETS.map((hex) => (
                      <button
                        key={hex}
                        onClick={() => {
                          applyAccentColor(hex);
                          setActiveColor(hex);
                          localStorage.setItem('l-mpv-accent-color', hex);
                        }}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          backgroundColor: hex,
                          border: activeColor === hex ? "2px solid white" : "2px solid transparent",
                          cursor: "pointer",
                          boxShadow: activeColor === hex ? `0 0 12px ${hex}80` : "none",
                          transition: "all var(--t-fast) var(--ease-smooth)",
                        }}
                      />
                    ))}
                  </div>

                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Однотонные
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {VIBRANT_PRESETS.map((hex) => (
                      <button
                        key={hex}
                        onClick={() => {
                          applyAccentColor(hex);
                          setActiveColor(hex);
                          localStorage.setItem('l-mpv-accent-color', hex);
                        }}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          backgroundColor: hex,
                          border: activeColor === hex ? "2px solid white" : "2px solid transparent",
                          cursor: "pointer",
                          boxShadow: activeColor === hex ? `0 0 14px ${hex}A0` : "none",
                          transition: "all var(--t-fast) var(--ease-smooth)",
                        }}
                      />
                    ))}
                  </div>

                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Многоцветные градиенты
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {GRADIENT_PRESETS.map((grad) => (
                      <button
                        key={grad.id}
                        onClick={() => {
                          applyAccentColor(grad.id);
                          setActiveColor(grad.id);
                          localStorage.setItem('l-mpv-accent-color', grad.id);
                        }}
                        title={grad.name}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: grad.gradient,
                          border: activeColor === grad.id ? "2px solid white" : "2px solid transparent",
                          cursor: "pointer",
                          boxShadow: activeColor === grad.id ? `0 0 14px ${grad.baseColor}B0` : "none",
                          transition: "all var(--t-fast) var(--ease-smooth)",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Настройка прозрачности */}
                <div
                  className="modal__section-title"
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", color: "var(--accent)", fontWeight: 600, textTransform: "none", letterSpacing: "normal", marginTop: 20, justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SlidersHorizontal size={16} /> Прозрачность интерфейса
                  </div>
                  <button
                    onClick={() => {
                      setUiOpacity(0.88);
                      localStorage.setItem('l-mpv-ui-opacity', '0.88');
                      document.documentElement.style.setProperty('--ui-opacity', '0.88');
                    }}
                    className="control-btn"
                    title="Сбросить на значение по умолчанию"
                    style={{
                      width: "auto",
                      height: 28,
                      padding: "0 10px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: "0.75rem"
                    }}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.01"
                    value={uiOpacity}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setUiOpacity(val);
                      localStorage.setItem('l-mpv-ui-opacity', val.toString());
                      document.documentElement.style.setProperty('--ui-opacity', val.toString());
                    }}
                    style={{ flex: 1, cursor: "pointer", accentColor: "var(--accent)" }}
                  />
                  <div style={{ width: "45px", fontSize: "0.9rem", color: "var(--text-secondary)", textAlign: "right" }}>
                    {Math.round(uiOpacity * 100)}%
                  </div>
                </div>

                {/* Настройка отображения названий дорожек */}
                <div
                  className="modal__section-title"
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", color: "var(--accent)", fontWeight: 600, textTransform: "none", letterSpacing: "normal", marginTop: 24, justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AudioLines size={16} /> Названия дорожек на панели
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={showTrackNames}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setShowTrackNames(val);
                      localStorage.setItem('l-mpv-show-track-names', val ? 'true' : 'false');
                      window.dispatchEvent(new Event('l-mpv-settings-changed'));
                    }}
                    style={{
                      width: 18,
                      height: 18,
                      accentColor: "var(--accent)",
                      cursor: "pointer"
                    }}
                  />
                  <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                    Отображать короткое название выбранной аудиодорожки и субтитров рядом с иконками
                  </span>
                </label>

                {/* Настройка кнопок на панели управления */}
                <div
                  className="modal__section-title"
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", color: "var(--accent)", fontWeight: 600, textTransform: "none", letterSpacing: "normal", marginTop: 24, justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SlidersHorizontal size={16} /> Видимость кнопок панели управления
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
                  {[
                    { id: 'repeat', label: 'Повтор' },
                    { id: 'shuffle', label: 'Случайный порядок' },
                    { id: 'alwaysOnTop', label: 'Поверх всех окон' },
                    { id: 'info', label: 'Информация о файле' },
                    { id: 'screenshot', label: 'Сделать скриншот' },
                    { id: 'playlist', label: 'Плейлист' },
                    { id: 'fullscreen', label: 'Полный экран' }
                  ].map(btn => (
                    <label key={btn.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
                      <input
                        type="checkbox"
                        checked={visibleButtons[btn.id] !== false}
                        onChange={(e) => {
                          const val = e.target.checked;
                          const updated = { ...visibleButtons, [btn.id]: val };
                          setVisibleButtons(updated);
                          localStorage.setItem('l-mpv-visible-buttons', JSON.stringify(updated));
                          window.dispatchEvent(new Event('l-mpv-settings-changed'));
                        }}
                        style={{
                          width: 16,
                          height: 16,
                          accentColor: "var(--accent)",
                          cursor: "pointer"
                        }}
                      />
                      <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500 }}>
                        {btn.label}
                      </span>
                    </label>
                  ))}
                </div>

              </div>
            </div>
          )}

          {activeTab === "hotkeys" && (
            <div className="modal__section">
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--accent-glass)",
                  border: "1px solid var(--border-pill)",
                  color: "var(--accent)",
                  fontSize: "0.86rem",
                  lineHeight: "1.4",
                  marginBottom: 16,
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>💡 Нажмите на любую клавишу в списке ниже, чтобы назначить свою комбинацию!</span>
                <button
                  onClick={() => {
                    resetCustomHotkeys();
                    setCustomHotkeys(getCustomHotkeys());
                  }}
                  title="Сбросить все клавиши по умолчанию"
                  style={{
                    background: "rgba(255, 255, 255, 0.1)",
                    border: "1px solid var(--border)",
                    color: "white",
                    borderRadius: "var(--radius-sm)",
                    padding: "4px 8px",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <RotateCcw size={12} /> Сбросить
                </button>
              </div>

              <div
                className="modal__section-title"
                style={{ fontSize: "0.92rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "none", letterSpacing: "normal", marginBottom: 10 }}
              >
                Назначения горячих клавиш
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {HOTKEY_ACTIONS.map((item) => {
                  const currentCode = customHotkeys[item.id] || item.defaultKey;
                  const isRecording = recordingAction === item.id;
                  const keyText = getKeyDisplay(item.id, currentCode);

                  return (
                    <div
                      key={item.id}
                      className="modal__row"
                      style={{
                        padding: "10px 14px",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.04)",
                        borderRadius: "var(--radius-md)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-primary)", fontSize: "0.9rem", fontWeight: 500 }}>
                        {item.label}
                      </span>
                      <button
                        onClick={() => {
                          setRecordingAction(item.id);
                        }}
                        onKeyDown={(e) => {
                          if (isRecording) {
                            e.preventDefault();
                            e.stopPropagation();
                            const newCode = e.code || e.key;
                            const updated = { ...customHotkeys, [item.id]: newCode };
                            setCustomHotkeys(updated);
                            saveCustomHotkeys(updated);
                            setRecordingAction(null);
                          }
                        }}
                        style={{
                          padding: "4px 12px",
                          background: isRecording ? "var(--accent)" : "rgba(127, 199, 255, 0.12)",
                          border: isRecording ? "1px solid white" : "1px solid rgba(127, 199, 255, 0.2)",
                          borderRadius: "var(--radius-sm)",
                          fontFamily: "monospace",
                          fontSize: "0.84rem",
                          fontWeight: 600,
                          color: isRecording ? "#000" : "var(--accent)",
                          cursor: "pointer",
                          outline: "none",
                          transition: "all var(--t-fast) var(--ease-smooth)",
                        }}
                      >
                        {isRecording ? "Нажмите клавишу..." : keyText}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "integration" && (
            <div className="modal__section">
              <div
                className="modal__section-title"
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", color: "var(--accent)", fontWeight: 600, textTransform: "none", letterSpacing: "normal" }}
              >
                <Link size={16} /> Ассоциации файлов (Windows)
              </div>
              <div style={{ fontSize: "0.86rem", color: "var(--text-secondary)", marginTop: 8, marginBottom: 16, lineHeight: 1.5 }}>
                Настройте ассоциации видео- и аудиофайлов с L-MPV. Это позволит открывать файлы напрямую по двойному клику в Проводнике Windows.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                <button
                  disabled={isRegistering || isUnregistering}
                  onClick={async () => {
                    setIsRegistering(true);
                    try {
                      const logs = await invoke<string[]>("register_file_associations");
                      setIntegrationLogs(logs);
                    } catch (e) {
                      setIntegrationLogs([`[ERROR] Не удалось зарегистрировать: ${e}`]);
                    } finally {
                      setIsRegistering(false);
                    }
                  }}
                  className="settings-action-btn settings-action-btn--primary"
                  title="Зарегистрировать ассоциации всех поддерживаемых видео- и аудиоформатов с L-MPV"
                  style={{ width: "100%" }}
                >
                  {isRegistering ? (
                    <>
                      <Loader2 size={16} className="spin-animation" />
                      Связывание файлов...
                    </>
                  ) : (
                    <>
                      <Link2 size={16} />
                      Связать медиафайлы с L-MPV
                    </>
                  )}
                </button>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={async () => {
                      try {
                        await invoke("open_default_apps_settings");
                        setIntegrationLogs((prev) => [
                          ...prev,
                          "[INFO] Открыто системное окно Windows 'Приложения по умолчанию'",
                        ]);
                      } catch (e) {
                        setIntegrationLogs((prev) => [
                          ...prev,
                          `[ERROR] Не удалось открыть настройки: ${e}`,
                        ]);
                      }
                    }}
                    className="settings-action-btn settings-action-btn--secondary"
                    title="Открыть системные параметры Windows 'Приложения по умолчанию'"
                    style={{ flex: 1 }}
                  >
                    <ExternalLink size={15} /> Настройки Windows
                  </button>

                  <button
                    disabled={isRegistering || isUnregistering}
                    onClick={async () => {
                      setIsUnregistering(true);
                      try {
                        const logs = await invoke<string[]>("unregister_file_associations");
                        setIntegrationLogs(logs);
                      } catch (e) {
                        setIntegrationLogs([`[ERROR] Не удалось удалить: ${e}`]);
                      } finally {
                        setIsUnregistering(false);
                      }
                    }}
                    className="settings-action-btn settings-action-btn--danger"
                    title="Удалить привязку медиаформатов к L-MPV из реестра Windows"
                    style={{ flex: 1 }}
                  >
                    {isUnregistering ? (
                      <>
                        <Loader2 size={15} className="spin-animation" />
                        Удаление...
                      </>
                    ) : (
                      <>
                        <Trash2 size={15} /> Удалить ассоциации
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "#0c0c0c",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "12px",
                  height: "200px",
                  overflowY: "auto",
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  color: "#d4d4d4",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4
                }}
              >
                {integrationLogs.length === 0 ? (
                  <span style={{ color: "#808080" }}>Здесь появится вывод процесса...</span>
                ) : (
                  integrationLogs.map((log, i) => {
                    let color = "#d4d4d4";
                    if (log.startsWith("[OK]") || log.startsWith("[DONE]")) color = "#4caf50";
                    if (log.startsWith("[ERROR]")) color = "#f44336";
                    if (log.startsWith("[WARN]")) color = "#ff9800";
                    if (log.startsWith("[INFO]")) color = "#2196f3";
                    return (
                      <div key={i} style={{ color }}>{log}</div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
