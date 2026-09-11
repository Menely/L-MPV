import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Sparkles, Download, Loader2, X, AlertCircle, ArrowRight } from "lucide-react";

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
 * Форматирование байтов в читаемый вид (КБ / МБ).
 */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Модальное окно уведомления о доступном обновлении и его установки.
 */
export const UpdateModal: React.FC<UpdateModalProps> = ({ updateInfo, onClose }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    listen<UpdateProgress>("update-download-progress", (event) => {
      setProgress(Math.min(100, Math.max(0, event.payload.percentage)));
      setDownloadedBytes(event.payload.downloaded);
      setTotalBytes(event.payload.total);
    }).then((unlisten) => {
      unlistenFn = unlisten;
    });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  const handleInstall = async () => {
    if (!updateInfo.download_url) {
      setErrorMessage("Прямая ссылка на установочный файл не найдена в релизе.");
      return;
    }

    setIsDownloading(true);
    setErrorMessage(null);

    try {
      await invoke("download_and_install_update", {
        downloadUrl: updateInfo.download_url,
        assetName: updateInfo.asset_name,
      });
      setIsDone(true);
    } catch (err: any) {
      console.error("Ошибка обновления L-MPV:", err);
      setIsDownloading(false);
      setErrorMessage(typeof err === "string" ? err : err?.message || "Не удалось загрузить обновление");
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!isDownloading) onClose();
      }}
      style={{
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        className="modal-container update-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "460px",
          maxWidth: "92vw",
          borderRadius: "16px",
          background: "linear-gradient(180deg, rgba(26, 28, 35, 0.96) 0%, rgba(18, 19, 24, 0.98) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px var(--accent-glass, rgba(64, 150, 255, 0.15))",
          overflow: "hidden",
          color: "var(--text, #fff)",
          animation: "updateModalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Шапка модального окна */}
        <div
          style={{
            padding: "20px 24px 16px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(135deg, var(--accent, #3b82f6) 0%, rgba(59, 130, 246, 0.5) 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 15px var(--accent-glass, rgba(59, 130, 246, 0.4))",
                flexShrink: 0,
              }}
            >
              <Sparkles size={22} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
                Доступно обновление
              </h3>
              <p style={{ margin: "3px 0 0", fontSize: "0.84rem", color: "var(--text-muted, #9ca3af)" }}>
                Новая версия медиаплеера L-MPV
              </p>
            </div>
          </div>

          {!isDownloading && (
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted, #9ca3af)",
                cursor: "pointer",
                padding: 6,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.15s, background 0.15s",
              }}
              className="hover-subtle"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Тело модального окна */}
        <div style={{ padding: "20px 24px" }}>
          {/* Плашка версий */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "10px 16px",
              background: "rgba(255, 255, 255, 0.04)",
              borderRadius: 10,
              border: "1px solid rgba(255, 255, 255, 0.06)",
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted, #9ca3af)" }}>
              Текущая: <strong style={{ color: "var(--text-secondary, #d1d5db)" }}>v{updateInfo.current_version}</strong>
            </span>
            <ArrowRight size={15} style={{ color: "var(--text-muted, #9ca3af)" }} />
            <span
              style={{
                fontSize: "0.85rem",
                color: "var(--accent, #60a5fa)",
                fontWeight: 700,
                background: "var(--accent-glass, rgba(59, 130, 246, 0.18))",
                padding: "3px 10px",
                borderRadius: 9999,
                border: "1px solid var(--border-pill, rgba(59, 130, 246, 0.3))",
              }}
            >
              v{updateInfo.latest_version.replace(/^[vV]/, "")}
            </span>
          </div>

          {/* Список изменений / Описание релиза */}
          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--text-secondary, #d1d5db)",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Что нового в этом релизе:
            </div>
            <div
              className="custom-scrollbar"
              style={{
                maxHeight: "140px",
                overflowY: "auto",
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: "0.84rem",
                lineHeight: "1.5",
                color: "var(--text-secondary, #e5e7eb)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {updateInfo.release_notes && updateInfo.release_notes.trim()
                ? updateInfo.release_notes
                : "В этом выпуске представлены улучшения стабильности и обновлённые компоненты плеера."}
            </div>
          </div>

          {/* Ошибка скачивания */}
          {errorMessage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 8,
                color: "#fca5a5",
                fontSize: "0.82rem",
                marginBottom: 16,
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Прогресс скачивания */}
          {isDownloading && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.82rem",
                  color: "var(--text-secondary, #d1d5db)",
                  marginBottom: 8,
                }}
              >
                <span>
                  {isDone ? "Запуск инсталлятора..." : `Загрузка: ${progress.toFixed(0)}%`}
                </span>
                {totalBytes > 0 && (
                  <span style={{ color: "var(--text-muted, #9ca3af)" }}>
                    {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
                  </span>
                )}
              </div>

              <div
                style={{
                  width: "100%",
                  height: 8,
                  borderRadius: 4,
                  background: "rgba(255, 255, 255, 0.08)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, var(--accent, #3b82f6) 0%, #60a5fa 100%)",
                    borderRadius: 4,
                    transition: "width 0.2s ease-out",
                    boxShadow: "0 0 10px var(--accent, rgba(59, 130, 246, 0.6))",
                  }}
                />
              </div>

              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted, #9ca3af)",
                  marginTop: 8,
                  marginBottom: 0,
                  textAlign: "center",
                }}
              >
                После загрузки плеер автоматически перезапустится в процессе установки.
              </p>
            </div>
          )}
        </div>

        {/* Футер с кнопками */}
        <div
          style={{
            padding: "14px 24px 18px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            background: "rgba(0, 0, 0, 0.2)",
          }}
        >
          {!isDownloading && (
            <button
              onClick={onClose}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "var(--text-secondary, #d1d5db)",
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              className="hover-bright"
            >
              Напомнить позже
            </button>
          )}

          <button
            onClick={handleInstall}
            disabled={isDownloading}
            style={{
              padding: "8px 22px",
              borderRadius: 8,
              background: isDownloading
                ? "rgba(59, 130, 246, 0.4)"
                : "linear-gradient(135deg, var(--accent, #3b82f6) 0%, #2563eb 100%)",
              border: "1px solid var(--border-pill, rgba(255, 255, 255, 0.2))",
              color: "#ffffff",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: isDownloading ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: isDownloading
                ? "none"
                : "0 4px 14px var(--accent-glass, rgba(59, 130, 246, 0.4))",
              transition: "all 0.15s ease",
            }}
            className={!isDownloading ? "hover-scale" : ""}
          >
            {isDownloading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>{isDone ? "Запуск установки..." : "Скачивание..."}</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Установить</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
