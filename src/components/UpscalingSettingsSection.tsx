import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Zap,
  FolderOpen,
  Download,
  CheckCircle2,
  Cpu,
  Layers,
  Sparkles,
  RefreshCw,
  Info,
  Keyboard,
} from "lucide-react";

export interface ModelFileItem {
  filename: string;
  display_name: string;
  size_bytes: number;
  slot: number;
  full_path: string;
}

export interface UpscaleStatus {
  filter_supported: boolean;
  aji_present: boolean;
  directml_present: boolean;
  tensorrt_present: boolean;
  models_count: number;
  models_dir: string;
  models: ModelFileItem[];
}

export interface UpscaleSettings {
  mode: "off" | "ai";
  active_slot: number;
  backend: "DirectML" | "TensorRT";
  selected_model: string;
}

/**
 * Вкладка управления апскейлингом видео в реальном времени (AI Upscaling / AnimeJaNai).
 *
 * Позволяет переключать режим апскейлинга, выбирать бэкенд инференса (DirectML / TensorRT),
 * управлять универсальной библиотекой ONNX-моделей из папки models/onnx/,
 * открывать директорию в Проводнике и скачивать рекомендованные нейросети.
 */
export const UpscalingSettingsSection: React.FC = () => {
  const [status, setStatus] = useState<UpscaleStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [settings, setSettings] = useState<UpscaleSettings>(() => {
    try {
      const savedMode = localStorage.getItem("l-mpv-upscale-mode") as "off" | "ai" || "off";
      const savedBackend = localStorage.getItem("l-mpv-upscale-backend") as "DirectML" | "TensorRT" || "DirectML";
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

    // Автоматическое обновление списка моделей при возврате фокуса в окно L-MPV (например, после добавления файлов в Проводнике)
    const handleFocus = () => {
      if (isMountedRef.current) refreshStatus();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("focus", handleFocus);
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

  // Открытие универсальной папки моделей models/onnx/ в Проводнике
  const handleOpenFolder = async () => {
    try {
      await invoke("open_models_folder");
    } catch (err) {
      console.error("Ошибка открытия папки моделей:", err);
    }
  };

  // Фоновое скачивание базовых рекомендованных моделей
  const handleDownloadModels = async () => {
    setIsDownloading(true);
    setDownloadSuccessMessage(null);
    setErrorMessage(null);
    try {
      const count = await invoke<number>("download_recommended_models");
      if (count > 0) {
        setDownloadSuccessMessage(`Успешно загружено новых моделей: ${count}`);
      } else {
        setDownloadSuccessMessage("Все рекомендуемые модели уже установлены");
      }
      await refreshStatus();
    } catch (err) {
      console.error("Ошибка скачивания моделей:", err);
      setErrorMessage(`Ошибка скачивания: ${err}`);
    } finally {
      setIsDownloading(false);
    }
  };

  // Вспомогательная функция форматирования размера файлов
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

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
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={18} color="var(--accent)" /> Режим апскейлинга
            </h3>
            <p style={{ fontSize: "0.83rem", color: "var(--text-muted)", marginTop: 2 }}>
              Включение или выключение нейросетевого апскейла 4K в плеере
            </p>
          </div>
          <span
            style={{
              fontSize: "0.78rem",
              padding: "4px 10px",
              borderRadius: "var(--radius-pill)",
              fontWeight: 600,
              background: settings.mode === "ai" ? "rgba(127, 199, 255, 0.15)" : "rgba(255, 255, 255, 0.07)",
              color: settings.mode === "ai" ? "var(--accent)" : "var(--text-muted)",
              border: `1px solid ${settings.mode === "ai" ? "var(--accent)" : "transparent"}`,
            }}
          >
            {settings.mode === "ai" ? "AI Upscaling Активен" : "Выключен"}
          </span>
        </div>

        {/* Переключатель из двух режимов: Выкл / AI Upscaling */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => updateSettings({ mode: "off" })}
            style={{
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              border: `1px solid ${settings.mode === "off" ? "var(--accent)" : "var(--border-pill)"}`,
              background: settings.mode === "off" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.25)",
              color: settings.mode === "off" ? "var(--text-primary)" : "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: "0.92rem",
              fontWeight: 600,
              transition: "all 0.18s ease",
            }}
          >
            Выкл
          </button>

          <button
            type="button"
            onClick={() => updateSettings({ mode: "ai" })}
            style={{
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              border: `1px solid ${settings.mode === "ai" ? "var(--accent)" : "var(--border-pill)"}`,
              background: settings.mode === "ai" ? "rgba(127, 199, 255, 0.15)" : "rgba(0, 0, 0, 0.25)",
              color: settings.mode === "ai" ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: "0.92rem",
              fontWeight: 600,
              transition: "all 0.18s ease",
            }}
          >
            <Sparkles size={16} /> AI Upscaling
          </button>
        </div>
      </div>

      {/* 2. Настройка бэкенда инференса (DirectML / TensorRT) */}
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
        <h3 style={{ fontSize: "1.02rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
          <Cpu size={17} color="var(--accent)" /> Движок инференса (Backend)
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div
            onClick={() => updateSettings({ backend: "DirectML" })}
            style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              border: `1px solid ${settings.backend === "DirectML" ? "var(--accent)" : "var(--border-pill)"}`,
              background: settings.backend === "DirectML" ? "rgba(127, 199, 255, 0.08)" : "rgba(0, 0, 0, 0.2)",
              cursor: "pointer",
              transition: "all 0.18s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>DirectML</span>
              {settings.backend === "DirectML" && <CheckCircle2 size={16} color="var(--accent)" />}
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.3 }}>
              Универсальный DirectX 12 для любого GPU (AMD, Intel, NVIDIA). Высокая стабильность.
            </p>
          </div>

          <div
            onClick={() => updateSettings({ backend: "TensorRT" })}
            style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              border: `1px solid ${settings.backend === "TensorRT" ? "var(--accent)" : "var(--border-pill)"}`,
              background: settings.backend === "TensorRT" ? "rgba(127, 199, 255, 0.08)" : "rgba(0, 0, 0, 0.2)",
              cursor: "pointer",
              transition: "all 0.18s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>TensorRT (NVIDIA)</span>
              {settings.backend === "TensorRT" && <CheckCircle2 size={16} color="var(--accent)" />}
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.3 }}>
              Максимальная скорость для карт NVIDIA RTX через скомпилированные TensorRT .engine.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Универсальная библиотека ONNX-моделей (`models/onnx/`) */}
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

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleOpenFolder}
              title="Открыть папку моделей в Проводнике"
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-md)",
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid var(--border-pill)",
                color: "var(--text-primary)",
                fontSize: "0.82rem",
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <FolderOpen size={15} /> Папка моделей
            </button>

            <button
              type="button"
              onClick={handleDownloadModels}
              disabled={isDownloading}
              title="Скачать базовые рекомендуемые AI-модели"
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-md)",
                background: "var(--accent)",
                border: "none",
                color: "#000",
                fontSize: "0.82rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: isDownloading ? "wait" : "pointer",
                opacity: isDownloading ? 0.7 : 1,
              }}
            >
              {isDownloading ? <RefreshCw size={15} className="spin" /> : <Download size={15} />}
              {isDownloading ? "Загрузка..." : "Скачать базовые"}
            </button>
          </div>
        </div>

        {downloadSuccessMessage && (
          <div style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: "rgba(46, 204, 113, 0.15)", border: "1px solid rgba(46, 204, 113, 0.3)", color: "#2ecc71", fontSize: "0.82rem" }}>
            {downloadSuccessMessage}
          </div>
        )}

        {errorMessage && (
          <div style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: "rgba(231, 76, 60, 0.15)", border: "1px solid rgba(231, 76, 60, 0.3)", color: "#e74c3c", fontSize: "0.82rem" }}>
            {errorMessage}
          </div>
        )}

        {/* Список обнаруженных файлов ONNX-моделей */}
        <div
          style={{
            maxHeight: 180,
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
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "rgba(255, 255, 255, 0.1)",
                        color: "var(--accent)",
                        fontFamily: "monospace",
                      }}
                    >
                      Shift+{idx + 2}
                    </div>
                    <div>
                      <div style={{ fontSize: "0.86rem", fontWeight: 500, color: "var(--text-primary)" }}>
                        {model.display_name}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {model.filename} ({formatFileSize(model.size_bytes)})
                      </div>
                    </div>
                  </div>

                  {isSelected && <CheckCircle2 size={16} color="var(--accent)" />}
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
              Нажмите <b>«Скачать базовые»</b> или скопируйте любые <code>.onnx</code> модели самостоятельно.
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
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Keyboard size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: "0.81rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
          <strong style={{ color: "var(--text-primary)" }}>Горячие клавиши переключения на лету:</strong>
          <br />
          <code style={{ color: "var(--accent)" }}>Shift+1</code> — Выключить апскейлинг |{" "}
          <code style={{ color: "var(--accent)" }}>Shift+2</code> — Включить Нейросеть #1 |{" "}
          <code style={{ color: "var(--accent)" }}>Shift+3</code> — Включить Нейросеть #2 |{" "}
          <code style={{ color: "var(--accent)" }}>Shift+4</code> — Включить Нейросеть #3
        </div>
      </div>
    </div>
  );
};
