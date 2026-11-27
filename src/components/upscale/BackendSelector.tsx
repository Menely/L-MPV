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
} from "lucide-react";
import { SectionHeader } from "../settings/components/SettingBlocks";
import { UpscaleSettings, UpscaleStatus, DownloadProgressPayload } from "./types";
import { GpuHardwareCard } from "./GpuHardwareCard";
import { BackendOptionCard } from "./BackendOptionCard";
import { EngineDownloadProgress } from "./EngineDownloadProgress";
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

const ICON_BTN_STYLE: React.CSSProperties = {
  width: 28,
  height: 28,
  minWidth: 28,
  padding: 0,
};

const BANNER_BADGE_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  height: "auto",
  fontSize: "var(--fs-sm)",
  borderRadius: "var(--radius-control, 7px)",
  boxSizing: "border-box",
  border: "none",
};

/**
 * Карточка выбора и настройки движков инференса нейросетей (DirectML / TensorRT).
 * Декомпозирована на модульные подкомпоненты `GpuHardwareCard`, `EngineDownloadProgress` и `BackendOptionCard`.
 */
export const BackendSelector: React.FC<BackendSelectorProps> = React.memo(({
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
  const isActivelyDownloading =
    isDownloadingEngine || (downloadProgress !== null && !downloadProgress.is_finished);
  const showDownloadBar = isDownloadingEngine || downloadProgress !== null;

  const activePercent = isFinished
    ? 100
    : Math.min(100, Math.max(0, Math.round(downloadProgress?.percent || 0)));

  const toggleLabel = isOpen
    ? dict.settings.upscaling.btnCollapseEngines
    : dict.settings.upscaling.btnExpandEngines;

  const trtUnsupported = Boolean(status?.gpu_info && !status.gpu_info.supports_tensorrt);

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
            title={toggleLabel}
            aria-label={toggleLabel}
            aria-expanded={isOpen}
            aria-controls={backendContentId}
            style={ICON_BTN_STYLE}
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
            aria-label={dict.settings.upscaling.backendOpenFolderTitle}
            style={ICON_BTN_STYLE}
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
              disabled={!!status?.player_update_required || isActivelyDownloading}
              title={dict.settings.upscaling.btnDownloadLibsTitle}
              style={{ minWidth: 140, height: 28, padding: "0 12px", fontSize: "var(--fs-xs)" }}
            >
              {isActivelyDownloading ? (
                <RefreshCw size={14} className="refresh-morph-icon--spinning" />
              ) : (
                <Download size={14} />
              )}
              <span>
                {isActivelyDownloading
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
              style={ICON_BTN_STYLE}
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
          <p>
            {status?.player_update_required
              ? dict.settings.upscaling.playerUpdateRequired
              : dict.settings.upscaling.runtimeUpdateRequired}
          </p>
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
            <GpuHardwareCard gpuInfo={status?.gpu_info} />

            {showDownloadBar && (
              <EngineDownloadProgress
                downloadProgress={downloadProgress}
                downloadProgressText={downloadProgressText}
                activePercent={activePercent}
                isFinished={isFinished}
                isError={isError}
              />
            )}

            {engineSuccessMessage && !isDownloadingEngine && !showDownloadBar && (
              <div className="badge badge--success" style={BANNER_BADGE_STYLE}>
                <Check size={15} strokeWidth={2.5} />
                <span>{engineSuccessMessage}</span>
              </div>
            )}

            {errorMessage && !isDownloadingEngine && !isFinished && !engineSuccessMessage && (
              <div className="badge badge--danger" style={BANNER_BADGE_STYLE}>
                <X size={15} />
                <span>{errorMessage}</span>
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-4)",
                alignItems: "stretch",
              }}
            >
              <BackendOptionCard
                title="DirectML"
                description={dict.settings.upscaling.dmlDesc}
                isSelected={settings.backend === "DirectML"}
                isInstalled={isDmlInstalled}
                isRecommended={trtUnsupported}
                recommendedVariant="accent"
                statusText={
                  isDmlInstalled
                    ? dict.settings.upscaling.statusInstalled
                    : dict.settings.upscaling.statusNotInstalled
                }
                recommendedText={dict.settings.upscaling.recommended}
                onSelect={() => {
                  if (settings.backend !== "DirectML") {
                    onSelectBackend("DirectML");
                  }
                }}
              />

              <BackendOptionCard
                title="TensorRT (NVIDIA)"
                description={dict.settings.upscaling.trtDesc}
                isSelected={settings.backend === "TensorRT"}
                isInstalled={isTrtInstalled}
                isRecommended={Boolean(status?.gpu_info?.supports_tensorrt)}
                recommendedVariant="success"
                disabled={trtUnsupported}
                statusText={
                  isTrtInstalled
                    ? dict.settings.upscaling.statusInstalled
                    : dict.settings.upscaling.statusNotInstalled
                }
                recommendedText={dict.settings.upscaling.recommended}
                onSelect={() => {
                  if (trtUnsupported) {
                    onError(dict.settings.upscaling.trtNotSupported);
                    return;
                  }
                  if (settings.backend !== "TensorRT") {
                    onSelectBackend("TensorRT");
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

BackendSelector.displayName = "BackendSelector";
