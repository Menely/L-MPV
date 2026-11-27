import React from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { DownloadProgressPayload } from "./types";
import { useTranslation } from "../../i18n/LanguageContext";

export interface EngineDownloadProgressProps {
  /** Текущий объект состояния скачивания с бэкенда. */
  downloadProgress: DownloadProgressPayload | null;
  /** Текстовое описание текущей стадии загрузки. */
  downloadProgressText: string | null;
  /** Вычисленный процент выполнения (0..100). */
  activePercent: number;
  /** Признак успешного завершения скачивания. */
  isFinished: boolean;
  /** Признак ошибки во время скачивания. */
  isError: boolean;
}

/**
 * Карточка прогресса скачивания и распаковки библиотек инференса (DirectML / TensorRT).
 */
export const EngineDownloadProgress: React.FC<EngineDownloadProgressProps> = React.memo(({
  downloadProgress,
  downloadProgressText,
  activePercent,
  isFinished,
  isError,
}) => {
  const { dict } = useTranslation();

  const isExtracting =
    downloadProgress?.stage?.includes("Распаковка") ||
    downloadProgress?.stage?.toLowerCase().includes("extract");

  return (
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
            <Check
              size={15}
              strokeWidth={2.5}
              color="var(--success-text)"
              style={{ flexShrink: 0 }}
            />
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
            {downloadProgress?.stage ||
              downloadProgressText ||
              dict.settings.upscaling.downloadingLibs}
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
              {(downloadProgress.downloaded_bytes / (1024 * 1024)).toFixed(1)}{" "}
              MB / {(downloadProgress.total_bytes / (1024 * 1024)).toFixed(1)}{" "}
              MB
            </span>
          ) : isExtracting ? (
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
              isError
                ? "badge--danger"
                : isFinished
                ? "badge--success"
                : "badge--accent"
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
  );
});

EngineDownloadProgress.displayName = "EngineDownloadProgress";
