import React from "react";
import { Download, Loader2, RotateCw } from "lucide-react";
import { TrackLiquidProgressFill } from "../../player/controls/track-popover/TrackDownloadVisuals";
import { formatBytes } from "./updateTypes";
import type { TranslationDict } from "../../../i18n/types";

interface UpdateActionButtonsProps {
  isUpgrade: boolean;
  isDowngrade: boolean;
  isDownloading: boolean;
  isReady: boolean;
  targetVersion: string;
  isCapsule: boolean;
  onPostpone: () => void;
  onInstall: () => void;
  onRestart: () => void;
  onMinimizeToWatch: () => void;
  onClose: () => void;
  dict: TranslationDict;
}

/**
 * Кнопки действий в футере окна обновлений.
 */
export const UpdateActionButtons: React.FC<UpdateActionButtonsProps> = React.memo(({
  isUpgrade,
  isDowngrade,
  isDownloading,
  isReady,
  targetVersion,
  isCapsule,
  onPostpone,
  onInstall,
  onRestart,
  onMinimizeToWatch,
  onClose,
  dict,
}) => {
  const primaryClass = isCapsule
    ? "update-card__btn update-card__btn--primary"
    : "update-modal-btn update-modal-btn--primary";
  const secondaryClass = isCapsule
    ? "update-card__btn update-card__btn--secondary"
    : "update-modal-btn update-modal-btn--secondary";

  if (isReady) {
    return (
      <>
        <button
          type="button"
          onClick={onMinimizeToWatch}
          className={secondaryClass}
        >
          {dict.updateModal.toastLater}
        </button>
        <button
          type="button"
          onClick={onRestart}
          className={primaryClass}
        >
          <RotateCw size={14} />
          <span className="nowrap">{dict.updateModal.toastRestart}</span>
        </button>
      </>
    );
  }

  if (isDownloading) {
    return (
      <button
        type="button"
        onClick={onMinimizeToWatch}
        className={secondaryClass}
      >
        <Loader2 size={14} className="animate-spin" />
        <span className="nowrap">{dict.updateModal.toastMinimizeToWatch}</span>
      </button>
    );
  }

  if (isUpgrade) {
    return (
      <>
        <button
          type="button"
          onClick={onPostpone}
          className={secondaryClass}
        >
          {dict.updateModal.remindLater}
        </button>

        <button
          type="button"
          onClick={onInstall}
          className={primaryClass}
        >
          <Download size={14} />
          <span className="nowrap">
            {dict.updateModal.updateTo(targetVersion)}
          </span>
        </button>
      </>
    );
  }

  if (isDowngrade) {
    return (
      <button
        type="button"
        onClick={onInstall}
        className={primaryClass}
      >
        <Download size={14} />
        <span className="nowrap">
          {dict.updateModal.rollbackTo(targetVersion)}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClose}
      className={primaryClass}
    >
      <span className="nowrap">{dict.updateModal.gotIt}</span>
    </button>
  );
});

UpdateActionButtons.displayName = "UpdateActionButtons";

interface DownloadProgressProps {
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  isDone: boolean;
  locale: string;
  dict: TranslationDict;
}

/**
 * Прогресс скачивания обновления с анимацией и байтовой шкалой.
 */
export const DownloadProgressBar: React.FC<DownloadProgressProps> = React.memo(({
  progress,
  downloadedBytes,
  totalBytes,
  isDone,
  locale,
  dict,
}) => {
  const effectivePct = isDone
    ? 100
    : totalBytes > 0
    ? Math.min(100, Math.max(0, progress))
    : downloadedBytes > 0
    ? 100
    : 0;

  return (
    <div style={{ flexShrink: 0, marginBottom: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "var(--fs-sm)",
          color: "var(--text-secondary, #d1d5db)",
          marginBottom: "var(--space-3)",
        }}
      >
        <span>
          {isDone
            ? dict.updateModal.toastReadyTitle
            : dict.updateModal.downloading}
        </span>
        {(totalBytes > 0 || downloadedBytes > 0) && (
          <span style={{ color: "var(--text-muted, #9ca3af)" }}>
            {totalBytes > 0
              ? `${formatBytes(downloadedBytes, locale)} / ${formatBytes(totalBytes, locale)}`
              : formatBytes(downloadedBytes, locale)}
          </span>
        )}
      </div>

      <div
        className="update-modal__progress-track"
        style={{
          width: "100%",
          height: 28,
          borderRadius: "var(--radius-control, 8px)",
          background: "rgba(255, 255, 255, 0.06)",
          overflow: "hidden",
          position: "relative",
          display: "flex",
          alignItems: "center",
          border: "none",
          transition: "border-radius var(--t-spring) var(--ease-spring-smooth)",
        }}
      >
        <TrackLiquidProgressFill
          progress={effectivePct}
          status={isDone ? "completed" : "running"}
          className="track-liquid-fill--vivid"
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 12px",
            boxSizing: "border-box",
          }}
        >
          <span
            style={{
              fontVariantNumeric: "tabular-nums",
              fontSize: "var(--fs-xs, 12px)",
              fontWeight: 700,
              color: "#ffffff",
              textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
            }}
          >
            {Math.round(effectivePct)}%
          </span>
        </div>
      </div>

      <p
        style={{
          fontSize: "var(--fs-xs)",
          color: "var(--text-muted, #9ca3af)",
          marginTop: "var(--space-2)",
          marginBottom: "var(--space-0)",
          textAlign: "center",
        }}
      >
        {isDone ? dict.updateModal.toastReadyHint : dict.updateModal.toastMinimizeToWatch}
      </p>
    </div>
  );
});

DownloadProgressBar.displayName = "DownloadProgressBar";
