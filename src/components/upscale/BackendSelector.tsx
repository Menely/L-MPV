import { SectionHeader } from "../settings/components/SettingBlocks";
import React, { useState, useId } from "react";
import {
  Cpu,
  FolderOpen,
  Download,
  Trash2,
  RefreshCw,
  Check,
  ChevronDown,
  X,
  Circle,
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

/**
 * Карточка выбора и настройки движков инференса нейросетей (DirectML / TensorRT).
 * Оформлена по единым стандартам дизайн-системы Liquid Glass:
 * - Выверенные кнопки действий 28px.
 * - Абсолютно симметричные интерактивные плитки бэкендов с ровной структурой строк.
 * - Чистые бейджи статуса без рамок и чёткие радио-индикаторы выбора.
 */
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
  const backendContentId = useId();

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
        aria-controls={backendContentId}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
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
          gap: "var(--space-4)",
          cursor: "pointer",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionHeader
            icon={<Cpu size={16} />}
            title={dict.settings.upscaling.backendTitle}
            desc={dict.settings.upscaling.backendDesc}
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn--secondary btn--icon"
            onClick={(event) => {
              event.stopPropagation();
              setIsOpen((prev) => !prev);
            }}
            aria-expanded={isOpen}
            aria-controls={backendContentId}
            style={{ width: 28, height: 28, minWidth: 28, padding: 0 }}
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
            style={{ width: 28, height: 28, minWidth: 28, padding: 0 }}
          >
            <FolderOpen size={15} />
          </button>

          {isCurrentBackendInstalled ? (
            <span
              title={dict.settings.upscaling.badgeInstalledTitle}
              aria-label={dict.settings.upscaling.statusInstalled}
              style={{
                width: 28,
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius-control, 7px)",
                color: "var(--success-text)",
                background: "rgba(46, 204, 113, 0.16)",
                border: "none",
                flexShrink: 0,
              }}
            >
              <Check size={16} strokeWidth={2.5} />
            </span>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={(event) => {
                event.stopPropagation();
                onDownloadEngine();
              }}
              disabled={
                !!status?.player_update_required ||
                isDownloadingEngine ||
                (downloadProgress !== null && !downloadProgress.is_finished)
              }
              title={dict.settings.upscaling.btnDownloadLibsTitle}
              style={{ minWidth: 140, height: 28, padding: "0 12px", fontSize: "var(--fs-xs)" }}
            >
              {isDownloadingEngine || (downloadProgress !== null && !downloadProgress.is_finished) ? (
                <RefreshCw size={14} className="refresh-morph-icon--spinning" />
              ) : (
                <Download size={14} />
              )}
              <span>
                {isDownloadingEngine || (downloadProgress !== null && !downloadProgress.is_finished)
                  ? dict.settings.upscaling.downloadingProgress(activePercent)
                  : needsUpdate
                  ? dict.settings.upscaling.btnUpdateEngine
                  : dict.settings.upscaling.btnDownloadEngine}
              </span>
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
              style={{ width: 28, height: 28, minWidth: 28, padding: 0 }}
            >
              {isDeletingEngine ? (
                <RefreshCw size={14} className="refresh-morph-icon--spinning" />
              ) : (
                <Trash2 size={14} />
              )}
            </button>
          )}
        </div>
      </div>

      {(needsUpdate || status?.player_update_required) && (
        <div
          role="status"
          className="upscale-compatibility-notice"
          style={{
            color: "var(--warning-text)",
            fontSize: "var(--fs-xs)",
            lineHeight: 1.5,
            padding: "8px 12px",
            borderRadius: "var(--radius-control, 7px)",
            background: "rgba(241, 196, 15, 0.1)",
            border: "none",
          }}
        >
          <p>{status?.player_update_required ? dict.settings.upscaling.playerUpdateRequired : dict.settings.upscaling.runtimeUpdateRequired}</p>
          {!status?.player_update_required && status?.runtime_restart_required && (
            <p style={{ marginTop: 4 }}>{dict.settings.upscaling.runtimeRestartRequired}</p>
          )}
        </div>
      )}

      <div
        id={backendContentId}
        className={`collapse-fold ${isOpen ? "collapse-fold--open" : ""}`}
        inert={!isOpen}
        aria-hidden={!isOpen}
      >
        <div className="collapse-fold__inner">
          <div className="collapse-fold__body backend-selector-content col col-gap-4">
            {/* Аппаратная карточка GPU */}
            <GpuHardwareCard gpuInfo={status?.gpu_info} />

            {/* Интерактивный прогресс-бар загрузки библиотек */}
            {showDownloadBar && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "var(--radius-card, 10px)",
                  background: isError
                    ? "var(--danger-surface)"
                    : isFinished
                    ? "var(--success-surface)"
                    : "var(--surface-level-2)",
                  border: `1px solid ${
                    isError
                      ? "var(--danger-border)"
                      : isFinished
                      ? "var(--success-border)"
                      : "var(--border-pill)"
                  }`,
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--space-4)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: "var(--fs-sm)",
                      color: "var(--text-primary)",
                      fontWeight: 500,
                      minWidth: 0,
                    }}
                  >
                    {isError ? (
                      <X size={15} color="var(--danger-text)" style={{ flexShrink: 0 }} />
                    ) : isFinished ? (
                      <Check size={15} strokeWidth={2.5} color="var(--success-text)" style={{ flexShrink: 0 }} />
                    ) : (
                      <RefreshCw
                        size={14}
                        className="refresh-morph-icon--spinning"
                        style={{ color: "var(--accent-text)", flexShrink: 0 }}
                      />
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
                      gap: "var(--space-3)",
                      fontSize: "var(--fs-sm)",
                      fontWeight: 700,
                      color: isError
                        ? "var(--danger-text)"
                        : isFinished
                        ? "var(--success-text)"
                        : "var(--accent-text)",
                      fontVariantNumeric: "tabular-nums",
                      flexShrink: 0,
                    }}
                  >
                    {downloadProgress && downloadProgress.total_bytes > 0 ? (
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
                    <span
                      className={`badge ${
                        isError ? "badge--danger" : isFinished ? "badge--success" : "badge--accent"
                      }`}
                      style={{ height: 22, fontSize: "var(--fs-xs)", border: "none" }}
                    >
                      {isError ? dict.settings.upscaling.errorLabel : `${activePercent}%`}
                    </span>
                  </div>
                </div>

                {/* Анимированный трек прогресс-бара */}
                <div
                  style={{
                    width: "100%",
                    height: 6,
                    background: "rgba(255, 255, 255, 0.08)",
                    borderRadius: "var(--radius-pill)",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      width: isError ? "100%" : `${activePercent}%`,
                      height: "100%",
                      background: isError
                        ? "var(--danger-text)"
                        : isFinished
                        ? "var(--success-text)"
                        : "var(--accent)",
                      borderRadius: "var(--radius-pill)",
                      transition: "width 0.25s ease-out",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Уведомление об успешной установке */}
            {engineSuccessMessage && !isDownloadingEngine && !showDownloadBar && (
              <div
                className="badge badge--success"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  height: "auto",
                  fontSize: "var(--fs-sm)",
                  borderRadius: "var(--radius-control, 7px)",
                  boxSizing: "border-box",
                  border: "none",
                }}
              >
                <Check size={15} strokeWidth={2.5} />
                <span>{engineSuccessMessage}</span>
              </div>
            )}

            {/* Сообщение об ошибке */}
            {errorMessage && !isDownloadingEngine && !isFinished && !engineSuccessMessage && (
              <div
                className="badge badge--danger"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  height: "auto",
                  fontSize: "var(--fs-sm)",
                  borderRadius: "var(--radius-control, 7px)",
                  boxSizing: "border-box",
                  border: "none",
                }}
              >
                <X size={15} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Выбор между DirectML и TensorRT: идеально выверенная сетка одинаковой высоты */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-4)",
                alignItems: "stretch",
              }}
            >
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
                style={{
                  padding: "12px 14px",
                  borderRadius: "var(--radius-card, 10px)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: 112,
                  boxSizing: "border-box",
                }}
              >
                <div>
                  {/* Верхний ряд: Заголовок слева, Радио-индикатор справа */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
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

                    <div style={{ color: "var(--accent-text)", flexShrink: 0 }}>
                      {settings.backend === "DirectML" ? (
                        <Check size={18} strokeWidth={2.5} />
                      ) : (
                        <Circle size={18} style={{ color: "var(--text-muted)", opacity: 0.35 }} />
                      )}
                    </div>
                  </div>

                  {/* Второй ряд: Бейджи статуса */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        height: 20,
                        padding: "0 7px",
                        fontSize: "var(--fs-2xs)",
                        fontWeight: 600,
                        borderRadius: "var(--radius-control, 7px)",
                        display: "inline-flex",
                        alignItems: "center",
                        background: isDmlInstalled
                          ? "rgba(46, 204, 113, 0.16)"
                          : "rgba(241, 196, 15, 0.14)",
                        color: isDmlInstalled
                          ? "var(--success-text)"
                          : "var(--warning-text)",
                        border: "none",
                        lineHeight: 1,
                      }}
                    >
                      {isDmlInstalled
                        ? dict.settings.upscaling.statusInstalled
                        : dict.settings.upscaling.statusNotInstalled}
                    </span>
                    {status?.gpu_info && !status.gpu_info.supports_tensorrt && (
                      <span
                        style={{
                          height: 20,
                          padding: "0 7px",
                          fontSize: "var(--fs-2xs)",
                          fontWeight: 600,
                          borderRadius: "var(--radius-control, 7px)",
                          display: "inline-flex",
                          alignItems: "center",
                          background: "var(--surface-accent-subtle)",
                          color: "var(--accent-text)",
                          border: "none",
                          lineHeight: 1,
                        }}
                      >
                        {dict.settings.upscaling.recommended}
                      </span>
                    )}
                  </div>
                </div>

                {/* Третий ряд: Описание */}
                <p
                  style={{
                    fontSize: "var(--fs-xs)",
                    color: "var(--text-secondary)",
                    lineHeight: 1.4,
                    margin: 0,
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
                  borderRadius: "var(--radius-card, 10px)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: 112,
                  boxSizing: "border-box",
                  cursor:
                    status?.gpu_info && !status.gpu_info.supports_tensorrt
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    status?.gpu_info && !status.gpu_info.supports_tensorrt ? 0.55 : 1,
                }}
              >
                <div>
                  {/* Верхний ряд: Заголовок слева, Радио-индикатор справа */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
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

                    <div style={{ color: "var(--accent-text)", flexShrink: 0 }}>
                      {settings.backend === "TensorRT" ? (
                        <Check size={18} strokeWidth={2.5} />
                      ) : (
                        <Circle size={18} style={{ color: "var(--text-muted)", opacity: 0.35 }} />
                      )}
                    </div>
                  </div>

                  {/* Второй ряд: Бейджи статуса */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        height: 20,
                        padding: "0 7px",
                        fontSize: "var(--fs-2xs)",
                        fontWeight: 600,
                        borderRadius: "var(--radius-control, 7px)",
                        display: "inline-flex",
                        alignItems: "center",
                        background: isTrtInstalled
                          ? "rgba(46, 204, 113, 0.16)"
                          : "rgba(241, 196, 15, 0.14)",
                        color: isTrtInstalled
                          ? "var(--success-text)"
                          : "var(--warning-text)",
                        border: "none",
                        lineHeight: 1,
                      }}
                    >
                      {isTrtInstalled
                        ? dict.settings.upscaling.statusInstalled
                        : dict.settings.upscaling.statusNotInstalled}
                    </span>
                    {status?.gpu_info?.supports_tensorrt && (
                      <span
                        style={{
                          height: 20,
                          padding: "0 7px",
                          fontSize: "var(--fs-2xs)",
                          fontWeight: 600,
                          borderRadius: "var(--radius-control, 7px)",
                          display: "inline-flex",
                          alignItems: "center",
                          background: "rgba(46, 204, 113, 0.16)",
                          color: "var(--success-text)",
                          border: "none",
                          lineHeight: 1,
                        }}
                      >
                        {dict.settings.upscaling.recommended}
                      </span>
                    )}
                  </div>
                </div>

                {/* Третий ряд: Описание */}
                <p
                  style={{
                    fontSize: "var(--fs-xs)",
                    color: "var(--text-secondary)",
                    lineHeight: 1.4,
                    margin: 0,
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
