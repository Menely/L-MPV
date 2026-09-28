import { useTranslation } from "../../i18n/LanguageContext";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Zap,
  FolderOpen,
  Layers,
  Eye,
  EyeOff,
  ChevronDown,
} from "lucide-react";
import {
  getCustomHotkeys,
  saveCustomHotkeys,
  isCodeReservedForUpscaleOff,
} from "../../utils/hotkeyUtils";
import {
  ModelFileItem,
  GpuHardwareInfo,
  UpscaleStatus,
  UpscaleSettings,
  DownloadProgressPayload,
  UpscaleCompileProgress,
} from "../upscale/types";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { BackendSelector } from "../upscale/BackendSelector";
import { ModelListItem } from "../upscale/ModelListItem";
import {
  getPreloadedUpscaleStatus,
  loadPreloadedUpscaleStatus,
  storeUpscaleStatus,
} from "./settingsTabPreload";
import { SectionHeader, EmptyState } from "./SettingBlocks";

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
  onRecordingChange?: (isRecording: boolean) => void;
}

/**
 * Вкладка управления апскейлингом видео в реальном времени (AI Upscaling).
 */
export const UpscalingSettingsSection: React.FC<UpscalingSettingsSectionProps> = ({
  onClose: _onClose,
  onRecordingChange,
}) => {
  const { dict } = useTranslation();
  // Синхронное чтение предзагруженного кэша: первый paint уже полный
  // (список моделей + GPU), окно настроек не прыгает после прилёта данных.
  const [status, setStatus] = useState<UpscaleStatus | null>(() => getPreloadedUpscaleStatus());
  const [loading, setLoading] = useState<boolean>(() => getPreloadedUpscaleStatus() === null);
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
  const [isModelsListOpen, setIsModelsListOpen] = useState(false);

  const toggleHideModelNames = () => {
    const next = !hideModelNames;
    setHideModelNames(next);
    try {
      localStorage.setItem("l-mpv-hide-model-names", next ? "true" : "false");
      window.dispatchEvent(new Event("l-mpv-settings-changed"));
    } catch (e) {
      setHideModelNames(!next);
      console.error(dict.settings.upscaling.errSaveHideModels, e);
    }
  };

  const ignoreClickUntilRef = useRef<number>(0);

  const persistModelOrder = async (newModels: ModelFileItem[]) => {
    setStatus((prev) => (prev ? { ...prev, models: newModels } : prev));
    const order = newModels.map((m) => m.filename);
    try {
      localStorage.setItem("l-mpv-upscale-models-order", JSON.stringify(order));
      await invoke("save_models_order", { order });
      window.dispatchEvent(new Event("l-mpv-settings-changed"));
    } catch (err) {
      console.error(dict.settings.upscaling.errSaveOrder, err);
    }
  };

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && status?.models) {
      const oldIndex = status.models.findIndex((m) => m.filename === active.id);
      const newIndex = status.models.findIndex((m) => m.filename === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newModels = arrayMove(status.models, oldIndex, newIndex);
        await persistModelOrder(newModels);
      }
    }
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
        // (с предзагруженным кэшем скелетон не мелькает — сразу полный контент)
        if (isMountedRef.current && !isInitialLoadedRef.current && !getPreloadedUpscaleStatus()) {
          setLoading(true);
        }
        const currentStatus = await loadPreloadedUpscaleStatus(true);
        if (isMountedRef.current) {
          storeUpscaleStatus(currentStatus);
          setStatus(currentStatus);
          // Очищаем ошибку загрузки статуса при успешном получении
          setErrorMessage((prev) =>
            prev === dict.settings.upscaling.errStatus ? null : prev
          );
        }
      } catch (err) {
        console.error(dict.settings.upscaling.errStatusLoad, err);
        if (isMountedRef.current) {
          setErrorMessage(dict.settings.upscaling.errStatus);
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
          setErrorMessage(dict.settings.upscaling.errLoadStage(payload.error));
          if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
          downloadTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setDownloadProgress(null);
              setDownloadProgressText(null);
            }
          }, 4000);
        } else {
          setEngineSuccessMessage(dict.settings.upscaling.successEngine(payload.stage));
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
        setErrorMessage(dict.settings.upscaling.errLoadStage(payload.error));
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
          setErrorMessage(dict.settings.upscaling.errCompile(p.filename, p.error));
        } else {
          setEngineSuccessMessage(dict.settings.upscaling.successCompile(p.filename));
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
      setErrorMessage(dict.settings.upscaling.errNeedBackend(updated.backend));
      const fallbackSettings: UpscaleSettings = { ...updated, mode: "off" };
      setSettings(fallbackSettings);
      localStorage.setItem("l-mpv-upscale-mode", "off");
      return;
    }

    try {
      await invoke("apply_upscale_settings", { settings: updated });
    } catch (err) {
      console.error(dict.settings.upscaling.errApply, err);
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
          console.error(dict.settings.upscaling.errApplyEngine, err);
          setErrorMessage(String(err));
        }
      } else {
        setErrorMessage(dict.settings.upscaling.errEngineNotInstalled(backend));
      }
    }
  };

  // Открытие папки моделей models/onnx/ в Проводнике
  const handleOpenModelsFolder = async () => {
    try {
      await invoke("open_models_folder");
    } catch (err) {
      console.error(dict.settings.upscaling.errOpenModels, err);
    }
  };

  // Открытие папки библиотек инференса inference/ в Проводнике
  const handleOpenInferenceFolder = async () => {
    try {
      await invoke("open_inference_folder");
    } catch (err) {
      console.error(dict.settings.upscaling.errOpenEngines, err);
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
        ? dict.settings.upscaling.prepTensorRt(sm)
        : dict.settings.upscaling.prepDirectMl
    );
    try {
      const res = await invoke<string>("download_inference_engine", { engine: engineName });
      setEngineSuccessMessage(dict.settings.upscaling.successInstallLibs(res));
      setErrorMessage(null);
      await refreshStatus();
    } catch (err) {
      console.error(dict.settings.upscaling.errDownloadLibs, err);
      setErrorMessage(dict.settings.upscaling.errEngineDownload(String(err)));
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
      setEngineSuccessMessage(dict.settings.upscaling.successRemoveLibs(res));

      // Если режим AI был включен с этим движком, отключаем его
      if (settings.mode === "ai") {
        const offSettings: UpscaleSettings = { ...settings, mode: "off" };
        setSettings(offSettings);
        localStorage.setItem("l-mpv-upscale-mode", "off");
        await invoke("apply_upscale_settings", { settings: offSettings });
      }

      await refreshStatus();
    } catch (err) {
      console.error(dict.settings.upscaling.errRemoveLibs, err);
      setErrorMessage(dict.settings.upscaling.errRemoveEngine(String(err)));
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
      setEngineSuccessMessage(dict.settings.upscaling.successOptimized(res));
      await refreshStatus();
    } catch (err) {
      console.error(dict.settings.upscaling.errModelCompile, err);
      setErrorMessage(dict.settings.upscaling.errModelCompileDetail(String(err)));
      setCompilingModel(null);
    }
  };


  // Назначение горячей клавиши для модели (с клавиатуры)
  const handleKeyRecord = (e: React.KeyboardEvent, actionId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
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

    // Shift+1 зарезервировано за выключением апскейлинга — моделям нельзя.
    // Запись не закрываем: пусть пользователь нажмёт другую комбинацию.
    if (isCodeReservedForUpscaleOff(newCode, actionId)) {
      setErrorMessage(dict.settings.upscaling.errShift1);
      return;
    }

    const updated = { ...customHotkeys, [actionId]: [newCode] };
    setCustomHotkeys(updated);
    saveCustomHotkeys(updated);
    setRecordingActionId(null);
  };

  // Назначение кнопки мыши для модели
  const handleMouseRecord = (e: React.MouseEvent, actionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    ignoreClickUntilRef.current = Date.now() + 400;
    const btnMap: Record<number, string> = { 0: "MouseLeft", 1: "MouseMiddle", 2: "MouseRight" };
    const newCode = btnMap[e.button] || `MouseButton${e.button}`;
    const updated = { ...customHotkeys, [actionId]: [newCode] };
    setCustomHotkeys(updated);
    saveCustomHotkeys(updated);
    setRecordingActionId(null);
  };

  // Переключение режима записи горячей клавиши
  const handleStartRecordKey = (actionId: string) => {
    if (Date.now() < ignoreClickUntilRef.current) {
      return;
    }
    setRecordingActionId((prev) => (prev === actionId ? null : actionId));
  };

  // Синхронизация состояния записи с родительским окном для блокировки переключения табов/закрытия
  useEffect(() => {
    if (onRecordingChange) {
      onRecordingChange(recordingActionId !== null);
    }
  }, [recordingActionId, onRecordingChange]);

  // Глобальный перехват Escape и клика мимо кнопки при активном режиме записи хоткея модели
  useEffect(() => {
    if (!recordingActionId) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setRecordingActionId(null);
      }
    };

    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (Date.now() < ignoreClickUntilRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest("[data-hotkey-recording='true']")) {
        return;
      }
      setRecordingActionId(null);
    };

    window.addEventListener("keydown", handleGlobalKeyDown, true);
    window.addEventListener("mousedown", handleGlobalMouseDown, true);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true);
      window.removeEventListener("mousedown", handleGlobalMouseDown, true);
    };
  }, [recordingActionId]);

  const isAiActive = settings.mode === "ai";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Выбор основного режима работы */}
      <div className="glass-section" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={18} color="var(--accent)" /> {dict.settings.upscaling.modeTitle}
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 2 }}>
              {dict.settings.upscaling.modeDesc}
            </p>
          </div>

          {/* Интерактивная кнопка-тумблер Включен / Выключен */}
          <button
            type="button"
            className={`btn ${isAiActive ? "btn--primary" : "btn--secondary"}`}
            onClick={() => updateSettings({ mode: isAiActive ? "off" : "ai" })}
            title={isAiActive ? dict.settings.upscaling.toggleOff : dict.settings.upscaling.toggleOn}
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
            {isAiActive ? dict.settings.upscaling.statusOn : dict.settings.upscaling.statusOff}
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
      <div className="glass-section glass-section--compact" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isModelsListOpen}
          onClick={() => setIsModelsListOpen((prev) => !prev)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsModelsListOpen((prev) => !prev);
            }
          }}
          style={{ cursor: "pointer" }}
        >
          <SectionHeader
            icon={<Layers size={17} />}
          title={dict.settings.upscaling.folderTitle}
          desc={dict.settings.upscaling.folderDesc(status?.models_count || 0)}
          right={
            <>
              <button
                type="button"
                className="btn btn--secondary btn--icon"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsModelsListOpen((prev) => !prev);
                }}
                aria-expanded={isModelsListOpen}
                title={isModelsListOpen ? dict.settings.upscaling.btnCollapseModels : dict.settings.upscaling.btnExpandModels}
              >
                <ChevronDown
                  size={16}
                  style={{
                    transform: isModelsListOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 180ms var(--ease-smooth)",
                  }}
                />
              </button>

              <button
                type="button"
                className="btn btn--secondary btn--icon"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleHideModelNames();
                }}
                title={hideModelNames ? dict.settings.upscaling.btnShowNames : dict.settings.upscaling.btnHideNames}
              >
                {hideModelNames ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>

              <button
                type="button"
                className="btn btn--secondary btn--icon"
                onClick={handleOpenModelsFolder}
                title={dict.settings.upscaling.btnOpenFolderTitle}
              >
                <FolderOpen size={16} />
              </button>
            </>
          }
          />
        </div>

        <div className={`collapse-fold ${isModelsListOpen ? "collapse-fold--open" : ""}`}>
          <div className="collapse-fold__inner">
            <div className="collapse-fold__body">
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
                  <EmptyState loading title={dict.settings.upscaling.loadingModels} />
                ) : status?.models && status.models.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={status.models.map((m) => m.filename)}
                      strategy={verticalListSortingStrategy}
                    >
                      {status.models.map((model, idx) => {
                        const actionId = `upscaleNet${idx + 1}`;
                        return (
                          <ModelListItem
                            key={model.filename}
                            model={model}
                            idx={idx}
                            isSelected={settings.active_slot === model.slot || settings.selected_model === model.filename}
                            hideModelNames={hideModelNames}
                            customHotkeys={customHotkeys}
                            recordingActionId={recordingActionId}
                            supportsTensorrt={!!status.gpu_info?.supports_tensorrt}
                            compilingModel={compilingModel}
                            compileProgressItem={compileProgress[model.filename]}
                            onSelect={() => updateSettings({ active_slot: model.slot, selected_model: model.filename })}
                            onPrecompile={() => handlePrecompileModel(model)}
                            onStartRecordKey={() => handleStartRecordKey(actionId)}
                            onKeyRecord={(e) => handleKeyRecord(e, actionId)}
                            onMouseRecord={(e) => handleMouseRecord(e, actionId)}
                          />
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                ) : (
                  <EmptyState
                    icon={<Layers size={24} />}
                    title={dict.settings.upscaling.noModelsTitle}
                    desc={dict.settings.upscaling.noModelsDesc}
                    action={
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                onClick={(event) => {
                  event.stopPropagation();
                  handleOpenModelsFolder();
                }}
                      >
                        <FolderOpen size={14} /> {dict.settings.upscaling.btnOpenFolder}
                      </button>
                    }
                  />
                )}
        </div>
      </div>
    </div>
      </div>
      </div>
    </div>
  );
};
