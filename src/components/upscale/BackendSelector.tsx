import { SectionHeader } from "../settings/components/SettingBlocks";
import React, { useState } from "react";
import {
  Cpu,
  FolderOpen,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  X,
} from "lucide-react";
import { UpscaleSettings, UpscaleStatus, DownloadProgressPayload } from "./types";
import { GpuHardwareCard } from "./GpuHardwareCard";
import { useTranslation } from "../../i18n/LanguageContext";
import { backendNeedsUpdate, backendReady } from "../../utils/upscaleCompatibility";

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
  const { dict } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const isDmlInstalled = !!(status?.directml_present && status?.aji_present);
  const isTrtInstalled = !!(status?.tensorrt_present && status?.aji_present);
  const needsUpdate = backendNeedsUpdate(status, settings.backend);
  const isCurrentBackendInstalled = backendReady(status, settings.backend);
  const isAnyEnginePresent = isDmlInstalled || isTrtInstalled;

  const isFinished = !!(downloadProgress && downloadProgress.is_finished && !downloadProgress.error);
  const isError = !!(downloadProgress && downloadProgress.error);
  const showDownloadBar = isDownloadingEngine || downloadProgress !== null;

  const activePercent = isFinished
    ? 100
    : Math.min(100, Math.max(0, Math.round(downloadProgress?.percent || 0)));

  return (
    <div className="glass-section glass-section--compact settings-group-card col col-gap-4">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "nowrap",
          gap: "var(--space-6)",
          cursor: "pointer",
        }}
        >
        <div style={{ flex: 1, minWidth: 0 }}><SectionHeader icon={<Cpu size={16} />} title={dict.settings.upscaling.backendTitle} desc={dict.settings.upscaling.backendDesc} /></div>

        <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn--secondary btn--icon"
            onClick={(event) => {
              event.stopPropagation();
              setIsOpen((prev) => !prev);
            }}
            aria-expanded={isOpen}

            >
            <ChevronDown
              size={16}
              style={{
                transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 180ms var(--ease-smooth)",
              }}
            />
          </button>

          <button
            type="button"
            className="btn btn--secondary btn--icon"
            onClick={(event) => {
              event.stopPropagation();
              onOpenInferenceFolder();
            }}
            title={dict.settings.upscaling.backendOpenFolderTitle}
            >
            <FolderOpen size={16} />
          </button>

          {isCurrentBackendInstalled ? (
            <span
              title={dict.settings.upscaling.badgeInstalledTitle}
              aria-label={dict.settings.upscaling.statusInstalled}
              style={{
                width: 30,
                height: 30,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                color: "var(--success-text)",
                background: "rgba(46, 204, 113, 0.12)",
                border: "1px solid rgba(46, 204, 113, 0.28)",
                flexShrink: 0,
              }}
              >
              <CheckCircle2 size={18} />
            </span>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={(event) => {
                event.stopPropagation();
                onDownloadEngine();
              }}
              disabled={!!status?.player_update_required || isDownloadingEngine || (downloadProgress !== null && !downloadProgress.is_finished)}
              title={dict.settings.upscaling.btnDownloadLibsTitle}
              style={{ minWidth: 145, height: 32 }}
              >
              {isDownloadingEngine || (downloadProgress !== null && !downloadProgress.is_finished) ? (
                <RefreshCw size={15} className="spin" />
              ) : (
                <Download size={15} />
              )}
              {isDownloadingEngine || (downloadProgress !== null && !downloadProgress.is_finished)
                ? dict.settings.upscaling.downloadingProgress(activePercent)
                : needsUpdate ? dict.settings.upscaling.btnUpdateEngine : dict.settings.upscaling.btnDownloadEngine}
            </button>
          )}

          {isAnyEnginePresent && (
            <button
              type="button"
              className="btn btn--danger btn--icon"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteEngine();
              }}
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

      {(needsUpdate || status?.player_update_required) && (
        <div role="status" className="upscale-compatibility-notice" style={{ color: "var(--warning-text)", fontSize: "var(--fs-sm)", lineHeight: 1.5 }}>
          <p>{status?.player_update_required ? dict.settings.upscaling.playerUpdateRequired : dict.settings.upscaling.runtimeUpdateRequired}</p>
          {!status?.player_update_required && status?.runtime_restart_required && <p>{dict.settings.upscaling.runtimeRestartRequired}</p>}
        </div>
      )}
      <div className={`collapse-fold ${isOpen ? "collapse-fold--open" : ""}`}>
        <div className="collapse-fold__inner">
          <div className="collapse-fold__body backend-selector-content">
      {/* Аппаратная карточка GPU */}
      <GpuHardwareCard gpuInfo={status?.gpu_info} />

      {/* Интерактивный прогресс-бар загрузки библиотек */}
      {showDownloadBar && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: isError
              ? "var(--danger-surface)"
              : isFinished
              ? "var(--success-surface)"
              : "var(--surface-accent-subtle)",
            border: `1px solid ${
              isError
                ? "var(--danger-border)"
                : isFinished
                ? "var(--success-border)"
                : "var(--border-pill)"
            }`,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
            transition: "all 0.25s ease",
          }}
          >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-5)",
            }}
            >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-4)",
                fontSize: "var(--fs-sm)",
                color: "var(--text-primary)",
                fontWeight: 500,
                minWidth: 0,
              }}
              >
              {isError ? (
                <X size={15} color="var(--danger-text)" className="no-shrink" />
              ) : isFinished ? (
                <CheckCircle2 size={15} color="var(--success-text)" className="no-shrink" />
              ) : (
                <RefreshCw size={14} className="spin no-shrink" color="var(--accent-text, var(--accent))"  />
              )}
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: isError
                    ? "var(--danger-text)"
                    : isFinished
                    ? "var(--success-text)"
                    : "var(--text-primary)",
                  fontWeight: isFinished ? 600 : 500,
                }}
                >
                {downloadProgress?.stage || downloadProgressText || dict.settings.upscaling.downloadingLibs}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-4)",
                fontSize: "var(--fs-sm)",
                fontWeight: 700,
                color: isError ? "var(--danger-text)" : isFinished ? "var(--success-text)" : "var(--accent-text)",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
              >
              {downloadProgress && downloadProgress.total_bytes> 0 ? (
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontWeight: 400,
                    fontSize: "var(--fs-xs)",
                  }}
                  >
                  {(downloadProgress.downloaded_bytes / (1024 * 1024)).toFixed(1)} MB / {(downloadProgress.total_bytes / (1024 * 1024)).toFixed(1)} MB
                </span>
              ) : (downloadProgress?.stage?.includes("Распаковка") || downloadProgress?.stage?.toLowerCase().includes("extract")) ? (
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontWeight: 400,
                    fontSize: "var(--fs-xs)",
                  }}
                  >
                  {dict.settings.upscaling.extractingArchive}
                </span>
              ) : null}
              <span className={`badge ${isError ? "badge--danger" : isFinished ? "badge--success" : "badge--accent"}`}>
                {isError ? dict.settings.upscaling.errorLabel : `${activePercent}%`}
              </span>
            </div>
          </div>

          {/* Анимированный трек прогресс-бара */}
          <div
            style={{
              width: "100%",
              height: 7,
              background: "var(--surface-level-3-hover)",
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
                  ? "0 0 8px var(--danger-glow)"
                  : isFinished
                  ? "0 0 10px var(--success-glow)"
                  : "var(--selection-shadow)",
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
          style={{ width: "100%", padding: "8px 14px", height: "auto", fontSize: "var(--fs-sm)", borderRadius: "var(--radius-md)", boxSizing: "border-box" }}
          >
          <CheckCircle2 size={15} />
          <span>{engineSuccessMessage}</span>
        </div>
      )}

      {/* Сообщение об ошибке */}
      {errorMessage && !isDownloadingEngine && !isFinished && !engineSuccessMessage && (
        <div
          className="badge badge--danger"
          style={{ width: "100%", padding: "8px 14px", height: "auto", fontSize: "var(--fs-sm)", borderRadius: "var(--radius-md)", boxSizing: "border-box" }}
          >
          <X size={15} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Выбор между DirectML и TensorRT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-5)" }}>
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
              marginBottom: "var(--space-2)",
            }}
            >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                flexWrap: "wrap",
              }}
              >
              <span
                style={{
                  fontSize: "var(--fs-base)",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
                >
                DirectML
              </span>
              <span className={`badge ${isDmlInstalled ? "badge--success" : "badge--warning"}`}>
                {isDmlInstalled ? dict.settings.upscaling.statusInstalled : dict.settings.upscaling.statusNotInstalled}
              </span>
              {status?.gpu_info && !status.gpu_info.supports_tensorrt && (
                <span className="badge badge--accent">
                  {dict.settings.upscaling.recommended}
                </span>
              )}
            </div>
            {settings.backend === "DirectML" && (
              <CheckCircle2 size={16} color="var(--accent-text, var(--accent))" />
            )}
          </div>
          <p
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--text-muted)",
              lineHeight: 1.3,
            }}
            >
            {dict.settings.upscaling.dmlDesc}
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
              onError(dict.settings.upscaling.trtNotSupported);
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
              marginBottom: "var(--space-2)",
            }}
            >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                flexWrap: "wrap",
              }}
              >
              <span
                style={{
                  fontSize: "var(--fs-base)",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
                >
                TensorRT (NVIDIA)
              </span>
              <span className={`badge ${isTrtInstalled ? "badge--success" : "badge--warning"}`}>
                {isTrtInstalled ? dict.settings.upscaling.statusInstalled : dict.settings.upscaling.statusNotInstalled}
              </span>
              {status?.gpu_info?.supports_tensorrt && (
                <span className="badge badge--success">
                  {dict.settings.upscaling.recommended}
                </span>
              )}
            </div>
            {settings.backend === "TensorRT" && (
              <CheckCircle2 size={16} color="var(--accent-text, var(--accent))" />
            )}
          </div>
          <p
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--text-muted)",
              lineHeight: 1.3,
            }}
            >
            {dict.settings.upscaling.trtDesc}
          </p>
        </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
