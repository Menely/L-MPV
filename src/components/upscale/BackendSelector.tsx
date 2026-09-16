import React from "react";
import {
  Cpu,
  FolderOpen,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  X,
} from "lucide-react";
import { UpscaleSettings, UpscaleStatus, DownloadProgressPayload } from "./types";
import { GpuHardwareCard } from "./GpuHardwareCard";

interface BackendSelectorProps {
  status: UpscaleStatus | null;
  settings: UpscaleSettings;
  isDownloadingEngine: boolean;
  isDeletingEngine: boolean;
  downloadProgressText: string | null;
  downloadProgress: DownloadProgressPayload | null;
  engineSuccessMessage: string | null;
  errorMessage: string | null;
  onSelectBackend: (backend: "DirectML" | "TensorRT") => void;
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
  downloadProgress,
  engineSuccessMessage,
  errorMessage,
  onSelectBackend,
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

  const isFinished = !!(downloadProgress && downloadProgress.is_finished && !downloadProgress.error);
  const isError = !!(downloadProgress && downloadProgress.error);
  const showDownloadBar = isDownloadingEngine || downloadProgress !== null;

  const activePercent = isFinished
    ? 100
    : Math.min(100, Math.max(0, Math.round(downloadProgress?.percent || 0)));

  return (
    <div className="glass-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "nowrap",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontSize: "1.02rem",
              fontWeight: 600,
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            <Cpu size={17} color="var(--accent)" /> Движок инференса (Backend)
          </h3>
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Библиотеки выполнения нейросетей (aji.dll, DirectML, OnnxRuntime, TensorRT)
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn--secondary btn--icon"
            onClick={onOpenInferenceFolder}
            title="Открыть папку движков инференса в Проводнике"
          >
            <FolderOpen size={16} />
          </button>

          {isCurrentBackendInstalled ? (
            <div
              className="badge badge--success"
              style={{
                height: 32,
                padding: "0 14px",
                fontSize: "0.82rem",
                borderRadius: "var(--radius-sm, 8px)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minWidth: 145,
                justifyContent: "center",
                boxSizing: "border-box",
              }}
              title="Движок инференса установлен и готов к работе"
            >
              <CheckCircle2 size={15} color="#2ecc71" />
              <span>Установлен</span>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={onDownloadEngine}
              disabled={isDownloadingEngine || (downloadProgress !== null && !downloadProgress.is_finished)}
              title="Скачать файлы библиотек движка инференса"
              style={{ minWidth: 145, height: 32 }}
            >
              {isDownloadingEngine || (downloadProgress !== null && !downloadProgress.is_finished) ? (
                <RefreshCw size={15} className="spin" />
              ) : (
                <Download size={15} />
              )}
              {isDownloadingEngine || (downloadProgress !== null && !downloadProgress.is_finished)
                ? `Загрузка ${activePercent}%`
                : "Скачать движок"}
            </button>
          )}

          {isAnyEnginePresent && (
            <button
              type="button"
              className="btn btn--danger btn--icon"
              onClick={onDeleteEngine}
              disabled={isDeletingEngine || isDownloadingEngine}
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

      {/* Интерактивный прогресс-бар загрузки библиотек */}
      {showDownloadBar && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: isError
              ? "rgba(231, 76, 60, 0.08)"
              : isFinished
              ? "rgba(46, 204, 113, 0.08)"
              : "rgba(127, 199, 255, 0.08)",
            border: `1px solid ${
              isError
                ? "rgba(231, 76, 60, 0.35)"
                : isFinished
                ? "rgba(46, 204, 113, 0.35)"
                : "rgba(127, 199, 255, 0.3)"
            }`,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            transition: "all 0.25s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.83rem",
                color: "var(--text-primary)",
                fontWeight: 500,
                minWidth: 0,
              }}
            >
              {isError ? (
                <X size={15} color="#e74c3c" style={{ flexShrink: 0 }} />
              ) : isFinished ? (
                <CheckCircle2 size={15} color="#2ecc71" style={{ flexShrink: 0 }} />
              ) : (
                <RefreshCw size={14} className="spin" color="var(--accent)" style={{ flexShrink: 0 }} />
              )}
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: isError
                    ? "#e74c3c"
                    : isFinished
                    ? "#2ecc71"
                    : "var(--text-primary)",
                  fontWeight: isFinished ? 600 : 500,
                }}
              >
                {downloadProgress?.stage || downloadProgressText || "Загрузка библиотек инференса..."}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.82rem",
                fontWeight: 700,
                color: isError ? "#e74c3c" : isFinished ? "#2ecc71" : "var(--accent)",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
            >
              {downloadProgress && downloadProgress.total_bytes > 0 ? (
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontWeight: 400,
                    fontSize: "0.77rem",
                  }}
                >
                  {(downloadProgress.downloaded_bytes / (1024 * 1024)).toFixed(1)} МБ / {(downloadProgress.total_bytes / (1024 * 1024)).toFixed(1)} МБ
                </span>
              ) : downloadProgress?.stage?.includes("Распаковка") ? (
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontWeight: 400,
                    fontSize: "0.77rem",
                  }}
                >
                  Распаковка архива...
                </span>
              ) : null}
              <span className={`badge ${isError ? "badge--danger" : isFinished ? "badge--success" : "badge--accent"}`}>
                {isError ? "Ошибка" : `${activePercent}%`}
              </span>
            </div>
          </div>

          {/* Анимированный трек прогресс-бара */}
          <div
            style={{
              width: "100%",
              height: 7,
              background: "rgba(255, 255, 255, 0.08)",
              borderRadius: "var(--radius-xs, 4px)",
              overflow: "hidden",
              position: "relative",
              transition: "border-radius var(--t-spring) var(--ease-spring-smooth)",
            }}
          >
            <div
              style={{
                width: isError ? "100%" : `${activePercent}%`,
                height: "100%",
                background: isError
                  ? "#e74c3c"
                  : isFinished
                  ? "linear-gradient(90deg, #27ae60, #2ecc71)"
                  : "linear-gradient(90deg, #3498db, var(--accent), #2ecc71)",
                borderRadius: "var(--radius-xs, 4px)",
                boxShadow: isError
                  ? "0 0 8px rgba(231, 76, 60, 0.4)"
                  : isFinished
                  ? "0 0 10px rgba(46, 204, 113, 0.4)"
                  : "0 0 8px rgba(127, 199, 255, 0.5)",
                transition: "width 0.25s ease-out, border-radius var(--t-spring) var(--ease-spring-smooth)",
              }}
            />
          </div>
        </div>
      )}

      {/* Уведомление об успешной установке (только когда прогресс-бар уже скрыт) */}
      {engineSuccessMessage && !isDownloadingEngine && !showDownloadBar && (
        <div
          className="badge badge--success"
          style={{ width: "100%", padding: "8px 14px", height: "auto", fontSize: "0.82rem", borderRadius: "var(--radius-md)", boxSizing: "border-box" }}
        >
          <CheckCircle2 size={15} />
          <span>{engineSuccessMessage}</span>
        </div>
      )}

      {/* Сообщение об ошибке */}
      {errorMessage && !isDownloadingEngine && !isFinished && !engineSuccessMessage && (
        <div
          className="badge badge--danger"
          style={{ width: "100%", padding: "8px 14px", height: "auto", fontSize: "0.82rem", borderRadius: "var(--radius-md)", boxSizing: "border-box" }}
        >
          <X size={15} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Выбор между DirectML и TensorRT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {/* Карточка DirectML */}
        <div
          className={`glass-tile glass-tile--clickable ${
            settings.backend === "DirectML" ? "glass-tile--active" : ""
          }`}
          onClick={() => {
            if (settings.backend !== "DirectML") {
              onSelectBackend("DirectML");
            }
          }}
          style={{ padding: "12px 14px" }}
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
              <span className={`badge ${isDmlInstalled ? "badge--success" : "badge--warning"}`}>
                {isDmlInstalled ? "Установлен" : "Не установлен"}
              </span>
              {status?.gpu_info && !status.gpu_info.supports_tensorrt && (
                <span className="badge badge--accent">
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
          className={`glass-tile ${
            status?.gpu_info && !status.gpu_info.supports_tensorrt
              ? ""
              : "glass-tile--clickable"
          } ${settings.backend === "TensorRT" ? "glass-tile--active" : ""}`}
          onClick={() => {
            if (status?.gpu_info && !status.gpu_info.supports_tensorrt) {
              onError(
                "Движок TensorRT доступен исключительно для видеокарт NVIDIA RTX/GTX. Для вашей видеокарты используется DirectML."
              );
              return;
            }
            if (settings.backend !== "TensorRT") {
              onSelectBackend("TensorRT");
            }
          }}
          style={{
            padding: "12px 14px",
            cursor:
              status?.gpu_info && !status.gpu_info.supports_tensorrt
                ? "not-allowed"
                : "pointer",
            opacity:
              status?.gpu_info && !status.gpu_info.supports_tensorrt ? 0.6 : 1,
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
              <span className={`badge ${isTrtInstalled ? "badge--success" : "badge--warning"}`}>
                {isTrtInstalled ? "Установлен" : "Не установлен"}
              </span>
              {status?.gpu_info?.supports_tensorrt && (
                <span className="badge badge--success">
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
