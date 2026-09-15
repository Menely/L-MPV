import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Zap,
  FolderOpen,
  CheckCircle2,
  Layers,
  Info,
  Keyboard,
  X,
} from "lucide-react";
import {
  getCustomHotkeys,
  saveCustomHotkeys,
  getKeyDisplay,
} from "../utils/hotkeyUtils";
import {
  ModelFileItem,
  GpuHardwareInfo,
  UpscaleStatus,
  UpscaleSettings,
} from "./upscale/types";
import { BackendSelector } from "./upscale/BackendSelector";

export type {
  ModelFileItem,
  GpuHardwareInfo,
  UpscaleStatus,
  UpscaleSettings,
};



/**
 * Вкладка управления апскейлингом видео в реальном времени (AI Upscaling).
 */
export const UpscalingSettingsSection: React.FC = () => {
  const [status, setStatus] = useState<UpscaleStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDownloadingEngine, setIsDownloadingEngine] = useState<boolean>(false);
  const [isDeletingEngine, setIsDeletingEngine] = useState<boolean>(false);
  const [engineSuccessMessage, setEngineSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadProgressText, setDownloadProgressText] = useState<string | null>(null);

  // Хоткеи
  const [customHotkeys, setCustomHotkeys] = useState<Record<string, string[]>>(() => getCustomHotkeys());
  const [recordingActionId, setRecordingActionId] = useState<string | null>(null);

  const [settings, setSettings] = useState<UpscaleSettings>(() => {
    try {
      const savedMode = (localStorage.getItem("l-mpv-upscale-mode") as "off" | "ai") || "off";
      const savedBackend = (localStorage.getItem("l-mpv-upscale-backend") as "DirectML" | "TensorRT") || "DirectML";
      const savedSlot = Number(localStorage.getItem("l-mpv-upscale-slot") || 1001);
      const savedModel = localStorage.getItem("l-mpv-upscale-selected-model") || "";
      return {
        mode: savedMode,
        active_slot: savedSlot,
        backend: savedBackend,
        selected_model: savedModel,
      };
    } catch {
      return {
        mode: "off",
        active_slot: 1001,
        backend: "DirectML",
        selected_model: "",
      };
    }
  });

  const isMountedRef = useRef<boolean>(true);

  // Загрузка статуса подсистемы и списка доступных моделей
  const refreshStatus = useCallback(async () => {
    try {
      if (isMountedRef.current) setLoading(true);
      const currentStatus = await invoke<UpscaleStatus>("get_upscale_status");
      if (isMountedRef.current) setStatus(currentStatus);
    } catch (err) {
      console.error("Ошибка загрузки статуса апскейлинга:", err);
      if (isMountedRef.current) setErrorMessage("Не удалось получить статус компонентов апскейлинга");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    refreshStatus();

    const handleFocus = () => {
      if (isMountedRef.current) refreshStatus();
    };
    const handleSettingsChanged = () => {
      if (isMountedRef.current) {
        setCustomHotkeys(getCustomHotkeys());
        const savedMode = (localStorage.getItem("l-mpv-upscale-mode") as "off" | "ai") || "off";
        const savedBackend = (localStorage.getItem("l-mpv-upscale-backend") as "DirectML" | "TensorRT") || "DirectML";
        const savedSlot = Number(localStorage.getItem("l-mpv-upscale-slot") || 1001);
        const savedModel = localStorage.getItem("l-mpv-upscale-selected-model") || "";
        setSettings({
          mode: savedMode,
          active_slot: savedSlot,
          backend: savedBackend,
          selected_model: savedModel,
        });
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("l-mpv-settings-changed", handleSettingsChanged);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("l-mpv-settings-changed", handleSettingsChanged);
    };
  }, [refreshStatus]);

  // Сохранение и немедленное применение настроек
  const updateSettings = async (newPartialSettings: Partial<UpscaleSettings>) => {
    const updated: UpscaleSettings = { ...settings, ...newPartialSettings };
    setSettings(updated);
    setErrorMessage(null);

    try {
      localStorage.setItem("l-mpv-upscale-mode", updated.mode);
      localStorage.setItem("l-mpv-upscale-backend", updated.backend);
      localStorage.setItem("l-mpv-upscale-slot", String(updated.active_slot));
      localStorage.setItem("l-mpv-upscale-selected-model", updated.selected_model);

      await invoke("apply_upscale_settings", { settings: updated });
    } catch (err) {
      console.error("Ошибка применения настроек апскейлинга:", err);
      setErrorMessage(String(err));
    }
  };

  // Открытие папки моделей models/onnx/ в Проводнике
  const handleOpenModelsFolder = async () => {
    try {
      await invoke("open_models_folder");
    } catch (err) {
      console.error("Ошибка открытия папки моделей:", err);
    }
  };

  // Открытие папки библиотек инференса inference/ в Проводнике
  const handleOpenInferenceFolder = async () => {
    try {
      await invoke("open_inference_folder");
    } catch (err) {
      console.error("Ошибка открытия папки движков:", err);
    }
  };

  // Фоновое скачивание библиотек инференса
  const handleDownloadEngine = async () => {
    setIsDownloadingEngine(true);
    setEngineSuccessMessage(null);
    setErrorMessage(null);
    const engineName = settings.backend;
    const isTrt = engineName === "TensorRT";
    const sm = status?.gpu_info?.sm_architecture || "sm";
    setDownloadProgressText(
      isTrt
        ? `Загрузка библиотек NVIDIA TensorRT 11 (runtime + ${sm})... Пожалуйста, подождите`
        : "Загрузка библиотек Microsoft DirectML и ONNX Runtime... Пожалуйста, подождите"
    );
    try {
      const res = await invoke<string>("download_inference_engine", { engine: engineName });
      setEngineSuccessMessage(res || "Библиотеки инференса успешно установлены");
      await refreshStatus();
    } catch (err) {
      console.error("Ошибка скачивания библиотек инференса:", err);
      setErrorMessage(`Ошибка загрузки движка: ${err}`);
    } finally {
      setIsDownloadingEngine(false);
      setDownloadProgressText(null);
    }
  };

  const handleDeleteEngine = async () => {
    setIsDeletingEngine(true);
    setEngineSuccessMessage(null);
    setErrorMessage(null);
    try {
      const res = await invoke<string>("delete_inference_engine", { backend: settings.backend });
      setEngineSuccessMessage(res || "Библиотеки движка удалены");
      await refreshStatus();
    } catch (err) {
      console.error("Ошибка удаления библиотек инференса:", err);
      setErrorMessage(`Ошибка удаления движка: ${err}`);
    } finally {
      setIsDeletingEngine(false);
    }
  };

  // Назначение горячей клавиши для модели
  const handleKeyRecord = (e: React.KeyboardEvent, actionId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Control" || e.key === "Shift" || e.key === "Alt" || e.key === "Meta") {
      return;
    }

    if (e.key === "Escape") {
      setRecordingActionId(null);
      return;
    }

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");
    parts.push(e.code || e.key);
    const newCode = parts.join("+");

    const updated = { ...customHotkeys, [actionId]: [newCode] };
    setCustomHotkeys(updated);
    saveCustomHotkeys(updated);
    setRecordingActionId(null);
  };

  // Очистка бинда
  const handleClearHotkey = (e: React.MouseEvent, actionId: string) => {
    e.stopPropagation();
    const updated = { ...customHotkeys, [actionId]: [] };
    setCustomHotkeys(updated);
    saveCustomHotkeys(updated);
    setRecordingActionId(null);
  };

  // Форматирование размера файлов
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const isAiActive = settings.mode === "ai";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Выбор основного режима работы и профилей качества */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid var(--border-pill)",
          borderRadius: "var(--radius-lg)",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={18} color="var(--accent)" /> Режим апскейлинга
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 2 }}>
              Нейросетевой AI-апскейл видео высокого разрешения в реальном времени
            </p>
          </div>

          {/* Интерактивная кнопка-тумблер Включен / Выключен */}
          <button
            type="button"
            onClick={() => updateSettings({ mode: isAiActive ? "off" : "ai" })}
            title={isAiActive ? "Нажмите, чтобы выключить апскейлинг" : "Нажмите, чтобы включить апскейлинг"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: "var(--radius-pill)",
              fontWeight: 600,
              fontSize: "0.84rem",
              background: isAiActive ? "rgba(127, 199, 255, 0.2)" : "rgba(255, 255, 255, 0.06)",
              color: isAiActive ? "var(--accent)" : "var(--text-muted)",
              border: `1px solid ${isAiActive ? "var(--accent)" : "var(--border-pill)"}`,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isAiActive ? "var(--accent)" : "rgba(255, 255, 255, 0.3)",
                boxShadow: isAiActive ? "0 0 8px var(--accent)" : "none",
                display: "inline-block",
              }}
            />
            {isAiActive ? "Включен" : "Выключен"}
          </button>
        </div>

      </div>

      {/* 2. Настройка бэкенда инференса (DirectML / TensorRT) и скачивание движка */}
      <BackendSelector
        status={status}
        settings={settings}
        isDownloadingEngine={isDownloadingEngine}
        isDeletingEngine={isDeletingEngine}
        downloadProgressText={downloadProgressText}
        engineSuccessMessage={engineSuccessMessage}
        errorMessage={errorMessage}
        onUpdateSettings={updateSettings}
        onOpenInferenceFolder={handleOpenInferenceFolder}
        onDownloadEngine={handleDownloadEngine}
        onDeleteEngine={handleDeleteEngine}
        onError={(msg) => setErrorMessage(msg)}
      />

      {/* 3. Универсальная библиотека ONNX-моделей (`models/onnx/`) с биндом клавиш */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid var(--border-pill)",
          borderRadius: "var(--radius-lg)",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: "1.02rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={17} color="var(--accent)" /> Папка нейросетей (models/onnx/)
            </h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
              Обнаружено файлов ONNX-моделей: {status?.models_count || 0}
            </p>
          </div>

          {/* Лаконичная кнопка папки без лишнего текста */}
          <button
            type="button"
            onClick={handleOpenModelsFolder}
            title="Открыть папку моделей в Проводнике"
            style={{
              padding: "8px 10px",
              borderRadius: "var(--radius-md)",
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid var(--border-pill)",
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <FolderOpen size={16} />
          </button>
        </div>

        {/* Список обнаруженных файлов ONNX-моделей с возможностью кастомного бинда клавиш */}
        <div
          style={{
            maxHeight: 220,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 4,
            paddingRight: 4,
          }}
        >
          {loading ? (
            <div style={{ padding: 12, textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Загрузка списка моделей...
            </div>
          ) : status?.models && status.models.length > 0 ? (
            status.models.map((model, idx) => {
              const isSelected = settings.active_slot === model.slot || settings.selected_model === model.filename;
              const actionId = `upscaleNet${idx + 1}`;
              const bindCodes = customHotkeys[actionId] || [];
              const isRecording = recordingActionId === actionId;
              const displayBind = bindCodes.length > 0 ? getKeyDisplay(bindCodes[0]) : "Назначить";

              return (
                <div
                  key={model.filename}
                  onClick={() => updateSettings({ active_slot: model.slot, selected_model: model.filename })}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    background: isSelected ? "rgba(127, 199, 255, 0.12)" : "rgba(0, 0, 0, 0.2)",
                    border: `1px solid ${isSelected ? "var(--accent)" : "var(--border-pill)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                    {isSelected ? (
                      <CheckCircle2 size={18} color="var(--accent)" style={{ flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid var(--border-pill)", flexShrink: 0 }} />
                    )}

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "0.88rem", fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {model.display_name}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace", marginTop: 1 }}>
                        {model.filename} ({formatFileSize(model.size_bytes)})
                      </div>
                    </div>
                  </div>

                  {/* Кнопка настройки горячей клавиши (бинда) прямо в строке модели */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setRecordingActionId(isRecording ? null : actionId)}
                      onKeyDown={(e) => isRecording && handleKeyRecord(e, actionId)}
                      title="Нажмите, чтобы изменить горячую клавишу для этой модели"
                      style={{
                        padding: "4px 8px",
                        borderRadius: "var(--radius-sm)",
                        background: isRecording ? "var(--accent)" : "rgba(255, 255, 255, 0.08)",
                        border: isRecording ? "1px solid white" : "1px solid var(--border-pill)",
                        color: isRecording ? "#000" : bindCodes.length > 0 ? "var(--accent)" : "var(--text-muted)",
                        fontFamily: "monospace",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        outline: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <Keyboard size={13} />
                      {isRecording ? "Нажмите клавишу..." : displayBind}
                    </button>

                    {bindCodes.length > 0 && !isRecording && (
                      <button
                        type="button"
                        onClick={(e) => handleClearHotkey(e, actionId)}
                        title="Очистить горячую клавишу"
                        style={{
                          padding: "4px",
                          borderRadius: "var(--radius-sm)",
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 0.6,
                        }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                background: "rgba(0, 0, 0, 0.2)",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.84rem",
              }}
            >
              <Info size={20} style={{ margin: "0 auto 6px", display: "block", opacity: 0.6 }} />
              Папка <code style={{ color: "var(--accent)" }}>models/onnx/</code> пуста.
              Нажмите иконку папки и скопируйте любые <code>.onnx</code> файлы нейросетей.
            </div>
          )}
        </div>
      </div>

      {/* 4. Памятка по горячим клавишам */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid var(--border-pill)",
          borderRadius: "var(--radius-lg)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Keyboard size={18} color="var(--accent)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
          <strong style={{ color: "var(--text-primary)" }}>Быстрое переключение на лету:</strong>{" "}
          <code style={{ color: "var(--accent)" }}>{getKeyDisplay((customHotkeys["upscaleOff"] || ["Shift+Digit1"])[0])}</code> — Выключить апскейлинг.
          Для каждой нейросети можно назначить свою уникальную клавишу прямо в списке выше.
        </div>
      </div>
    </div>
  );
};

