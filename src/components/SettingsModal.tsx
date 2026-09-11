import { useState, useEffect, useRef } from "react";
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
  Sparkles,
  RefreshCw,
} from "lucide-react";
import {
  HOTKEY_ACTIONS,
  getCustomHotkeys,
  saveCustomHotkeys,
  resetCustomHotkeys,
  resetSingleHotkey,
  getKeyDisplay,
} from "../utils/hotkeyUtils";
import { PASTEL_PRESETS, VIBRANT_PRESETS, applyAccentColor } from "../utils/colorUtils";
import { UpdateInfo } from "./UpdateModal";

interface AmbientSettings {
  mode: "off" | "blur" | "color";
  blur_radius: number;
  color: string;
}

interface SettingsModalProps {
  onClose: () => void;
  onShowUpdate?: (info: UpdateInfo) => void;
}

export function SettingsModal({ onClose, onShowUpdate }: SettingsModalProps) {
  const [screenshotDir, setScreenshotDir] = useState<string>("");
  const [uiOpacity, setUiOpacity] = useState<number>(0.88);
  const [activeColor, setActiveColor] = useState<string>("#7fc7ff");
  const [showTrackNames, setShowTrackNames] = useState<boolean>(true);
  const [multiInstance, setMultiInstance] = useState<boolean>(false);
  const [saveTracksToVideoDir, setSaveTracksToVideoDir] = useState<boolean>(true);
  const [autoLoadTracks, setAutoLoadTracks] = useState<boolean>(false);
  const [autoSelectExternalAudio, setAutoSelectExternalAudio] = useState<boolean>(false);
  const [appVersion, setAppVersion] = useState<string>("1.3.1");
  const [visibleButtons, setVisibleButtons] = useState<Record<string, boolean>>({});
  const [customHotkeys, setCustomHotkeys] = useState<Record<string, string[]>>(getCustomHotkeys());
  const [recordingAction, setRecordingAction] = useState<{ id: string, index: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "appearance" | "hotkeys" | "integration">("general");
  const [integrationLogs, setIntegrationLogs] = useState<string[]>([]);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isUnregistering, setIsUnregistering] = useState<boolean>(false);
  const [ambientSettings, setAmbientSettings] = useState<AmbientSettings>({
    mode: "off",
    blur_radius: 100,
    color: "#7fc7ff",
  });

  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const updateStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ambientSettingsRef = useRef<AmbientSettings>(ambientSettings);
  ambientSettingsRef.current = ambientSettings;
  const isAmbientDirtyRef = useRef<boolean>(false);
  const ambientSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Сброс таймера статуса при размонтировании
  useEffect(() => {
    return () => {
      if (updateStatusTimerRef.current) {
        clearTimeout(updateStatusTimerRef.current);
      }
    };
  }, []);

  // Сброс несохраненных изменений на диск при закрытии/размонтировании модального окна
  useEffect(() => {
    return () => {
      if (ambientSaveTimeoutRef.current) {
        clearTimeout(ambientSaveTimeoutRef.current);
        ambientSaveTimeoutRef.current = null;
      }
      if (isAmbientDirtyRef.current) {
        isAmbientDirtyRef.current = false;
        invoke("set_ambient_settings", { settings: ambientSettingsRef.current }).catch(console.error);
      }
    };
  }, []);

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

    const loadAutoLoadTracks = async () => {
      try {
        const val = await invoke<boolean>("get_auto_load_tracks");
        setAutoLoadTracks(val);
      } catch (e) {
        console.error("Ошибка загрузки настройки auto_load_tracks:", e);
      }
    };
    loadAutoLoadTracks();

    const loadAutoSelectAudio = async () => {
      try {
        const val = await invoke<boolean>("get_auto_select_external_audio");
        setAutoSelectExternalAudio(val);
      } catch (e) {
        console.error("Ошибка загрузки настройки auto_select_external_audio:", e);
      }
    };
    loadAutoSelectAudio();

    const loadVersion = async () => {
      try {
        const ver = await invoke<string>("get_app_version");
        setAppVersion(ver);
      } catch (e) {
        console.error("Ошибка загрузки версии приложения:", e);
      }
    };
    loadVersion();

    const loadAmbient = async () => {
      try {
        const val = await invoke<AmbientSettings>("get_ambient_settings");
        setAmbientSettings(val);
      } catch (e) {
        console.error("Ошибка загрузки настроек Ambient Light:", e);
      }
    };
    loadAmbient();

    const handleAmbientChanged = () => {
      loadAmbient();
    };
    window.addEventListener("l-mpv-ambient-changed", handleAmbientChanged);

    return () => {
      window.removeEventListener("l-mpv-ambient-changed", handleAmbientChanged);
    };
  }, []);

  // Оптимизированное применение: мгновенный шейдерный preview на GPU + отложенное сохранение на диск (Debounce 400ms)
  const updateAmbient = async (newSettings: Partial<AmbientSettings>, immediateSave: boolean = false) => {
    const updated = { ...ambientSettingsRef.current, ...newSettings };
    ambientSettingsRef.current = updated;
    setAmbientSettings(updated);

    // 1. Мгновенное применение шейдеров в mpv без блокирующего дискового ввода-вывода
    try {
      await invoke("apply_ambient_preview", { settings: updated });
    } catch (err) {
      console.error("Ошибка предпросмотра Ambient Light:", err);
    }

    // 2. Дебаунсинг сохранения настроек в файл config/settings.json
    if (ambientSaveTimeoutRef.current) {
      clearTimeout(ambientSaveTimeoutRef.current);
      ambientSaveTimeoutRef.current = null;
    }

    if (immediateSave) {
      isAmbientDirtyRef.current = false;
      try {
        await invoke("set_ambient_settings", { settings: updated });
        window.dispatchEvent(new Event('l-mpv-ambient-changed'));
      } catch (err) {
        console.error("Ошибка сохранения настроек Ambient Light:", err);
      }
    } else {
      isAmbientDirtyRef.current = true;
      ambientSaveTimeoutRef.current = setTimeout(async () => {
        isAmbientDirtyRef.current = false;
        try {
          await invoke("set_ambient_settings", { settings: updated });
          window.dispatchEvent(new Event('l-mpv-ambient-changed'));
        } catch (err) {
          console.error("Ошибка отложенного сохранения настроек Ambient Light:", err);
        }
      }, 400);
    }
  };

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

  // Ручная проверка обновлений через GitHub Releases API
  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus(null);
    if (updateStatusTimerRef.current) {
      clearTimeout(updateStatusTimerRef.current);
      updateStatusTimerRef.current = null;
    }

    try {
      const info = await invoke<UpdateInfo>("check_for_updates");
      if (info.has_update) {
        setUpdateStatus(`Найдено обновление v${info.latest_version.replace(/^[vV]/, "")}`);
        if (onShowUpdate) {
          onShowUpdate(info);
        }
      } else {
        setUpdateStatus("У вас последняя версия");
        updateStatusTimerRef.current = setTimeout(() => setUpdateStatus(null), 4000);
      }
    } catch (err) {
      console.error("Ошибка проверки обновлений:", err);
      setUpdateStatus("Не удалось проверить");
      updateStatusTimerRef.current = setTimeout(() => setUpdateStatus(null), 4000);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{
          width: 650,
          maxWidth: "92vw",
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
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

                {/* Настройка автоподхвата внешних дорожек */}
                <div
                  className="modal__section-title"
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", color: "var(--accent)", fontWeight: 600, textTransform: "none", letterSpacing: "normal", marginTop: 24, justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AudioLines size={16} /> Автоматическое подключение дорожек
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
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
                    style={{
                      width: 18,
                      height: 18,
                      accentColor: "var(--accent)",
                      cursor: "pointer"
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      Автоматически подхватывать внешние аудиодорожки и субтитры
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                      Подключает файлы для текущей серии из папки с видео и её подпапок первого уровня (Audio, Subs и др.)
                    </span>
                  </div>
                </label>

                {/* Вложенная настройка автовыбора подхваченной аудиодорожки */}
                {autoLoadTracks && (
                  <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, marginLeft: 28, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
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
                      style={{
                        width: 18,
                        height: 18,
                        accentColor: "var(--accent)",
                        cursor: "pointer"
                      }}
                    />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: "0.86rem", color: "var(--text-primary)", fontWeight: 500 }}>
                        Автоматически переключать звук на подхваченную внешнюю аудиодорожку
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Если выключено (по умолчанию), внешнее аудио добавляется в список, но воспроизводится оригинальный звук видео
                      </span>
                    </div>
                  </label>
                )}
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

                {/* Настройка подсветки полос (Ambient Light / GPU Blur) */}
                <div
                  className="modal__section-title"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: "0.95rem",
                    color: "var(--accent)",
                    fontWeight: 600,
                    textTransform: "none",
                    letterSpacing: "normal",
                    marginTop: 24,
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Sparkles size={16} /> Подсветка черных полос (Ambient Light)
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
                  <span style={{ fontSize: "0.80rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    Заполняет пустые области экрана (letterbox/pillarbox) при просмотре широкоформатных видео или в полноэкранном режиме.
                  </span>

                  {/* Переключатель режимов */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 8,
                      padding: 4,
                      background: "rgba(255, 255, 255, 0.03)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {[
                      { id: "off", label: "Выключено", desc: "Черные полосы" },
                      { id: "blur", label: "Размытие (GPU)", desc: "Шейдерный Blur" },
                      { id: "color", label: "Цветной фон", desc: "Свечение цветом" },
                    ].map((item) => {
                      const isSel = ambientSettings.mode === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => updateAmbient({ mode: item.id as "off" | "blur" | "color" }, true)}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                            padding: "8px 6px",
                            borderRadius: "var(--radius-sm)",
                            border: "none",
                            cursor: "pointer",
                            background: isSel ? "var(--accent-glow)" : "transparent",
                            color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                            boxShadow: isSel
                              ? "0 0 12px var(--accent-glow), inset 0 0 0 1px var(--accent)"
                              : "none",
                            transition: "all var(--t-fast) var(--ease-smooth)",
                          }}
                        >
                          <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{item.label}</span>
                          <span style={{ fontSize: "0.70rem", color: isSel ? "var(--accent-hover)" : "var(--text-muted)" }}>
                            {item.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Настройка радиуса размытия (только для режима blur) */}
                  {ambientSettings.mode === "blur" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                          Радиус аппаратного размытия (Blur Radius)
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: "0.85rem", color: "var(--accent)", fontWeight: 600 }}>
                            {ambientSettings.blur_radius} px
                          </span>
                          <button
                            onClick={() => updateAmbient({ blur_radius: 100 }, true)}
                            className="control-btn"
                            title="Сбросить на 100px"
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "var(--radius-sm)",
                              background: "rgba(255, 255, 255, 0.05)",
                              border: "1px solid var(--border)",
                              color: "var(--text-secondary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="150"
                        step="5"
                        value={ambientSettings.blur_radius}
                        onChange={(e) => updateAmbient({ blur_radius: parseInt(e.target.value, 10) }, false)}
                        style={{ width: "100%", cursor: "pointer", accentColor: "var(--accent)" }}
                      />
                    </div>
                  )}

                  {/* Настройка цвета (только для режима color) */}
                  {ambientSettings.mode === "color" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                        Цвет подсветки черных полос
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <button
                          onClick={() => updateAmbient({ color: activeColor === "windows" ? "#7fc7ff" : activeColor }, true)}
                          title="Использовать текущий акцент плеера"
                          style={{
                            padding: "6px 12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                            background: "var(--accent-glass)",
                            color: "var(--accent)",
                            fontSize: "0.78rem",
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          Как в теме ({activeColor === "windows" ? "Windows" : activeColor})
                        </button>

                        {["#141923", "#1f2937", "#241e38", "#2d1c24", "#132a24", "#0a192f"].map((hex) => (
                          <button
                            key={hex}
                            onClick={() => updateAmbient({ color: hex }, true)}
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: "50%",
                              backgroundColor: hex,
                              border: ambientSettings.color === hex ? "2px solid white" : "1px solid var(--border)",
                              cursor: "pointer",
                              boxShadow: ambientSettings.color === hex ? `0 0 10px ${hex}` : "none",
                              transition: "all var(--t-fast) var(--ease-smooth)",
                            }}
                          />
                        ))}

                        <input
                          type="color"
                          value={ambientSettings.color.startsWith("#") ? ambientSettings.color : "#7fc7ff"}
                          onChange={(e) => updateAmbient({ color: e.target.value }, false)}
                          title="Выбрать произвольный цвет"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            border: "none",
                            cursor: "pointer",
                            background: "none",
                          }}
                        />
                      </div>
                    </div>
                  )}
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

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {(() => {
                  const categorizedHotkeys = HOTKEY_ACTIONS.reduce((acc, item) => {
                    if (!acc[item.category]) acc[item.category] = [];
                    acc[item.category].push(item);
                    return acc;
                  }, {} as Record<string, typeof HOTKEY_ACTIONS>);

                  return Object.entries(categorizedHotkeys).map(([category, items]) => (
                    <div key={category} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          color: "var(--accent)",
                          fontWeight: 600,
                          paddingBottom: 6,
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                          marginBottom: 4,
                        }}
                      >
                        {category}
                      </div>
                      
                      {items.map((item) => {
                        const currentCodes = customHotkeys[item.id] || [];

                        return (
                          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              className="modal__row"
                              style={{
                                flex: 1,
                                padding: "10px 14px",
                                background: "rgba(255, 255, 255, 0.03)",
                                border: "1px solid rgba(255, 255, 255, 0.04)",
                                borderRadius: "var(--radius-md)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: 10,
                              }}
                            >
                              <span style={{ color: "var(--text-primary)", fontSize: "0.9rem", fontWeight: 500, flex: 1, minWidth: 200 }}>
                                {item.label}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                {currentCodes.map((code, idx) => {
                                  const isRecording = recordingAction?.id === item.id && recordingAction.index === idx;
                                  return (
                                    <div key={idx} style={{ display: "flex", alignItems: "center" }}>
                                      <button
                                        onClick={() => setRecordingAction({ id: item.id, index: idx })}
                                        onKeyDown={(e) => {
                                          if (isRecording) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (
                                              e.key === "Control" ||
                                              e.key === "Shift" ||
                                              e.key === "Alt" ||
                                              e.key === "Meta"
                                            ) {
                                              return;
                                            }
                                            const parts: string[] = [];
                                            if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
                                            if (e.shiftKey) parts.push("Shift");
                                            if (e.altKey) parts.push("Alt");
                                            parts.push(e.code || e.key);
                                            const newCode = parts.join("+");

                                            const newCodes = [...currentCodes];
                                            newCodes[idx] = newCode;
                                            const updated = { ...customHotkeys, [item.id]: newCodes };
                                            setCustomHotkeys(updated);
                                            saveCustomHotkeys(updated);
                                            setRecordingAction(null);
                                          }
                                        }}
                                        onMouseDown={(e) => {
                                          if (isRecording) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const btnMap: Record<number, string> = { 0: "MouseLeft", 1: "MouseMiddle", 2: "MouseRight" };
                                            const newCode = btnMap[e.button] || `MouseButton${e.button}`;
                                            const newCodes = [...currentCodes];
                                            newCodes[idx] = newCode;
                                            const updated = { ...customHotkeys, [item.id]: newCodes };
                                            setCustomHotkeys(updated);
                                            saveCustomHotkeys(updated);
                                            setRecordingAction(null);
                                          }
                                        }}
                                        onContextMenu={(e) => {
                                          if (isRecording) e.preventDefault();
                                        }}
                                        style={{
                                          padding: "4px 10px",
                                          background: isRecording ? "var(--accent)" : "rgba(127, 199, 255, 0.12)",
                                          border: isRecording ? "1px solid white" : "1px solid rgba(127, 199, 255, 0.2)",
                                          borderRadius: "var(--radius-sm)",
                                          fontFamily: "monospace",
                                          fontSize: "0.84rem",
                                          fontWeight: 600,
                                          color: isRecording ? "#000" : "var(--accent)",
                                          cursor: "pointer",
                                          outline: "none",
                                          borderTopRightRadius: 0,
                                          borderBottomRightRadius: 0,
                                        }}
                                      >
                                        {isRecording ? "Нажмите..." : getKeyDisplay(code)}
                                      </button>
                                      <button
                                        onClick={() => {
                                          const newCodes = currentCodes.filter((_, i) => i !== idx);
                                          const updated = { ...customHotkeys, [item.id]: newCodes };
                                          setCustomHotkeys(updated);
                                          saveCustomHotkeys(updated);
                                        }}
                                        title="Удалить"
                                        style={{
                                          padding: "4px 6px",
                                          background: "rgba(255, 50, 50, 0.15)",
                                          border: "1px solid rgba(255, 50, 50, 0.3)",
                                          borderLeft: "none",
                                          borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                                          color: "#ff8888",
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                        }}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  );
                                })}
                                
                                {/* Кнопка добавления нового бинда */}
                                {(() => {
                                  const isRecordingNew = recordingAction?.id === item.id && recordingAction.index === currentCodes.length;
                                  if (isRecordingNew) {
                                    return (
                                      <button
                                          onKeyDown={(e) => {
                                            if (isRecordingNew) {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              if (
                                                e.key === "Control" ||
                                                e.key === "Shift" ||
                                                e.key === "Alt" ||
                                                e.key === "Meta"
                                              ) {
                                                return;
                                              }
                                              const parts: string[] = [];
                                              if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
                                              if (e.shiftKey) parts.push("Shift");
                                              if (e.altKey) parts.push("Alt");
                                              parts.push(e.code || e.key);
                                              const newCode = parts.join("+");

                                              const newCodes = [...currentCodes, newCode];
                                              const updated = { ...customHotkeys, [item.id]: newCodes };
                                              setCustomHotkeys(updated);
                                              saveCustomHotkeys(updated);
                                              setRecordingAction(null);
                                            }
                                          }}
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const btnMap: Record<number, string> = { 0: "MouseLeft", 1: "MouseMiddle", 2: "MouseRight" };
                                            const newCode = btnMap[e.button] || `MouseButton${e.button}`;
                                            const newCodes = [...currentCodes, newCode];
                                            const updated = { ...customHotkeys, [item.id]: newCodes };
                                            setCustomHotkeys(updated);
                                            saveCustomHotkeys(updated);
                                            setRecordingAction(null);
                                          }}
                                          onContextMenu={(e) => e.preventDefault()}
                                          style={{
                                            padding: "4px 10px",
                                            background: "var(--accent)",
                                            border: "1px solid white",
                                            borderRadius: "var(--radius-sm)",
                                            fontFamily: "monospace",
                                            fontSize: "0.84rem",
                                            fontWeight: 600,
                                            color: "#000",
                                            outline: "none",
                                          }}
                                      >
                                        Нажмите...
                                      </button>
                                    );
                                  }
                                  
                                  return (
                                    <button
                                      onClick={() => setRecordingAction({ id: item.id, index: currentCodes.length })}
                                      title="Добавить клавишу"
                                      style={{
                                        padding: "4px 8px",
                                        background: "rgba(255, 255, 255, 0.05)",
                                        border: "1px dashed rgba(255, 255, 255, 0.2)",
                                        borderRadius: "var(--radius-sm)",
                                        color: "var(--text-secondary)",
                                        cursor: "pointer",
                                        fontSize: "1rem",
                                        lineHeight: 1,
                                      }}
                                    >
                                      +
                                    </button>
                                  );
                                })()}
                              </div>
                            </div>
                            
                            <button
                              onClick={() => {
                                const updated = resetSingleHotkey(item.id, customHotkeys);
                                setCustomHotkeys(updated);
                              }}
                              title="По умолчанию"
                              style={{
                                padding: "10px",
                                background: "rgba(255, 255, 255, 0.03)",
                                border: "1px solid rgba(255, 255, 255, 0.04)",
                                borderRadius: "var(--radius-md)",
                                color: "var(--text-muted)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = "var(--text-primary)";
                                e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = "var(--text-muted)";
                                e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                              }}
                            >
                              <RotateCcw size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
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

        {/* Футер с версией приложения и проверкой обновлений */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            background: "rgba(0, 0, 0, 0.25)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.82rem",
            color: "var(--text-muted)",
            flexShrink: 0,
            borderRadius: "0 0 var(--radius-lg, 12px) var(--radius-lg, 12px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>L-MPV</span>
            <span
              style={{
                color: "var(--accent)",
                fontWeight: 700,
                background: "var(--accent-glass)",
                padding: "2px 8px",
                borderRadius: "var(--radius-pill)",
                fontSize: "0.78rem",
                border: "1px solid var(--border-pill)",
              }}
            >
              v{appVersion}
            </span>

            <button
              onClick={handleCheckForUpdates}
              disabled={isCheckingUpdate}
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "var(--radius-pill, 9999px)",
                padding: "3px 10px",
                fontSize: "0.78rem",
                color: "var(--text-secondary, #d1d5db)",
                cursor: isCheckingUpdate ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
              className="hover-bright"
              title="Проверить наличие обновлений на GitHub"
            >
              {isCheckingUpdate ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>Проверка...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={12} />
                  <span>Проверить обновления</span>
                </>
              )}
            </button>

            {updateStatus && (
              <span
                style={{
                  fontSize: "0.78rem",
                  color: updateStatus.includes("Найдено") ? "var(--accent)" : "var(--text-muted)",
                  marginLeft: 4,
                }}
              >
                {updateStatus}
              </span>
            )}
          </div>
          <span style={{ fontSize: "0.76rem" }}>Портативная редакция</span>
        </div>
      </div>
    </div>
  );
}
