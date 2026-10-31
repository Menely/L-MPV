import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useOverlayDismiss } from "../../hooks/useOverlayDismiss";
import {
  Download,
  Loader2,
  X,
  AlertCircle,
  ArrowRight,
  Maximize2,
  Minimize2,
  ExternalLink,
  ChevronDown,
  Check,
} from "lucide-react";
import { MarkdownRenderer } from "../common/MarkdownRenderer";
import { useTranslation } from "../../i18n/LanguageContext";
import {
  ControlBarStyle,
  getSavedControlBarStyle,
} from "../../utils/controlBarStyleUtils";

/**
 * Иконка-логотип плеера L-MPV (векторный SVG).
 */
export const AppLogoIcon: React.FC<{ size?: number; color?: string; className?: string }> = ({
  size = 22,
  color = "#ffffff",
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 603.87 546.58"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: "block", flexShrink: 0 }}
  >
    <path
      fill={color}
      d="M312.05,483.83l-79.01,48.13c-15.89,9.68-35.66,7.45-49.17-4.87-7.8-7.11-12.32-16.08-13.67-26.52s1.69-20.76,8.11-29.6c9.45-13.01,18.42-25.73,26.35-39.87,26.01-46.35,39.83-98.85,41.09-151.99.33-13.82,1.34-26.38,4.02-39.89,5.74-28.98,18.55-55.91,38.04-78.06,16.61-18.88,37.76-31.53,62.13-37.35,16.9-4.03,33.51-4.12,50.21.47,10.08,2.77,19.55,6.44,28.66,11.98l35.03,21.31,39.94,24.79,4.5,2.71,52.66,32.53c18.42,11.38,28.7,36.28,27.89,57.94-.63,16.77-5.82,33-16.69,45.75-5.55,6.51-12.06,11.43-19.48,15.96l-125.56,76.6-115.04,69.98ZM271.03,454.76l113.08-69.04,110.96-67.3,37.06-22.88c4.56-2.81,7.85-6.9,9.74-11.52,4.55-11.13-.07-23.93-10.32-30.21l-89.02-54.47-34.96-21.52c-9.59-5.91-19.93-10.02-31.47-10.46-13.96-.53-28.34,2.97-39.66,11.3-17.77,13.09-29.65,31.32-36.93,52.01-4.16,11.82-6.92,23.69-7.25,36.43-.77,29.08-3.18,57.43-9.2,85.76l-8.01,30.11c-8.82,28.21-20.62,54.66-35.49,80.17l-10.36,16.62,41.83-25.01ZM164.38,399.98c11.1-20.17,18.43-41.73,23.81-64.08,10.94-45.48,7.99-93.73-5.7-138.33-7.28-23.71-17.88-45.55-31.55-66.21-7.45-11.26-14.87-21.8-24.29-31.44-4.86-4.98-12.04-7.99-18.98-7.19-9.39,1.09-17.64,7.8-20.73,16.8-2.76,8.03-.63,17.35,5.12,23.59,32.25,35.04,53.32,82.77,56.57,130.39,2.79,40.79-6.12,80.43-26.01,115.88-8.63,15.37-18.54,29.24-30.5,42.02-5.9,6.3-6.91,14.68-4.13,22.34s8.8,13.52,16.4,15.35,16.04-.04,22.17-6.41c15.32-15.93,27.25-33.48,37.83-52.7ZM226.99,69.6l15.41,8.37,42.8,25.46,7.95,4.84c16.54-11.2,34.41-17.93,53.87-22.07l-6.85-3.93-70.46-42.87-34.1-20.94c-18.79-11.54-38.33-8.86-53.87,6.9-15.52,15.75-16.82,39.8-3.08,57.18,7.24,9.16,12.72,18.96,18.94,29.01,14.07,22.72,24.62,46.3,33.18,72.36,8.64-18.39,18.52-33.94,31.45-48.45l-35.25-65.83ZM59.59,381.21c13.35-14.95,24.07-31.81,30.19-51.01,6.96-21.81,10.15-43.68,8.03-66.42-1.89-20.25-7.27-39.28-16.09-57.73-7.66-16.02-18.06-30.06-30.56-42.57-4.84-4.84-11.47-7.61-18.36-6.89-11.05,1.16-20.06,10.23-21.32,21.18-.95,8.22,2.79,15.41,8.38,21.18,14.05,14.5,23.67,31.36,28.75,51.03,5.77,22.31,5.13,45.41-3.22,67.02-5.59,14.47-14.67,26.38-25.18,37.47-2.95,3.11-5.6,6.5-7.22,10.48-3.56,8.75-.47,19.1,6.33,25.16,6.96,6.2,17.24,7.97,25.98,3.29,5.9-3.16,10.06-7.46,14.29-12.2Z"
    />
  </svg>
);

/**
 * Данные об обновлении, возвращаемые из Tauri IPC.
 */
export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_notes: string;
  download_url: string;
  asset_name: string;
  published_at: string;
  release_url?: string;
}

