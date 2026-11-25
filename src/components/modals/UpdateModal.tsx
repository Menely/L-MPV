import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  X,
  AlertCircle,
  Maximize2,
  Minimize2,
  ExternalLink,
} from "lucide-react";
import { useSurfaceDismiss } from "../motion/useSurfaceDismiss";
import { MotionSurface } from "../motion/MotionSurface";
import { MarkdownRenderer } from "../common/MarkdownRenderer";
import { useTranslation } from "../../i18n/LanguageContext";
import {
  ControlBarStyle,
  getSavedControlBarStyle,
} from "../../utils/controlBarStyleUtils";
import { notifyLiquidGlassAnimation } from "../../features/liquidGlass/LiquidGlassSync";
import type { AppUpdaterController } from "../../hooks/useAppUpdater";
import {
  AppLogoIcon,
  VersionPicker,
  UpdateActionButtons,
  DownloadProgressBar,
  UpdateToast,
  compareVersions,
  normalizeVersion,
  type UpdateInfo,
  type UpdateProgress,
} from "./update";

export { AppLogoIcon, UpdateToast };
export type { UpdateInfo };

interface UpdateModalProps {
  updateInfo: UpdateInfo;
  onClose: () => void;
  updater?: AppUpdaterController;
}

/**
 * Модальное окно уведомления о доступном обновлении, списке изменений и откате версий.
 */
