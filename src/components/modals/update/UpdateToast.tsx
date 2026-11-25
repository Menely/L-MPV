import React, { useState, useEffect } from "react";
import { X, AlertCircle, Loader2, RotateCw } from "lucide-react";
import { useSurfaceDismiss } from "../../motion/useSurfaceDismiss";
import { MotionSurface } from "../../motion/MotionSurface";
import { useTranslation } from "../../../i18n/LanguageContext";
import {
  ControlBarStyle,
  getSavedControlBarStyle,
} from "../../../utils/controlBarStyleUtils";
import type { AppUpdaterController } from "../../../hooks/useAppUpdater";
import { AppLogoIcon } from "./AppLogoIcon";
import { UpdateInfo, formatBytes, normalizeVersion } from "./updateTypes";

interface UpdateToastProps {
  updateInfo: UpdateInfo;
  updater: AppUpdaterController;
  onOpenModal: () => void;
  onClose: () => void;
}

/**
 * Компактное всплывающее окно автообновления в правом нижнем углу
 * (уведомление → фоновое скачивание на том же месте → готовность к перезапуску).
 * Поддерживает как классические стили, так и островной дизайн «Капсула».
 */
export const UpdateToast: React.FC<UpdateToastProps> = ({
  updateInfo,
  updater,
  onOpenModal,
  onClose,
}) => {
  const { dict, locale } = useTranslation();
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

  const handleDismiss = () => {
    if (updater.phase === "error") {
      updater.clearError();
    }
    onClose();
  };

  const { handleClose } = useSurfaceDismiss({
    onClose: handleDismiss,
    closeOnEscape: true,
  });

  const currentVersion = normalizeVersion(updateInfo.current_version);
  const targetVersion = normalizeVersion(
    updater.targetRelease?.latest_version || updateInfo.latest_version
  );
  const versionText = dict.updateModal.toastVersionArrow(
    currentVersion,
    targetVersion
  );

  const isDownloading = updater.phase === "downloading";
  const isReady = updater.phase === "ready" || updater.phase === "restarting";
  const isRestarting = updater.phase === "restarting";
  const isError = updater.phase === "error";

  const titleText = isDownloading
    ? dict.updateModal.toastDownloading
    : isReady
    ? dict.updateModal.toastReadyTitle
    : dict.updateModal.toastTitle;

  const hasKnownTotal = updater.totalBytes > 0;
  const progressRounded = hasKnownTotal ? Math.round(updater.progress) : 0;
  const progressBarWidth = hasKnownTotal
    ? updater.progress
    : updater.downloadedBytes > 0
    ? 100
    : 0;

  const headerInfoContent = (
    <div className="update-toast__title-group">
      <div className="update-toast__icon">
        <AppLogoIcon
          size={16}
          color="var(--accent-text)"
        />
      </div>
      <div className="update-toast__title-text">
        <div className="update-toast__title">{titleText}</div>
        <div className="update-toast__version">{versionText}</div>
      </div>
    </div>
  );

  const closeButton = (
    <button
      type="button"
      className="update-toast__close"
      onClick={handleClose}
      aria-label={dict.updateModal.toastClose}
    >
      <X size={15} />
    </button>
  );

  const bodyContent = isDownloading ? (
    <div className="update-toast__progress">
      <div className="update-toast__progress-meta">
        <span>
          {hasKnownTotal
            ? `${formatBytes(updater.downloadedBytes, locale)} / ${formatBytes(
                updater.totalBytes,
                locale
              )}`
            : updater.downloadedBytes > 0
            ? formatBytes(updater.downloadedBytes, locale)
            : dict.updateModal.downloading}
        </span>
        {hasKnownTotal && (
          <span className="update-toast__progress-pct">{progressRounded}%</span>
        )}
      </div>
      <div className="update-toast__progress-track">
        <div
          className="update-toast__progress-fill"
          style={{ width: `${progressBarWidth}%` }}
        />
      </div>
    </div>
  ) : isReady ? (
    <div className="update-toast__hint">{dict.updateModal.toastReadyHint}</div>
  ) : isError && updater.errorMessage ? (
    <div className="update-toast__error">
      <AlertCircle size={14} className="no-shrink" style={{ marginTop: 1 }} />
      <span>{updater.errorMessage}</span>
    </div>
  ) : null;

  const actionsContent = isDownloading ? (
    <div className="update-toast__actions update-toast__actions--single">
      <button
        type="button"
        className="update-toast__btn update-toast__btn--secondary"
        onClick={onOpenModal}
      >
        {dict.updateModal.toastChangelog}
      </button>
    </div>
  ) : isReady ? (
    <div className="update-toast__actions">
      <button
        type="button"
        className="update-toast__btn update-toast__btn--secondary"
        onClick={handleClose}
        disabled={isRestarting}
      >
        {dict.updateModal.toastLater}
      </button>
      <button
        type="button"
        className="update-toast__btn update-toast__btn--primary"
        onClick={() => void updater.restartToApply()}
        disabled={isRestarting}
      >
        {isRestarting ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <RotateCw size={13} />
        )}
        <span>{dict.updateModal.toastRestart}</span>
      </button>
    </div>
  ) : (
    <div className="update-toast__actions">
      <button
        type="button"
        className="update-toast__btn update-toast__btn--secondary"
        onClick={onOpenModal}
      >
        {dict.updateModal.toastChangelog}
      </button>
      <button
        type="button"
        className="update-toast__btn update-toast__btn--primary"
        onClick={() =>
          void updater.startBackgroundUpdate(updater.targetRelease || updateInfo)
        }
      >
        {dict.updateModal.toastQuickInstall}
      </button>
    </div>
  );

  if (isCapsule) {
    return (
      <MotionSurface kind="popover" className="update-toast update-toast--capsule">
        <div className="update-toast__capsule-header">
          <div className="update-toast__island update-toast__island--info">
            {headerInfoContent}
          </div>
          <div className="update-toast__island update-toast__island--close">
            {closeButton}
          </div>
        </div>

        {bodyContent && (
          <div className="update-toast__island update-toast__island--body">
            {bodyContent}
          </div>
        )}

        <div className="update-toast__island update-toast__island--actions">
          {actionsContent}
        </div>
      </MotionSurface>
    );
  }

  return (
    <MotionSurface kind="popover" className={`update-toast update-toast--${controlBarStyle}`}>
      <div className="update-toast__header">
        {headerInfoContent}
        {closeButton}
      </div>

      {bodyContent}
      {actionsContent}
    </MotionSurface>
  );
};
