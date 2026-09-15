import React from "react";
import {
  Cpu,
  FolderOpen,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { UpscaleSettings, UpscaleStatus } from "./types";
import { GpuHardwareCard } from "./GpuHardwareCard";

interface BackendSelectorProps {
  status: UpscaleStatus | null;
  settings: UpscaleSettings;
  isDownloadingEngine: boolean;
  isDeletingEngine: boolean;
  downloadProgressText: string | null;
  engineSuccessMessage: string | null;
  errorMessage: string | null;
  onUpdateSettings: (partial: Partial<UpscaleSettings>) => void;
  onOpenInferenceFolder: () => void;
  onDownloadEngine: () => void;
  onDeleteEngine: () => void;
  onError: (msg: string) => void;
}

export const BackendSelector: React.FC<BackendSelectorProps> = ({
  status,
  settings,
  isDownloadingEngine,
  isDeletingEngine,
  downloadProgressText,
  engineSuccessMessage,
  errorMessage,
  onUpdateSettings,
  onOpenInferenceFolder,
  onDownloadEngine,
  onDeleteEngine,
  onError,
}) => {
  const isDmlInstalled = !!(status?.directml_present && status?.aji_present);
  const isTrtInstalled = !!(status?.tensorrt_present && status?.aji_present);
  const isCurrentBackendInstalled =
    settings.backend === "DirectML" ? isDmlInstalled : isTrtInstalled;
  const isAnyEnginePresent = isDmlInstalled || isTrtInstalled;

  return (
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "1.02rem",
              fontWeight: 600,
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Cpu size={17} color="var(--accent)" /> Движок инференса (Backend)
          </h3>
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            Библиотеки выполнения нейросетей (aji.dll, DirectML, OnnxRuntime, TensorRT)
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={onOpenInferenceFolder}
            title="Открыть папку движков инференса в Проводнике"
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

          <button
            type="button"
            onClick={onDownloadEngine}
            disabled={isDownloadingEngine || isCurrentBackendInstalled}
            title={
              isCurrentBackendInstalled
                ? "Движок уже установлен"
                : "Скачать или обновить файлы библиотек движка инференса"
            }
            style={{
              padding: "8px 14px",
              borderRadius: "var(--radius-md)",
              background: isCurrentBackendInstalled
                ? "rgba(255, 255, 255, 0.06)"
                : "var(--accent)",
              border: isCurrentBackendInstalled
                ? "1px solid var(--border-pill)"
                : "none",
              color: isCurrentBackendInstalled ? "var(--text-muted)" : "#000",
              fontSize: "0.82rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor:
                isDownloadingEngine || isCurrentBackendInstalled
                  ? "default"
                  : "pointer",
              opacity: isDownloadingEngine || isCurrentBackendInstalled ? 0.5 : 1,
            }}
          >
            {isDownloadingEngine ? (
              <RefreshCw size={15} className="spin" />
            ) : (
              <Download size={15} />
            )}
            {isDownloadingEngine
              ? "Загрузка..."
              : isCurrentBackendInstalled
              ? "Установлен"
              : "Скачать движок"}
          </button>

          {isAnyEnginePresent && (
            <button
              type="button"
              onClick={onDeleteEngine}
              disabled={isDeletingEngine}
              title="Удалить файлы выбранного движка инференса"
              style={{
                padding: "8px 10px",
                borderRadius: "var(--radius-md)",
                background: "rgba(231, 76, 60, 0.12)",
                border: "1px solid rgba(231, 76, 60, 0.3)",
                color: "#e74c3c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: isDeletingEngine ? "wait" : "pointer",
                opacity: isDeletingEngine ? 0.6 : 1,
                transition: "all 0.15s ease",
              }}
            >
              {isDeletingEngine ? (
                <RefreshCw size={14} className="spin" />
              ) : (
                <Trash2 size={14} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Аппаратная карточка GPU */}
      <GpuHardwareCard gpuInfo={status?.gpu_info} />

      {/* Индикатор этапа загрузки библиотек */}
      {isDownloadingEngine && downloadProgressText && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "rgba(127, 199, 255, 0.1)",
            border: "1px solid rgba(127, 199, 255, 0.3)",
            color: "var(--accent)",
            fontSize: "0.82rem",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <RefreshCw size={15} className="spin" />
          <span>{downloadProgressText}</span>
        </div>
      )}

      {engineSuccessMessage && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "var(--radius-md)",
            background: "rgba(46, 204, 113, 0.15)",
            border: "1px solid rgba(46, 204, 113, 0.3)",
            color: "#2ecc71",
            fontSize: "0.82rem",
          }}
        >
          {engineSuccessMessage}
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "var(--radius-md)",
            background: "rgba(231, 76, 60, 0.15)",
            border: "1px solid rgba(231, 76, 60, 0.3)",
            color: "#e74c3c",
            fontSize: "0.82rem",
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Выбор между DirectML и TensorRT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {/* Карточка DirectML */}
        <div
          onClick={() => onUpdateSettings({ backend: "DirectML" })}
          style={{
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            border: `1px solid ${
              settings.backend === "DirectML"
                ? "var(--accent)"
                : "var(--border-pill)"
            }`,
            background:
              settings.backend === "DirectML"
                ? "rgba(127, 199, 255, 0.08)"
                : "rgba(0, 0, 0, 0.2)",
            cursor: "pointer",
            transition: "all 0.18s ease",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                DirectML
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: isDmlInstalled
                    ? "rgba(46, 204, 113, 0.15)"
                    : "rgba(230, 126, 34, 0.15)",
                  color: isDmlInstalled ? "#2ecc71" : "#e67e22",
                  fontWeight: 600,
                }}
              >
                {isDmlInstalled ? "Установлен" : "Не установлен"}
              </span>
              {status?.gpu_info && !status.gpu_info.supports_tensorrt && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: "rgba(127, 199, 255, 0.15)",
                    color: "var(--accent)",
                    fontWeight: 600,
                  }}
                >
                  Рекомендуется
                </span>
              )}
            </div>
            {settings.backend === "DirectML" && (
              <CheckCircle2 size={16} color="var(--accent)" />
            )}
          </div>
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              lineHeight: 1.3,
            }}
          >
            Универсальный DirectX 12 для любого GPU (AMD, Intel, NVIDIA). Высокая совместимость.
          </p>
        </div>

        {/* Карточка TensorRT */}
        <div
          onClick={() => {
            if (status?.gpu_info && !status.gpu_info.supports_tensorrt) {
              onError(
                "Движок TensorRT доступен исключительно для видеокарт NVIDIA RTX/GTX. Для вашей видеокарты используется DirectML."
              );
              return;
            }
            onUpdateSettings({ backend: "TensorRT" });
          }}
          style={{
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            border: `1px solid ${
              settings.backend === "TensorRT"
                ? "var(--accent)"
                : "var(--border-pill)"
            }`,
            background:
              settings.backend === "TensorRT"
                ? "rgba(127, 199, 255, 0.08)"
                : "rgba(0, 0, 0, 0.2)",
            cursor:
              status?.gpu_info && !status.gpu_info.supports_tensorrt
                ? "not-allowed"
                : "pointer",
            opacity:
              status?.gpu_info && !status.gpu_info.supports_tensorrt ? 0.6 : 1,
            transition: "all 0.18s ease",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                TensorRT (NVIDIA)
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: isTrtInstalled
                    ? "rgba(46, 204, 113, 0.15)"
                    : "rgba(230, 126, 34, 0.15)",
                  color: isTrtInstalled ? "#2ecc71" : "#e67e22",
                  fontWeight: 600,
                }}
              >
                {isTrtInstalled ? "Установлен" : "Не установлен"}
              </span>
              {status?.gpu_info?.supports_tensorrt && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: "rgba(118, 185, 0, 0.18)",
                    color: "#76b900",
                    fontWeight: 600,
                  }}
                >
                  Рекомендуется
                </span>
              )}
            </div>
            {settings.backend === "TensorRT" && (
              <CheckCircle2 size={16} color="var(--accent)" />
            )}
          </div>
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              lineHeight: 1.3,
            }}
          >
            Максимальная скорость для карт NVIDIA RTX через скомпилированные TensorRT .engine.
          </p>
        </div>
      </div>
    </div>
  );
};