export const UpdateModal: React.FC<UpdateModalProps> = ({
  updateInfo,
  onClose,
  updater,
}) => {
  const { dict, locale } = useTranslation();
  const [selectedRelease, setSelectedRelease] = useState<UpdateInfo>(updateInfo);
  const [releases, setReleases] = useState<UpdateInfo[]>([]);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [localDownloading, setLocalDownloading] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const [localDownloadedBytes, setLocalDownloadedBytes] = useState(0);
  const [localTotalBytes, setLocalTotalBytes] = useState(0);
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null);
  const [localDone, setLocalDone] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() =>
    getSavedControlBarStyle()
  );
  const isCapsule = controlBarStyle === "capsule";

  useEffect(() => {
    const syncStyle = () => setControlBarStyle(getSavedControlBarStyle());
    window.addEventListener("l-mpv-settings-changed", syncStyle);
    window.addEventListener("l-mpv-control-bar-style-changed", syncStyle);
    window.addEventListener("l-mpv-player-theme-changed", syncStyle);
    window.addEventListener("storage", syncStyle);
    return () => {
      window.removeEventListener("l-mpv-settings-changed", syncStyle);
      window.removeEventListener("l-mpv-control-bar-style-changed", syncStyle);
      window.removeEventListener("l-mpv-player-theme-changed", syncStyle);
      window.removeEventListener("storage", syncStyle);
    };
  }, []);

  useEffect(() => {
    notifyLiquidGlassAnimation(360);
  }, [isExpanded, controlBarStyle]);

  const currentVersion = normalizeVersion(updateInfo.current_version);
  const targetVersion = normalizeVersion(selectedRelease.latest_version);
  const stagedVersionClean = updater
    ? normalizeVersion(updater.stagedVersion || updater.targetRelease?.latest_version || "")
    : targetVersion;

  const isDownloading = updater ? updater.phase === "downloading" : localDownloading;
  const isGlobalReady = updater
    ? updater.phase === "ready" || updater.phase === "restarting"
    : localDone;
  const isReadyForSelected =
    isGlobalReady && stagedVersionClean !== "" && stagedVersionClean === targetVersion;

  const progress = updater ? updater.progress : localProgress;
  const downloadedBytes = updater ? updater.downloadedBytes : localDownloadedBytes;
  const totalBytes = updater ? updater.totalBytes : localTotalBytes;
  const errorMessage = updater ? updater.errorMessage : localErrorMessage;

  useEffect(() => {
    setSelectedRelease(updater?.targetRelease || updateInfo);
  }, [updateInfo, updater?.targetRelease]);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingReleases(true);
    invoke<UpdateInfo[]>("get_available_releases")
      .then((list) => {
        if (isMounted && Array.isArray(list) && list.length > 0) {
          setReleases(list);
        }
      })
      .catch((err) => {
        console.warn("Не удалось загрузить историю релизов:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingReleases(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [isPickerOpen]);

  useEffect(() => {
    if (updater) return;
    let disposed = false;
    const unlistenPromise = listen<UpdateProgress>(
      "update-download-progress",
      (event) => {
        if (disposed) return;
        setLocalProgress(Math.min(100, Math.max(0, event.payload.percentage)));
        setLocalDownloadedBytes(event.payload.downloaded);
        setLocalTotalBytes(event.payload.total);
      }
    );

    return () => {
      disposed = true;
      unlistenPromise.then((unlisten) => unlisten && unlisten()).catch(() => {});
    };
  }, [updater]);

  const versionDiff = compareVersions(targetVersion, currentVersion);
  const isUpgrade = versionDiff > 0;
  const isDowngrade = versionDiff < 0;

  const releasePageUrl =
    selectedRelease.release_url && selectedRelease.release_url.trim()
      ? selectedRelease.release_url
      : `https://github.com/Menely/L-MPV/releases/tag/v${targetVersion}`;

  const handleInstall = async () => {
    if (updater) {
      await updater.startBackgroundUpdate(selectedRelease);
      return;
    }

    setLocalDownloading(true);
    setLocalErrorMessage(null);
    try {
      await invoke<string>("download_and_stage_update", {
        tag: selectedRelease.latest_version,
      });
      setLocalDownloading(false);
      setLocalDone(true);
      setLocalProgress(100);
    } catch (err: unknown) {
      console.error("Ошибка загрузки обновления L-MPV:", err);
      setLocalDownloading(false);
      setLocalErrorMessage(
        typeof err === "string"
          ? err
          : err instanceof Error
          ? err.message
          : dict.updateModal.downloadErrorFallback
      );
    }
  };

  const handleRestart = async () => {
    if (updater) {
      await updater.restartToApply();
      return;
    }
    try {
      await invoke("restart_and_apply_update");
    } catch (err: unknown) {
      setLocalErrorMessage(
        typeof err === "string"
          ? err
          : err instanceof Error
          ? err.message
          : dict.updateModal.downloadErrorFallback
      );
    }
  };

  const { handleClose } = useSurfaceDismiss({
    onClose,
    disabled: false,
    closeOnEscape: true,
  });

  const handlePostpone = () => {
    invoke("postpone_update").catch(console.error).finally(handleClose);
  };

  const handleSelectRelease = (rel: UpdateInfo) => {
    setSelectedRelease(rel);
    setIsPickerOpen(false);
  };

  const isVersionInfo = !isUpgrade && !isDowngrade;
  const titleText = isUpgrade
    ? dict.updateModal.titleUpgrade
    : isDowngrade
    ? dict.updateModal.titleDowngrade
    : dict.updateModal.titleInfo(currentVersion);

  const subtitleText = isUpgrade
    ? dict.updateModal.subtitleUpgrade(targetVersion)
    : isDowngrade
    ? dict.updateModal.subtitleDowngrade(currentVersion, targetVersion)
    : null;

  const changelogText = isUpgrade
    ? dict.updateModal.changelogUpgrade
    : isDowngrade
    ? dict.updateModal.changelogDowngrade(targetVersion)
    : dict.updateModal.changelogInfo;

  const showProgressArea = isDownloading || isReadyForSelected;

  const versionPickerNode = (
    <VersionPicker
      currentVersion={currentVersion}
      targetVersion={targetVersion}
      isUpgrade={isUpgrade}
      isDowngrade={isDowngrade}
      isLoadingReleases={isLoadingReleases}
      isPickerOpen={isPickerOpen}
      disabled={isDownloading}
      onTogglePicker={() => setIsPickerOpen((prev) => !prev)}
      releases={releases}
      locale={locale}
      onSelectRelease={handleSelectRelease}
      pickerRef={pickerRef}
      dict={dict}
    />
  );

  const actionButtonsNode = (
    <UpdateActionButtons
      isUpgrade={isUpgrade}
      isDowngrade={isDowngrade}
      isDownloading={isDownloading}
      isReady={isReadyForSelected}
      targetVersion={targetVersion}
      isCapsule={isCapsule}
      onPostpone={handlePostpone}
      onInstall={handleInstall}
      onRestart={handleRestart}
      onMinimizeToWatch={handleClose}
      onClose={handleClose}
      dict={dict}
    />
  );

  return (
    <MotionSurface
      kind="backdrop"
      className="modal-overlay update-modal-overlay"
      onClick={handleClose}
      style={{
        zIndex: "var(--z-modal)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {!isCapsule ? (
        <MotionSurface
          kind="dialog"
          className={`modal-container update-modal-card update-modal--${controlBarStyle}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-modal-title"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: isExpanded ? "820px" : "480px",
            maxWidth: "min(94vw, calc(100vw / var(--ui-scale, 1) - 24px))",
            height: isExpanded ? "100%" : "min(440px, 100%)",
            maxHeight: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            color: "var(--text, #fff)",
            transition:
              "width 0.3s cubic-bezier(0.16, 1, 0.3, 1), height 0.3s cubic-bezier(0.16, 1, 0.3, 1), border-radius var(--t-spring) var(--ease-spring-smooth)",
          }}
        >
          <div
            className="modal__header update-modal-heading"
            onDoubleClick={() => setIsExpanded((prev) => !prev)}
            style={{
              gap: 12,
              cursor: "default",
              userSelect: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                  flexShrink: 0,
                }}
              >
                <AppLogoIcon size={20} color="var(--accent-text, var(--accent))" />
              </div>
              <div style={{ minWidth: 0 }}>
                <h3
                  id="update-modal-title"
                  className="modal__title"
                  style={{ margin: "var(--space-0)" }}
                >
                  {titleText}
                </h3>
                {subtitleText && (
                  <p style={{ margin: "2px 0 0", fontSize: "var(--fs-xs)", color: "var(--text-muted, #9ca3af)" }}>
                    {subtitleText}
                  </p>
                )}
              </div>
            </div>

            <div className="row-center update-modal-window-actions">
              <button
                onClick={() => setIsExpanded((prev) => !prev)}
                className="modal__close"
                aria-label={isExpanded ? dict.updateModal.ariaRestore : dict.updateModal.ariaMaximize}
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                onClick={handleClose}
                className="modal__close"
                aria-label={dict.updateModal.ariaClose}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div
            className="update-modal-content"
            style={{
              paddingBlock: "16px 14px",
              flex: 1,
              overflow: "hidden",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                marginBottom: errorMessage || showProgressArea ? 14 : 0,
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minHeight: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-4)",
                  marginBottom: "var(--space-4)",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    fontSize: "var(--fs-sm)",
                    fontWeight: 600,
                    color: "var(--text-secondary, #d1d5db)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {changelogText}
                </div>
                <button
                  type="button"
                  onClick={() => openUrl(releasePageUrl).catch(console.error)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    background: "transparent",
                    border: "1px solid transparent",
                    borderRadius: "var(--radius-control, 8px)",
                    padding: "4px 10px",
                    fontSize: "var(--fs-xs)",
                    color: "var(--accent-text)",
                    cursor: "pointer",
                    transition:
                      "background-color var(--t-fast) var(--ease-smooth), border-color var(--t-fast) var(--ease-smooth), color var(--t-fast) var(--ease-smooth), filter var(--t-fast) var(--ease-smooth)",
                  }}
                  className="hover-bright"
                >
                  <ExternalLink size={12} />
                  <span>{dict.updateModal.openGithub}</span>
                </button>
              </div>
              <div
                className="custom-scrollbar update-modal-notes-wrap"
                style={{
                  padding: isExpanded ? "14px 18px" : "12px 14px",
                }}
              >
                <MarkdownRenderer content={selectedRelease.release_notes} />
              </div>
            </div>

            {errorMessage && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-5)",
                  padding: "10px 14px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "var(--radius-sm)",
                  color: "#fca5a5",
                  fontSize: "var(--fs-sm)",
                  marginBottom: "var(--space-7)",
                  transition: "border-radius var(--t-spring) var(--ease-spring-smooth)",
                }}
              >
                <AlertCircle size={18} className="no-shrink" />
                <span>{errorMessage}</span>
              </div>
            )}

            {showProgressArea && (
              <DownloadProgressBar
                progress={progress}
                downloadedBytes={downloadedBytes}
                totalBytes={totalBytes}
                isDone={isReadyForSelected}
                locale={locale}
                dict={dict}
              />
            )}
          </div>

          <div
            className="update-modal-footer"
            style={{
              paddingBlock: "10px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              flexShrink: 0,
              position: "relative",
            }}
          >
            {versionPickerNode}
            <div className="update-modal-actions">{actionButtonsNode}</div>
          </div>
        </MotionSurface>
      ) : (
        <MotionSurface
          kind="dialog"
          className={`modal-container update-modal-capsule ${
            isExpanded ? "update-modal-capsule--expanded" : ""
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`update-capsule-header${isVersionInfo ? " update-capsule-header--compact" : ""}`}>
            <div className="update-card update-card--logo">
              <AppLogoIcon size={28} color="var(--accent-text, var(--accent))" />
            </div>

            <div
              className="update-card update-card--header-info"
              onDoubleClick={() => setIsExpanded((prev) => !prev)}
            >
              <div className="update-card__title-group">
                <h3 id="update-modal-title" className="update-card__title">
                  {titleText}
                </h3>
                {subtitleText && <p className="update-card__subtitle">{subtitleText}</p>}
              </div>
            </div>

            <div className="update-card update-card--header-actions">
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="update-card__action-btn"
                aria-label={isExpanded ? dict.updateModal.ariaRestore : dict.updateModal.ariaMaximize}
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="update-card__action-btn update-card__action-btn--close"
                aria-label={dict.updateModal.ariaClose}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="update-card update-card--body">
            <div className="update-card__body-header">
              <span className="update-card__body-title">{changelogText}</span>
              <button
                type="button"
                onClick={() => openUrl(releasePageUrl).catch(console.error)}
                className="update-card__github-btn"
              >
                <ExternalLink size={12} />
                <span>{dict.updateModal.openGithub}</span>
              </button>
            </div>

            <div className="update-card__notes-wrap">
              <MarkdownRenderer content={selectedRelease.release_notes} />
            </div>

            {errorMessage && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-4)",
                  padding: "10px 14px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "var(--radius-md)",
                  color: "#fca5a5",
                  fontSize: "var(--fs-xs)",
                  marginTop: "10px",
                }}
              >
                <AlertCircle size={16} className="no-shrink" />
                <span>{errorMessage}</span>
              </div>
            )}

            {showProgressArea && (
              <div style={{ marginTop: "12px" }}>
                <DownloadProgressBar
                  progress={progress}
                  downloadedBytes={downloadedBytes}
                  totalBytes={totalBytes}
                  isDone={isReadyForSelected}
                  locale={locale}
                  dict={dict}
                />
              </div>
            )}
          </div>

          <div className="update-card update-card--footer update-modal-footer">
            {versionPickerNode}
            <div className="update-card__actions update-modal-actions">
              {actionButtonsNode}
            </div>
          </div>
        </MotionSurface>
      )}
    </MotionSurface>
  );
};
