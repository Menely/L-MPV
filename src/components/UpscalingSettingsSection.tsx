import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Zap,
  FolderOpen,
  CheckCircle2,
  Layers,
  Keyboard,
  X,
  RefreshCw,
  Eye,
  EyeOff,
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
  DownloadProgressPayload,
  UpscaleCompileProgress,
} from "./upscale/types";
import { BackendSelector } from "./upscale/BackendSelector";

export type {
  ModelFileItem,
  GpuHardwareInfo,
  UpscaleStatus,
  UpscaleSettings,
  DownloadProgressPayload,
  UpscaleCompileProgress,
};

/**
 * Вкладка управления апскейлингом видео в реальном времени (AI Upscaling).
 */
export const UpscalingSettingsSection: React.FC = () => {
  const [status, setStatus] = useState<UpscaleStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDownloadingEngine, setIsDownloadingEngine] = useState<boolean>(false);
  const [isDeletingEngine, setIsDeletingEngine] = useState<boolean>(false);
  const [compilingModel, setCompilingModel] = useState<string | null>(null);
  const [compileProgress, setCompileProgress] = useState<Record<string, UpscaleCompileProgress>>({});
  const [engineSuccessMessage, setEngineSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadProgressText, setDownloadProgressText] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressPayload | null>(null);

  // Хоткеи
  const [customHotkeys, setCustomHotkeys] = useState<Record<string, string[]>>(() => getCustomHotkeys());
  const [recordingActionId, setRecordingActionId] = useState<string | null>(null);

  // Скрытие названий моделей (компактный вид только с именем файла и размером)
  const [hideModelNames, setHideModelNames] = useState<boolean>(() => {
    try {
      return localStorage.getItem("l-mpv-hide-model-names") === "true";
    } catch {
      return false;
    }
  });

  const toggleHideModelNames = () => {
    setHideModelNames((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("l-mpv-hide-model-names", next ? "true" : "false");
      } catch (e) {
        console.error("Ошибка сохранения настройки скрытия названий моделей:", e);
      }
      return next;
    });
  };

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
  const isInitialLoadedRef = useRef<boolean>(false);
  const refreshInProgressRef = useRef<Promise<void> | null>(null);
  const compileTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const downloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Загрузка статуса подсистемы и списка доступных моделей
  const refreshStatus = useCallback(async () => {
    if (refreshInProgressRef.current) {
      return refreshInProgressRef.current;
    }
    const promise = (async () => {
      try {
        // Флаг loading отображаем исключительно при самом первом открытии, когда данных еще нет
        if (isMountedRef.current && !isInitialLoadedRef.current) {
          setLoading(true);
        }
        const currentStatus = await invoke<UpscaleStatus>("get_upscale_status");
        if (isMountedRef.current) {
          setStatus(currentStatus);
          // Очищаем ошибку загрузки статуса при успешном получении
          setErrorMessage((prev) =>
            prev === "Не удалось получить статус компонентов апскейлинга" ? null : prev
          );
        }
      } catch (err) {
        console.error("Ошибка загрузки статуса апскейлинга:", err);
        if (isMountedRef.current) {
          setErrorMessage("Не удалось получить статус компонентов апскейлинга");
        }
      } finally {
        isInitialLoadedRef.current = true;
        if (isMountedRef.current) {
          setLoading(false);
        }
        refreshInProgressRef.current = null;
      }
    })();
    refreshInProgressRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    refreshStatus();

    let unlistenProgress: (() => void) | null = null;
    listen<DownloadProgressPayload>("upscale-download-progress", (event) => {
      if (!isMountedRef.current) return;
      const payload = event.payload;
      setDownloadProgress(payload);
      if (payload.stage) {
        setDownloadProgressText(payload.stage);
      }
      if (payload.is_finished) {
        if (payload.error) {
          setIsDownloadingEngine(false);
          setErrorMessage(`Ошибка загрузки: ${payload.error}`);
          if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
          downloadTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setDownloadProgress(null);
              setDownloadProgressText(null);
            }
          }, 4000);
        } else {
          setEngineSuccessMessage(payload.stage || "Движок успешно установлен!");
          setErrorMessage(null);
          refreshStatus();
          if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
          downloadTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setIsDownloadingEngine(false);
              setDownloadProgress(null);
              setDownloadProgressText(null);
            }
          }, 3000);
        }
      } else if (payload.error) {
        setIsDownloadingEngine(false);
        setErrorMessage(`Ошибка загрузки: ${payload.error}`);
        if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
        downloadTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setDownloadProgress(null);
            setDownloadProgressText(null);
          }
        }, 4000);
      }
    }).then((fn) => {
      unlistenProgress = fn;
    });

    let unlistenCompile: (() => void) | null = null;
    listen<UpscaleCompileProgress>("upscale-compile-progress", (event) => {
      if (!isMountedRef.current) return;
      const p = event.payload;
      setCompileProgress((prev) => ({ ...prev, [p.filename]: p }));
      if (p.is_finished) {
        setCompilingModel((curr) => (curr === p.filename ? null : curr));
        if (p.error) {
          setErrorMessage(`Ошибка сборки ${p.filename}: ${p.error}`);
        } else {
          setEngineSuccessMessage(`Модель ${p.filename} успешно оптимизирована для 1080p!`);
        }
        refreshStatus();
        if (compileTimersRef.current[p.filename]) {
          clearTimeout(compileTimersRef.current[p.filename]);
        }
        compileTimersRef.current[p.filename] = setTimeout(() => {
          if (isMountedRef.current) {
            setCompileProgress((prev) => {
              const copy = { ...prev };
              delete copy[p.filename];
              return copy;
            });
            delete compileTimersRef.current[p.filename];
          }
        }, 3000);
      }
    }).then((fn) => {
      unlistenCompile = fn;
    });

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

    window.addEventListener("l-mpv-settings-changed", handleSettingsChanged);

    return () => {
      isMountedRef.current = false;
      if (unlistenProgress) unlistenProgress();
      if (unlistenCompile) unlistenCompile();
      window.removeEventListener("l-mpv-settings-changed", handleSettingsChanged);
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
      Object.values(compileTimersRef.current).forEach((t) => clearTimeout(t));
    };
  }, [refreshStatus]);

  // Сохранение и применение настроек
  const updateSettings = async (newPartialSettings: Partial<UpscaleSettings>) => {
    const updated: UpscaleSettings = { ...settings, ...newPartialSettings };
    setSettings(updated);
    setErrorMessage(null);

    localStorage.setItem("l-mpv-upscale-mode", updated.mode);
    localStorage.setItem("l-mpv-upscale-backend", updated.backend);
    localStorage.setItem("l-mpv-upscale-slot", String(updated.active_slot));
    localStorage.setItem("l-mpv-upscale-selected-model", updated.selected_model);

    // Проверяем, установлен ли движок при попытке включить режим "ai"
    const isDmlInstalled = !!(status?.directml_present && status?.aji_present);
    const isTrtInstalled = !!(status?.tensorrt_present && status?.aji_present);
    const isInstalled = updated.backend === "DirectML" ? isDmlInstalled : isTrtInstalled;

    if (updated.mode === "ai" && !isInstalled) {
      setErrorMessage(`Для включения апскейлинга необходимо сначала скачать библиотеки движка ${updated.backend}.`);
      const fallbackSettings: UpscaleSettings = { ...updated, mode: "off" };
      setSettings(fallbackSettings);
      localStorage.setItem("l-mpv-upscale-mode", "off");
      return;
    }

    try {
      await invoke("apply_upscale_settings", { settings: updated });
    } catch (err) {
      console.error("Ошибка применения настроек апскейлинга:", err);
      setErrorMessage(String(err));
    }
  };

  // Переключение выбранного бэкенда без лишних перерисовок кадра, если апскейл выключен
  const handleSelectBackend = async (backend: "DirectML" | "TensorRT") => {
    const updated: UpscaleSettings = { ...settings, backend };
    setSettings(updated);
    setErrorMessage(null);
    localStorage.setItem("l-mpv-upscale-backend", updated.backend);

    // Если апскейлинг выключен, mpv не трогаем — видео не будет дергаться
    if (updated.mode === "ai") {
      const isDmlInstalled = !!(status?.directml_present && status?.aji_present);
      const isTrtInstalled = !!(status?.tensorrt_present && status?.aji_present);
      const isInstalled = backend === "DirectML" ? isDmlInstalled : isTrtInstalled;

      if (isInstalled) {
        try {
          await invoke("apply_upscale_settings", { settings: updated });
        } catch (err) {
          console.error("Ошибка применения движка:", err);
          setErrorMessage(String(err));
        }
      } else {
        setErrorMessage(`Движок ${backend} еще не установлен. Нажмите «Скачать движок» для загрузки.`);
      }
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

  // Фоновое скачивание библиотек инференса с прогресс-баром
  const handleDownloadEngine = async () => {
    if (downloadTimerRef.current) {
      clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = null;
    }
    setIsDownloadingEngine(true);
    setEngineSuccessMessage(null);
    setErrorMessage(null);
    setDownloadProgress(null);
    const engineName = settings.backend;
    const isTrt = engineName === "TensorRT";
    const sm = status?.gpu_info?.sm_architecture || "sm";
    setDownloadProgressText(
      isTrt
        ? `Подготовка к загрузке NVIDIA TensorRT 11 (${sm})...`
        : "Подготовка к загрузке Microsoft DirectML и ONNX Runtime..."
    );
    try {
      const res = await invoke<string>("download_inference_engine", { engine: engineName });
      setEngineSuccessMessage(res || "Библиотеки инференса успешно установлены");
      setErrorMessage(null);
      await refreshStatus();
    } catch (err) {
      console.error("Ошибка скачивания библиотек инференса:", err);
      setErrorMessage(`Ошибка загрузки движка: ${err}`);
      setIsDownloadingEngine(false);
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setDownloadProgress(null);
          setDownloadProgressText(null);
        }
      }, 4000);
    }
  };

  // Удаление выбранного движка
  const handleDeleteEngine = async () => {
    setIsDeletingEngine(true);
    setEngineSuccessMessage(null);
    setErrorMessage(null);
    try {
      const res = await invoke<string>("delete_inference_engine", { backend: settings.backend });
      setEngineSuccessMessage(res || "Библиотеки движка удалены");

      // Если режим AI был включен с этим движком, отключаем его
      if (settings.mode === "ai") {
        const offSettings: UpscaleSettings = { ...settings, mode: "off" };
        setSettings(offSettings);
        localStorage.setItem("l-mpv-upscale-mode", "off");
        await invoke("apply_upscale_settings", { settings: offSettings });
      }

      await refreshStatus();
    } catch (err) {
      console.error("Ошибка удаления библиотек инференса:", err);
      setErrorMessage(`Ошибка удаления движка: ${err}`);
    } finally {
      setIsDeletingEngine(false);
    }
  };

  // Фоновая предварительная компиляция TensorRT .engine для 1080p
  const handlePrecompileModel = async (model: ModelFileItem) => {
    if (compilingModel) return;
    if (compileTimersRef.current[model.filename]) {
      clearTimeout(compileTimersRef.current[model.filename]);
      delete compileTimersRef.current[model.filename];
    }
    setCompilingModel(model.filename);
    setErrorMessage(null);
    setEngineSuccessMessage(null);
    try {
      const res = await invoke<string>("precompile_model_engine_1080p", {
        slot: model.slot,
        filename: model.filename,
      });
      setEngineSuccessMessage(res || "Модель успешно оптимизирована для 1080p!");
      await refreshStatus();
    } catch (err) {
      console.error("Ошибка компиляции модели:", err);
      setErrorMessage(`Ошибка компиляции модели: ${err}`);
      setCompilingModel(null);
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
      {/* 1. Выбор основного режима работы */}
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

      {/* 2. Настройка бэкенда инференса (DirectML / TensorRT) и скачивание движка с прогресс-баром */}
      <BackendSelector
        status={status}
        settings={settings}
        isDownloadingEngine={isDownloadingEngine}
        isDeletingEngine={isDeletingEngine}
        downloadProgressText={downloadProgressText}
        downloadProgress={downloadProgress}
        engineSuccessMessage={engineSuccessMessage}
        errorMessage={errorMessage}
        onSelectBackend={handleSelectBackend}
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

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={toggleHideModelNames}
              title={
                hideModelNames
                  ? "Показать названия моделей и имена файлов"
                  : "Скрыть названия моделей и имена файлов (маскировать точками)"
              }
              style={{
                padding: "8px 10px",
                borderRadius: "var(--radius-md)",
                background: hideModelNames ? "rgba(127, 199, 255, 0.12)" : "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${hideModelNames ? "var(--accent)" : "var(--border-pill)"}`,
                color: hideModelNames ? "var(--accent)" : "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {hideModelNames ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>

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
        </div>

        {/* Список обнаруженных файлов ONNX-моделей */}
        <div
          style={{
            maxHeight: 220,
            minHeight: 80,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 4,
            paddingRight: 4,
          }}
        >
          {loading && !status ? (
            <div style={{ padding: 18, textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
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
                      <div
                        style={{
                          fontSize: "0.88rem",
                          fontWeight: 500,
                          color: hideModelNames ? "var(--text-muted)" : "var(--text-primary)",
                          letterSpacing: hideModelNames ? "0.15em" : "normal",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          userSelect: hideModelNames ? "none" : "auto",
                        }}
                      >
                        {hideModelNames ? "••••••••••••••••" : model.display_name}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          fontFamily: "monospace",
                          letterSpacing: hideModelNames ? "0.15em" : "normal",
                          marginTop: 1,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          userSelect: hideModelNames ? "none" : "auto",
                        }}
                      >
                        {hideModelNames
                          ? "••••••••••••••••••••"
                          : `${model.filename} (${formatFileSize(model.size_bytes)})`}
                      </div>
                    </div>
                  </div>

                  {/* Блок предкомпиляции 1080p для NVIDIA TensorRT и кнопка горячей клавиши */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {status?.gpu_info?.supports_tensorrt && (() => {
                      const itemCompile = compileProgress[model.filename];
                      const isCompiling = compilingModel === model.filename || itemCompile !== undefined;
                      const isCompileFinished = !!(itemCompile && itemCompile.is_finished && !itemCompile.error);
                      const isCompileError = !!(itemCompile && itemCompile.error);

                      if (isCompiling) {
                        return (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 3,
                              width: 175,
                              minWidth: 175,
                              maxWidth: 175,
                              boxSizing: "border-box",
                              padding: "4px 8px",
                              borderRadius: "var(--radius-sm)",
                              background: isCompileError
                                ? "rgba(231, 76, 60, 0.08)"
                                : isCompileFinished
                                ? "rgba(46, 204, 113, 0.08)"
                                : "rgba(127, 199, 255, 0.08)",
                              border: `1px solid ${
                                isCompileError
                                  ? "rgba(231, 76, 60, 0.35)"
                                  : isCompileFinished
                                  ? "rgba(46, 204, 113, 0.35)"
                                  : "rgba(127, 199, 255, 0.3)"
                              }`,
                              userSelect: "none",
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 6,
                                fontSize: "0.72rem",
                                width: "100%",
                              }}
                            >
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 5,
                                  color: isCompileError
                                    ? "#e74c3c"
                                    : isCompileFinished
                                    ? "#2ecc71"
                                    : "var(--accent)",
                                  fontWeight: isCompileFinished ? 600 : 500,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  flex: 1,
                                  minWidth: 0,
                                }}
                                title={itemCompile?.stage || "Сборка 1080p..."}
                              >
                                {isCompileError ? (
                                  <X size={11} color="#e74c3c" style={{ flexShrink: 0 }} />
                                ) : isCompileFinished ? (
                                  <CheckCircle2 size={11} color="#2ecc71" style={{ flexShrink: 0 }} />
                                ) : (
                                  <RefreshCw size={10} className="spin" style={{ flexShrink: 0 }} />
                                )}
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {itemCompile?.stage || "Сборка 1080p..."}
                                </span>
                              </span>
                              <span
                                style={{
                                  color: isCompileError
                                    ? "#e74c3c"
                                    : isCompileFinished
                                    ? "#2ecc71"
                                    : "var(--accent)",
                                  fontWeight: 700,
                                  fontVariantNumeric: "tabular-nums",
                                  width: 38,
                                  textAlign: "right",
                                  flexShrink: 0,
                                }}
                              >
                                {isCompileError
                                  ? "Ошибка"
                                  : isCompileFinished
                                  ? "100%"
                                  : itemCompile
                                  ? `${Math.round(itemCompile.percent)}%`
                                  : "..."}
                              </span>
                            </div>

                            {/* Полоса прогресса */}
                            <div
                              style={{
                                width: "100%",
                                height: 3.5,
                                borderRadius: 2,
                                background: "rgba(255, 255, 255, 0.1)",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: isCompileError
                                    ? "100%"
                                    : isCompileFinished
                                    ? "100%"
                                    : `${itemCompile?.percent || 8}%`,
                                  height: "100%",
                                  background: isCompileError
                                    ? "#e74c3c"
                                    : isCompileFinished
                                    ? "linear-gradient(90deg, #27ae60, #2ecc71)"
                                    : "linear-gradient(90deg, #3498db, var(--accent), #2ecc71)",
                                  borderRadius: 2,
                                  transition: "width 0.25s ease-out",
                                  boxShadow: isCompileFinished
                                    ? "0 0 6px rgba(46, 204, 113, 0.4)"
                                    : "0 0 6px rgba(127, 199, 255, 0.4)",
                                }}
                              />
                            </div>
                          </div>
                        );
                      }

                      if (model.has_engine_1080p) {
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span
                              title="Движок TensorRT (.engine) уже скомпилирован под разрешение 1080p — включение будет мгновенным"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "4px 8px",
                                borderRadius: "var(--radius-sm)",
                                background: "rgba(46, 204, 113, 0.12)",
                                border: "1px solid rgba(46, 204, 113, 0.3)",
                                color: "#2ecc71",
                                fontSize: "0.74rem",
                                fontWeight: 600,
                                userSelect: "none",
                              }}
                            >
                              <CheckCircle2 size={13} />
                              1080p готов
                            </span>
                            <button
                              type="button"
                              onClick={() => handlePrecompileModel(model)}
                              disabled={!!compilingModel}
                              title="Перекомпилировать движок TensorRT под 1080p"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "4px 6px",
                                borderRadius: "var(--radius-sm)",
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid var(--border-pill)",
                                color: "var(--text-muted)",
                                fontSize: "0.72rem",
                                cursor: compilingModel ? "default" : "pointer",
                                opacity: compilingModel ? 0.4 : 0.8,
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                if (!compilingModel) {
                                  e.currentTarget.style.color = "var(--text-primary)";
                                  e.currentTarget.style.borderColor = "var(--accent)";
                                  e.currentTarget.style.opacity = "1";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!compilingModel) {
                                  e.currentTarget.style.color = "var(--text-muted)";
                                  e.currentTarget.style.borderColor = "var(--border-pill)";
                                  e.currentTarget.style.opacity = "0.8";
                                }
                              }}
                            >
                              <RefreshCw size={11} />
                            </button>
                          </div>
                        );
                      }

                      return (
                        <button
                          type="button"
                          onClick={() => handlePrecompileModel(model)}
                          disabled={!!compilingModel}
                          title="Скомпилировать TensorRT движок под 1080p заранее, чтобы при первом запуске не было пауз"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "4px 10px",
                            borderRadius: "var(--radius-sm)",
                            background: "rgba(255, 255, 255, 0.06)",
                            border: "1px solid var(--border-pill)",
                            color: "var(--text-secondary)",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            cursor: compilingModel ? "default" : "pointer",
                            opacity: compilingModel ? 0.5 : 1,
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (!compilingModel) {
                              e.currentTarget.style.color = "var(--text-primary)";
                              e.currentTarget.style.borderColor = "var(--accent)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!compilingModel) {
                              e.currentTarget.style.color = "var(--text-secondary)";
                              e.currentTarget.style.borderColor = "var(--border-pill)";
                            }
                          }}
                        >
                          <Zap size={12} color="var(--accent)" />
                          1080p сборка
                        </button>
                      );
                    })()}

                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setRecordingActionId(isRecording ? null : actionId)}
                      onKeyDown={(e) => isRecording && handleKeyRecord(e, actionId)}
                      title={isRecording ? "Нажмите желаемую комбинацию клавиш (Esc для отмены)" : "Нажмите для переназначения клавиши активации"}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px",
                        fontSize: "0.78rem",
                        borderRadius: "var(--radius-sm)",
                        background: isRecording ? "rgba(127, 199, 255, 0.25)" : "rgba(255, 255, 255, 0.06)",
                        border: `1px solid ${isRecording ? "var(--accent)" : "var(--border-pill)"}`,
                        color: isRecording ? "var(--accent)" : bindCodes.length > 0 ? "var(--text-primary)" : "var(--text-muted)",
                        cursor: "pointer",
                        outline: "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <Keyboard size={13} />
                      <span>{isRecording ? "Нажмите клавишу..." : displayBind}</span>
                    </button>

                    {bindCodes.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => handleClearHotkey(e, actionId)}
                        title="Сбросить привязанную клавишу"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          padding: 4,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
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
            <div style={{ padding: 18, textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              В папке models/onnx/ не найдено совместимых моделей .onnx.
              <br />
              <span style={{ fontSize: "0.78rem" }}>
                Нажмите значок папки справа вверху и скопируйте файлы моделей.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