/**
 * Прогресс скачивания обновления из события Rust.
 */
interface UpdateProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

interface UpdateModalProps {
  updateInfo: UpdateInfo;
  onClose: () => void;
}

/**
 * Сравнение двух semver-строк: возвращает 1 если v1 > v2, -1 если v1 < v2, 0 если равны.
 */
function compareVersions(v1: string, v2: string): number {
  const parse = (s: string) =>
    s.replace(/^[vV]/, "").split(".").map((p) => parseInt(p, 10) || 0);
  const p1 = parse(v1);
  const p2 = parse(v2);
  const max = Math.max(p1.length, p2.length);
  for (let i = 0; i < max; i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

/**
 * Форматирование байтов в читаемый вид (КБ / МБ).
 */
function formatBytes(bytes: number, locale: string = "ru"): string {
  if (bytes <= 0) return locale === "en" ? "0 B" : "0 Б";
  const units = locale === "en" ? ["B", "KB", "MB", "GB"] : ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Выпадающий список выбора целевой версии релиза (Upgrade / Downgrade).
 */
interface VersionPickerProps {
  currentVersion: string;
  targetVersion: string;
  isUpgrade: boolean;
  isDowngrade: boolean;
  isLoadingReleases: boolean;
  isPickerOpen: boolean;
  onTogglePicker: () => void;
  releases: UpdateInfo[];
  locale: string;
  onSelectRelease: (rel: UpdateInfo) => void;
  pickerRef: React.RefObject<HTMLDivElement | null>;
  dict: any;
}

const VersionPicker: React.FC<VersionPickerProps> = React.memo(({
  currentVersion,
  targetVersion,
  isUpgrade,
  isDowngrade,
  isLoadingReleases,
  isPickerOpen,
  onTogglePicker,
  releases,
  locale,
  onSelectRelease,
  pickerRef,
  dict,
}) => (
  <div className="version-picker-wrap" ref={pickerRef}>
    <button
      type="button"
      onClick={onTogglePicker}
      className={`version-picker-trigger ${isDowngrade ? "version-picker-trigger--downgrade" : ""}`}
    >
      {isDowngrade || isUpgrade ? (
        <>
          <span>{currentVersion}</span>
          <ArrowRight size={12} style={{ opacity: 0.8 }} />
          <span>{targetVersion}</span>
        </>
      ) : (
        <span>v{currentVersion}</span>
      )}
      <ChevronDown
        size={13}
        style={{
          transform: isPickerOpen ? "rotate(180deg)" : "none",
          transition: "transform 0.15s ease",
          opacity: 0.85,
        }}
      />
    </button>

    {isPickerOpen && (
      <div className="version-picker-popover custom-scrollbar" role="menu">
        <div className="version-picker-header">
          {isLoadingReleases
            ? dict.updateModal.loadingReleases
            : dict.updateModal.availableReleases(releases.length)}
        </div>
        {releases.length === 0 && !isLoadingReleases ? (
          <div style={{ padding: "8px 10px", fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontStyle: "italic" }}>
            {dict.updateModal.releasesUnavailable}
          </div>
        ) : (
          releases.map((rel) => {
            const cleanRelVer = rel.latest_version.replace(/^[vV]/, "");
            const isRelCurrent = cleanRelVer === currentVersion;
            const isRelSelected = cleanRelVer === targetVersion;
            return (
              <div
                key={rel.latest_version}
                onClick={() => onSelectRelease(rel)}
                className={`version-picker-item ${isRelSelected ? "version-picker-item--active" : ""}`}
                role="menuitem"
                tabIndex={0}
              >
                <div className="row-center row-gap-3">
                  <span className="version-picker-item__tag">v{cleanRelVer}</span>
                  {isRelCurrent && (
                    <span className="version-picker-badge version-picker-badge--current">
                      {dict.updateModal.currentBadge}
                    </span>
                  )}
                </div>
                <div className="version-picker-item__meta">
                  {rel.published_at && (
                    <span>{new Date(rel.published_at).toLocaleDateString(locale === "en" ? "en-US" : "ru-RU")}</span>
                  )}
                  {isRelSelected && <Check size={13} color="var(--accent, #60a5fa)" />}
                </div>
              </div>
            );
          })
        )}
      </div>
    )}
  </div>
));

/**
 * Компонент кнопок действий в футере окна обновлений.
 */
interface UpdateActionButtonsProps {
  isUpgrade: boolean;
  isDowngrade: boolean;
  isDownloading: boolean;
  isDone: boolean;
  targetVersion: string;
  isCapsule: boolean;
  onPostpone: () => void;
  onInstall: () => void;
  onClose: () => void;
  dict: any;
}

const UpdateActionButtons: React.FC<UpdateActionButtonsProps> = React.memo(({
  isUpgrade,
  isDowngrade,
  isDownloading,
  isDone,
  targetVersion,
  isCapsule,
  onPostpone,
  onInstall,
  onClose,
  dict,
}) => {
  const primaryClass = isCapsule
    ? "update-card__btn update-card__btn--primary"
    : "update-modal-btn update-modal-btn--primary";
  const secondaryClass = isCapsule
    ? "update-card__btn update-card__btn--secondary"
    : "update-modal-btn update-modal-btn--secondary";

  if (isUpgrade) {
    return (
      <>
        {!isDownloading && (
          <button
            type="button"
            onClick={onPostpone}
            className={secondaryClass}
          >
            {dict.updateModal.remindLater}
          </button>
        )}

        <button
          type="button"
          onClick={onInstall}
          disabled={isDownloading}
          className={primaryClass}
        >
          {isDownloading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span className="nowrap">
                {isDone ? dict.updateModal.installStarting : dict.updateModal.downloading}
              </span>
            </>
          ) : (
            <>
              <Download size={14} />
              <span className="nowrap">
                {dict.updateModal.updateTo(targetVersion)}
              </span>
            </>
          )}
        </button>
      </>
    );
  }

  if (isDowngrade) {
    return (
      <button
        type="button"
        onClick={onInstall}
        disabled={isDownloading}
        className={primaryClass}
      >
        {isDownloading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            <span className="nowrap">
              {isDone ? dict.updateModal.rollbackStarting : dict.updateModal.downloading}
            </span>
          </>
        ) : (
          <>
            <Download size={14} />
            <span className="nowrap">
              {dict.updateModal.rollbackTo(targetVersion)}
            </span>
          </>
        )}
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

/**
 * Прогресс скачивания обновления с анимацией и байтовой шкалой.
 */
interface DownloadProgressProps {
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  isDone: boolean;
  locale: string;
  dict: any;
}

const DownloadProgressBar: React.FC<DownloadProgressProps> = React.memo(({
  progress,
  downloadedBytes,
  totalBytes,
  isDone,
  locale,
  dict,
}) => (
  <div style={{ marginBottom: "var(--space-7)" }}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: "var(--fs-sm)",
        color: "var(--text-secondary, #d1d5db)",
        marginBottom: "var(--space-4)",
      }}
    >
      <span>
        {isDone ? dict.updateModal.installerStarting : dict.updateModal.downloadProgress(progress)}
      </span>
      {totalBytes > 0 && (
        <span style={{ color: "var(--text-muted, #9ca3af)" }}>
          {formatBytes(downloadedBytes, locale)} / {formatBytes(totalBytes, locale)}
        </span>
      )}
    </div>

    <div
      style={{
        width: "100%",
        height: 8,
        borderRadius: "var(--radius-xs)",
        background: "rgba(255, 255, 255, 0.08)",
        overflow: "hidden",
        position: "relative",
        transition: "border-radius var(--t-spring) var(--ease-spring-smooth)",
      }}
    >
      <div
        style={{
          width: `${progress}%`,
          height: "100%",
          background: "linear-gradient(90deg, var(--accent, #3b82f6) 0%, #60a5fa 100%)",
          borderRadius: "var(--radius-xs)",
          transition: "width 0.2s ease-out, border-radius var(--t-spring) var(--ease-spring-smooth)",
          boxShadow: "none",
        }}
      />
    </div>

    <p
      style={{
        fontSize: "var(--fs-xs)",
        color: "var(--text-muted, #9ca3af)",
        marginTop: "var(--space-4)",
        marginBottom: "var(--space-0)",
        textAlign: "center",
      }}
    >
      {dict.updateModal.restartHint}
    </p>
  </div>
));

/**
 * Модальное окно уведомления о доступном обновлении и его установки.
 */
export const UpdateModal: React.FC<UpdateModalProps> = ({ updateInfo, onClose }) => {
  const { dict, locale } = useTranslation();
  const [selectedRelease, setSelectedRelease] = useState<UpdateInfo>(updateInfo);
  const [releases, setReleases] = useState<UpdateInfo[]>([]);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [controlBarStyle] = useState<ControlBarStyle>(() => getSavedControlBarStyle());
  const isCapsule = controlBarStyle === "capsule";

  // Синхронизируем выбранный релиз при смене пропса updateInfo
  useEffect(() => {
    setSelectedRelease(updateInfo);
  }, [updateInfo]);

  // Загружаем список всех доступных релизов из GitHub через Rust IPC
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

  // Закрытие выпадающего списка при клике вне него
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

  const currentVersion = updateInfo.current_version.replace(/^[vV]/, "");
  const targetVersion = selectedRelease.latest_version.replace(/^[vV]/, "");
  const versionDiff = compareVersions(targetVersion, currentVersion);
  const isUpgrade = versionDiff > 0;
  const isDowngrade = versionDiff < 0;

  const releasePageUrl =
    selectedRelease.release_url && selectedRelease.release_url.trim()
      ? selectedRelease.release_url
      : `https://github.com/Menely/L-MPV/releases/tag/v${targetVersion}`;

  useEffect(() => {
    const unlistenPromise = listen<UpdateProgress>("update-download-progress", (event) => {
      setProgress(Math.min(100, Math.max(0, event.payload.percentage)));
      setDownloadedBytes(event.payload.downloaded);
      setTotalBytes(event.payload.total);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten && unlisten()).catch(() => {});
    };
  }, []);

  const handleInstall = async () => {
    setIsDownloading(true);
    setErrorMessage(null);

    try {
      await invoke("download_and_install_update", {
        downloadUrl: selectedRelease.download_url,
        assetName: selectedRelease.asset_name,
        tag: selectedRelease.latest_version,
      });
      setIsDone(true);
    } catch (err: any) {
      console.error("Ошибка установки L-MPV:", err);
      setIsDownloading(false);
      setErrorMessage(typeof err === "string" ? err : err?.message || dict.updateModal.downloadErrorFallback);
    }
  };

  const { isClosing, handleClose } = useOverlayDismiss({
    onClose,
    kind: "base",
    disabled: isDownloading && !errorMessage,
    closeOnEscape: true,
  });

  const handlePostpone = () => {
    invoke("postpone_update").catch(console.error).finally(handleClose);
  };

  const handleSelectRelease = (rel: UpdateInfo) => {
    setSelectedRelease(rel);
    setIsPickerOpen(false);
  };

  const titleText = isUpgrade
    ? dict.updateModal.titleUpgrade
    : isDowngrade
    ? dict.updateModal.titleDowngrade
    : dict.updateModal.titleInfo;

  const subtitleText = isUpgrade
    ? dict.updateModal.subtitleUpgrade(targetVersion)
    : isDowngrade
    ? dict.updateModal.subtitleDowngrade(currentVersion, targetVersion)
    : dict.updateModal.subtitleInfo(currentVersion);

  const changelogText = isUpgrade
    ? dict.updateModal.changelogUpgrade
    : isDowngrade
    ? dict.updateModal.changelogDowngrade(targetVersion)
    : dict.updateModal.changelogInfo;

  return (
    <div
      className={`modal-overlay ${isClosing ? "modal-overlay--closing" : ""}`}
      onClick={handleClose}
      style={{
        zIndex: "var(--z-modal)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.65)",
      }}
    >
      {!isCapsule ? (
        /* ─── КЛАССИЧЕСКИЙ РЕЖИМ (Модерн, Прикрепленный) ─── */
        <div
          className={`modal-container update-modal-card ${isClosing ? "update-modal-card--closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-modal-title"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: isExpanded ? "820px" : "480px",
            maxWidth: "94vw",
            height: isExpanded ? "78vh" : "420px",
            maxHeight: "92vh",
            display: "flex",
            flexDirection: "column",
            borderRadius: "var(--radius-surface)",
            background: "linear-gradient(180deg, rgba(26, 28, 35, 0.96) 0%, rgba(18, 19, 24, 0.98) 100%)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: isExpanded
              ? "0 25px 60px rgba(0, 0, 0, 0.75)"
              : "0 20px 50px rgba(0, 0, 0, 0.6)",
            overflow: "hidden",
            color: "var(--text, #fff)",
            animation: "updateModalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            transition: "width 0.3s cubic-bezier(0.16, 1, 0.3, 1), height 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease, border-radius var(--t-spring) var(--ease-spring-smooth)",
          }}
        >
          {/* Шапка модального окна */}
          <div
            onDoubleClick={() => setIsExpanded((prev) => !prev)}
            style={{
              padding: "20px 24px 16px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              cursor: "default",
              userSelect: "none",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "var(--radius-md)",
                  background: "rgba(var(--accent-rgb, 59, 130, 246), 0.12)",
                  border: "1px solid var(--border-pill, rgba(var(--accent-rgb, 59, 130, 246), 0.22))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "none",
                  flexShrink: 0,
                  transition: "border-radius var(--t-spring) var(--ease-spring-smooth)",
                }}
              >
                <AppLogoIcon size={24} color="var(--accent)" />
              </div>
              <div>
                <h3 id="update-modal-title" style={{ margin: "var(--space-0)", fontSize: "var(--fs-xl)", fontWeight: 700, letterSpacing: "-0.01em" }}>
                  {titleText}
                </h3>
                <p style={{ margin: "3px 0 0", fontSize: "var(--fs-sm)", color: "var(--text-muted, #9ca3af)" }}>
                  {subtitleText}
                </p>
              </div>
            </div>

            <div className="row-center row-gap-3">
              <button
                onClick={() => setIsExpanded((prev) => !prev)}
                className="modal__close"
                aria-label={isExpanded ? dict.updateModal.ariaRestore : dict.updateModal.ariaMaximize}
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>

              {!isDownloading && (
                <button
                  onClick={handleClose}
                  className="modal__close"
                  aria-label={dict.updateModal.ariaClose}
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Тело модального окна */}
          <div
            style={{
              padding: isExpanded ? "18px 26px 14px" : "16px 24px 14px",
              flex: 1,
              overflow: "hidden",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              transition: "padding 0.3s ease",
            }}
          >
            {/* Список изменений / Описание релиза */}
            <div
              style={{
                marginBottom: errorMessage || isDownloading ? 14 : 0,
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
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "var(--radius-control, 8px)",
                    padding: "4px 10px",
                    fontSize: "var(--fs-xs)",
                    color: "var(--accent, #60a5fa)",
                    cursor: "pointer",
                    transition: "all var(--t-fast) var(--ease-smooth)",
                  }}
                  className="hover-bright"
                >
                  <ExternalLink size={12} />
                  <span>{dict.updateModal.openGithub}</span>
                </button>
              </div>
              <div
                className="custom-scrollbar"
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  background: "rgba(0, 0, 0, 0.35)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "var(--radius-md, 12px)",
                  padding: isExpanded ? "14px 18px" : "12px 14px",
                  transition: "padding 0.3s ease, border-radius var(--t-spring) var(--ease-spring-smooth)",
                }}
              >
                <MarkdownRenderer content={selectedRelease.release_notes} />
              </div>
            </div>

            {/* Ошибка скачивания */}
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

            {/* Прогресс скачивания */}
            {isDownloading && (
              <DownloadProgressBar
                progress={progress}
                downloadedBytes={downloadedBytes}
                totalBytes={totalBytes}
                isDone={isDone}
                locale={locale}
                dict={dict}
              />
            )}
          </div>

          {/* Футер с версией приложения и кнопками */}
          <div
            style={{
              padding: "10px 22px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              background: "rgba(0, 0, 0, 0.2)",
              flexShrink: 0,
              position: "relative",
            }}
          >
            <VersionPicker
              currentVersion={currentVersion}
              targetVersion={targetVersion}
              isUpgrade={isUpgrade}
              isDowngrade={isDowngrade}
              isLoadingReleases={isLoadingReleases}
              isPickerOpen={isPickerOpen}
              onTogglePicker={() => setIsPickerOpen((prev) => !prev)}
              releases={releases}
              locale={locale}
              onSelectRelease={handleSelectRelease}
              pickerRef={pickerRef}
              dict={dict}
            />

            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexShrink: 0 }}>
              <UpdateActionButtons
                isUpgrade={isUpgrade}
                isDowngrade={isDowngrade}
                isDownloading={isDownloading}
                isDone={isDone}
                targetVersion={targetVersion}
                isCapsule={false}
                onPostpone={handlePostpone}
                onInstall={handleInstall}
                onClose={handleClose}
                dict={dict}
              />
            </div>
          </div>
        </div>
      ) : (
        /* ─── ОСТРОВНОЙ РЕЖИМ (Стиль «Капсула») ─── */
        <div
          className={`modal-container update-modal-capsule ${isExpanded ? "update-modal-capsule--expanded" : ""} ${isClosing ? "update-modal-capsule--closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. Верхний ряд: 2 самостоятельные карточки (инфо слева, действия справа) */}
          <div className="update-capsule-header">
            {/* Островок информации */}
            <div
              className="update-card update-card--header-info"
              onDoubleClick={() => setIsExpanded((prev) => !prev)}
            >
              <div className="update-card__logo-badge">
                <AppLogoIcon size={20} color="var(--accent)" />
              </div>
              <div className="update-card__title-group">
                <h3 id="update-modal-title" className="update-card__title">
                  {titleText}
                </h3>
                <p className="update-card__subtitle">
                  {subtitleText}
                </p>
              </div>
            </div>

            {/* Островок действий окна */}
            <div className="update-card update-card--header-actions">
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="update-card__action-btn"
                aria-label={isExpanded ? dict.updateModal.ariaRestore : dict.updateModal.ariaMaximize}
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>

              {!isDownloading && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="update-card__action-btn update-card__action-btn--close"
                  aria-label={dict.updateModal.ariaClose}
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

          {/* 2. Центральная карточка: тело релиза */}
          <div className="update-card update-card--body">
            <div className="update-card__body-header">
              <span className="update-card__body-title">
                {changelogText}
              </span>
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

            {/* Ошибка скачивания */}
            {errorMessage && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-4)",
                  padding: "10px 14px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "max(0px, calc(var(--radius-controls, 16px) - 6px))",
                  color: "#fca5a5",
                  fontSize: "var(--fs-xs)",
                  marginTop: "10px",
                }}
              >
                <AlertCircle size={16} className="no-shrink" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Прогресс скачивания */}
            {isDownloading && (
              <div style={{ marginTop: "12px" }}>
                <DownloadProgressBar
                  progress={progress}
                  downloadedBytes={downloadedBytes}
                  totalBytes={totalBytes}
                  isDone={isDone}
                  locale={locale}
                  dict={dict}
                />
              </div>
            )}
          </div>

          {/* 3. Нижний ряд: футер-островок с версиями и кнопками действий */}
          <div className="update-card update-card--footer">
            <VersionPicker
              currentVersion={currentVersion}
              targetVersion={targetVersion}
              isUpgrade={isUpgrade}
              isDowngrade={isDowngrade}
              isLoadingReleases={isLoadingReleases}
              isPickerOpen={isPickerOpen}
              onTogglePicker={() => setIsPickerOpen((prev) => !prev)}
              releases={releases}
              locale={locale}
              onSelectRelease={handleSelectRelease}
              pickerRef={pickerRef}
              dict={dict}
            />

            <div className="update-card__actions">
              <UpdateActionButtons
                isUpgrade={isUpgrade}
                isDowngrade={isDowngrade}
                isDownloading={isDownloading}
                isDone={isDone}
                targetVersion={targetVersion}
                isCapsule={true}
                onPostpone={handlePostpone}
                onInstall={handleInstall}
                onClose={handleClose}
                dict={dict}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface UpdateToastProps {
  updateInfo: UpdateInfo;
  onOpenModal: () => void;
  onClose: () => void;
}

/**
 * Ненавязчивое всплывающее окно в правом нижнем углу при обнаружении обновления.
 */
export const UpdateToast: React.FC<UpdateToastProps> = ({
  updateInfo,
  onOpenModal,
  onClose,
}) => {
  const { dict } = useTranslation();
  const { isClosing, handleClose } = useOverlayDismiss({
    onClose,
    kind: "fast",
    closeOnEscape: true,
  });

  const handlePostpone = () => {
    invoke("postpone_update").catch(console.error).finally(handleClose);
  };

  return (
    <div className={`update-toast ${isClosing ? "update-toast--closing" : ""}`}>
      <div className="update-toast__header">
        <div className="update-toast__title-group">
          <div className="update-toast__icon">
            <AppLogoIcon size={18} color="#ffffff" />
          </div>
          <div>
            <div className="update-toast__title">{dict.updateModal.toastTitle}</div>
            <div className="update-toast__version">
              {dict.updateModal.toastVersion(updateInfo.latest_version.replace(/^[vV]/, ""))}
            </div>
          </div>
        </div>
        <button
          className="update-toast__close"
          onClick={handleClose}
          aria-label={dict.updateModal.toastClose}
        >
          <X size={16} />
        </button>
      </div>

      <div className="update-toast__actions">
        <button
          className="update-toast__btn update-toast__btn--secondary"
          onClick={handlePostpone}
        >
          {dict.updateModal.toastPostpone}
        </button>
        <button
          className="update-toast__btn update-toast__btn--primary"
          onClick={onOpenModal}
        >
          {dict.updateModal.toastUpdate}
        </button>
      </div>
    </div>
  );
};
