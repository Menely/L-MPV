import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Zap,
  FolderOpen,
  Layers,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  getCustomHotkeys,
  saveCustomHotkeys,
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
import { ModelListItem } from "./upscale/ModelListItem";

export type {
  ModelFileItem,
  GpuHardwareInfo,
  UpscaleStatus,
  UpscaleSettings,
  DownloadProgressPayload,
  UpscaleCompileProgress,
};

interface UpscalingSettingsSectionProps {
  onClose?: () => void;
}

/**
 * Вкладка управления апскейлингом видео в реальном времени (AI Upscaling).
 */
export const UpscalingSettingsSection: React.FC<UpscalingSettingsSectionProps> = ({ onClose: _onClose }) => {
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
        window.dispatchEvent(new Event("l-mpv-settings-changed"));
      } catch (e) {
        console.error("Ошибка сохранения настройки скрытия названий моделей:", e);
      }
      return next;
    });
  };

  // Перемещение моделей выше / ниже в списке
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const persistModelOrder = async (newModels: ModelFileItem[]) => {
    setStatus((prev) => (prev ? { ...prev, models: newModels } : prev));
    const order = newModels.map((m) => m.filename);
    try {
      localStorage.setItem("l-mpv-upscale-models-order", JSON.stringify(order));
      await invoke("save_models_order", { order });
      window.dispatchEvent(new Event("l-mpv-settings-changed"));
    } catch (err) {
      console.error("Ошибка сохранения порядка моделей:", err);
    }
  };

  const handleMoveModel = async (index: number, direction: "up" | "down", e: React.MouseEvent) => {
    e.stopPropagation();
    if (!status?.models) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= status.models.length) return;

    const newModels = [...status.models];
    const [moved] = newModels.splice(index, 1);
    newModels.splice(targetIndex, 0, moved);
    await persistModelOrder(newModels);
  };

  const handleDragStart = (idx: number, e: React.DragEvent) => {
    setDraggedIndex(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (targetIndex: number, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex || !status?.models) return;
    const newModels = [...status.models];
    const [draggedItem] = newModels.splice(draggedIndex, 1);
    newModels.splice(targetIndex, 0, draggedItem);
    setDraggedIndex(null);
    await persistModelOrder(newModels);
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

    const progressPromise = listen<DownloadProgressPayload>("upscale-download-progress", (event) => {
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
    });

    const compilePromise = listen<UpscaleCompileProgress>("upscale-compile-progress", (event) => {
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
      progressPromise.then((unlisten) => unlisten && unlisten()).catch(() => {});
      compilePromise.then((unlisten) => unlisten && unlisten()).catch(() => {});
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

  const isAiActive = settings.mode === "ai";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Выбор основного режима работы */}
      <div className="glass-section" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
            className={`btn ${isAiActive ? "btn--primary" : "btn--secondary"}`}
            onClick={() => updateSettings({ mode: isAiActive ? "off" : "ai" })}
            title={isAiActive ? "Нажмите, чтобы выключить апскейлинг" : "Нажмите, чтобы включить апскейлинг"}
            style={{ borderRadius: "var(--radius-pill)", padding: "6px 14px", fontWeight: 600, fontSize: "0.84rem" }}
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
      <div className="glass-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
              className="btn btn--secondary btn--icon"
              onClick={toggleHideModelNames}
            >
              {hideModelNames ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>

            <button
              type="button"
              className="btn btn--secondary btn--icon"
              onClick={handleOpenModelsFolder}
              title="Открыть папку моделей в Проводнике"
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
            padding: "5px 6px",
            margin: "2px -6px 0",
            boxSizing: "border-box",
          }}
        >
          {loading && !status ? (
            <div style={{ padding: 18, textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Загрузка списка моделей...
            </div>
          ) : status?.models && status.models.length > 0 ? (
            status.models.map((model, idx) => {
              const actionId = `upscaleNet${idx + 1}`;
              return (
                <ModelListItem
                  key={model.filename}
                  model={model}
                  idx={idx}
                  isSelected={settings.active_slot === model.slot || settings.selected_model === model.filename}
                  isFirst={idx === 0}
                  isLast={idx === status.models.length - 1}
                  isDragged={draggedIndex === idx}
                  hideModelNames={hideModelNames}
                  customHotkeys={customHotkeys}
                  recordingActionId={recordingActionId}
                  supportsTensorrt={!!status.gpu_info?.supports_tensorrt}
                  compilingModel={compilingModel}
                  compileProgressItem={compileProgress[model.filename]}
                  onSelect={() => updateSettings({ active_slot: model.slot, selected_model: model.filename })}
                  onMoveUp={(e) => handleMoveModel(idx, "up", e)}
                  onMoveDown={(e) => handleMoveModel(idx, "down", e)}
                  onDragStart={(e) => handleDragStart(idx, e)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(idx, e)}
                  onPrecompile={() => handlePrecompileModel(model)}
                  onStartRecordKey={() => setRecordingActionId(recordingActionId === actionId ? null : actionId)}
                  onKeyRecord={(e) => handleKeyRecord(e, actionId)}
                  onClearKey={(e) => handleClearHotkey(e, actionId)}
                />
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
