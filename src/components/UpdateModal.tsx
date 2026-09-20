import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Sparkles,
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
import { MarkdownRenderer } from "./MarkdownRenderer";

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
      setErrorMessage(typeof err === "string" ? err : err?.message || "Не удалось загрузить выбранную версию");
    }
  };

  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (closeTimerRef.current || isDownloading) return;
    const isNoAnim = typeof document !== "undefined" && document.documentElement.classList.contains("no-animations");
    if (isNoAnim) {
      onClose();
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, 175);
  }, [isDownloading, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (!isDownloading || !!errorMessage)) {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose, isDownloading, errorMessage]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handlePostpone = () => {
    invoke("postpone_update").catch(console.error).finally(handleClose);
  };

  return (
    <div
      className={`modal-overlay ${isClosing ? "modal-overlay--closing" : ""}`}
      onClick={handleClose}
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
        className={`modal-container update-modal-card ${isClosing ? "update-modal-card--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isExpanded ? "820px" : "480px",
          maxWidth: "94vw",
          height: isExpanded ? "78vh" : "420px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "var(--radius-lg)",
          background: "linear-gradient(180deg, rgba(26, 28, 35, 0.96) 0%, rgba(18, 19, 24, 0.98) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: isExpanded
            ? "0 25px 60px rgba(0, 0, 0, 0.75), 0 0 45px var(--accent-glass, rgba(64, 150, 255, 0.22))"
            : "0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px var(--accent-glass, rgba(64, 150, 255, 0.15))",
          overflow: "hidden",
          color: "var(--text, #fff)",
          animation: "updateModalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          transition: "width 0.3s cubic-bezier(0.16, 1, 0.3, 1), height 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease, border-radius var(--t-spring) var(--ease-spring-smooth)",
        }}
      >
        {/* Шапка модального окна */}
        <div
          onDoubleClick={() => setIsExpanded((prev) => !prev)}
          title="Дважды щелкните, чтобы развернуть или свернуть окно"
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
                background: "linear-gradient(135deg, var(--accent, #3b82f6) 0%, rgba(59, 130, 246, 0.5) 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 15px var(--accent-glass, rgba(59, 130, 246, 0.4))",
                flexShrink: 0,
                transition: "border-radius var(--t-spring) var(--ease-spring-smooth)",
              }}
            >
              <Sparkles size={22} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
                {isUpgrade
                  ? "Доступно обновление"
                  : isDowngrade
                  ? "Откат к предыдущей версии"
                  : "Информация о версии"}
              </h3>
              <p style={{ margin: "3px 0 0", fontSize: "0.84rem", color: "var(--text-muted, #9ca3af)" }}>
                {isUpgrade
                  ? `Новая версия медиаплеера L-MPV v${targetVersion}`
                  : isDowngrade
                  ? `Откат с v${currentVersion} на версию v${targetVersion}`
                  : `Текущая установленная версия L-MPV v${currentVersion}`}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setIsExpanded((prev) => !prev)}
              className="modal__close"
              title={isExpanded ? "Восстановить размер" : "Развернуть окно"}
              aria-label={isExpanded ? "Восстановить размер" : "Развернуть окно"}
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {!isDownloading && (
              <button
                onClick={handleClose}
                className="modal__close"
                title="Закрыть (Esc)"
                aria-label="Закрыть"
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
                gap: 8,
                marginBottom: 8,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-secondary, #d1d5db)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {isUpgrade
                  ? "Что нового в этом обновлении:"
                  : isDowngrade
                  ? `Описание версии v${targetVersion}:`
                  : "Описание и список изменений:"}
              </div>
              <button
                type="button"
                onClick={() => openUrl(releasePageUrl).catch(console.error)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "var(--radius-xs)",
                  padding: "4px 9px",
                  fontSize: "0.75rem",
                  color: "var(--accent, #60a5fa)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                className="hover-bright"
                title="Открыть страницу релиза на GitHub в браузере"
              >
                <ExternalLink size={12} />
                <span>Открыть на GitHub</span>
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
                borderRadius: "var(--radius-sm)",
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
                gap: 10,
                padding: "10px 14px",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "var(--radius-sm)",
                color: "#fca5a5",
                fontSize: "0.82rem",
                marginBottom: 16,
                transition: "border-radius var(--t-spring) var(--ease-spring-smooth)",
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

        {/* Футер с версией приложения и кнопками */}
        <div
          style={{
            padding: "14px 24px 18px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "rgba(0, 0, 0, 0.2)",
            flexShrink: 0,
            position: "relative",
          }}
        >
          {/* Селектор версии слева снизу */}
          <div className="version-picker-wrap" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setIsPickerOpen((prev) => !prev)}
              className={`version-picker-trigger ${isDowngrade ? "version-picker-trigger--downgrade" : ""}`}
              title="Нажмите, чтобы выбрать другую версию L-MPV"
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

            <span
              style={{
                fontSize: "0.78rem",
                color: isDowngrade
                  ? "#fbbf24"
                  : isUpgrade
                  ? "var(--accent, #60a5fa)"
                  : "var(--text-muted, #9ca3af)",
                fontWeight: isDowngrade || isUpgrade ? 600 : 400,
                marginLeft: 6,
              }}
            >
              {isDowngrade
                ? "откат версии"
                : isUpgrade
                ? "доступно обновление"
                : "актуальная версия"}
            </span>

            {/* Выпадающее меню со списком версий */}
            {isPickerOpen && (
              <div className="version-picker-popover custom-scrollbar">
                <div className="version-picker-header">
                  {isLoadingReleases
                    ? "Загрузка версий..."
                    : `Доступные релизы (${releases.length})`}
                </div>
                {releases.length === 0 && !isLoadingReleases ? (
                  <div style={{ padding: "8px 10px", fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                    Список версий недоступен
                  </div>
                ) : (
                  releases.map((rel) => {
                    const cleanRelVer = rel.latest_version.replace(/^[vV]/, "");
                    const isRelCurrent = cleanRelVer === currentVersion;
                    const isRelSelected = cleanRelVer === targetVersion;
                    return (
                      <div
                        key={rel.latest_version}
                        onClick={() => {
                          setSelectedRelease(rel);
                          setIsPickerOpen(false);
                        }}
                        className={`version-picker-item ${isRelSelected ? "version-picker-item--active" : ""}`}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="version-picker-item__tag">v{cleanRelVer}</span>
                          {isRelCurrent && (
                            <span className="version-picker-badge version-picker-badge--current">
                              текущая
                            </span>
                          )}
                        </div>
                        <div className="version-picker-item__meta">
                          {rel.published_at && (
                            <span>{new Date(rel.published_at).toLocaleDateString("ru-RU")}</span>
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

          {/* Кнопки действий справа снизу */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isUpgrade ? (
              <>
                {!isDownloading && (
                  <button
                    onClick={handlePostpone}
                    style={{
                      padding: "8px 18px",
                      borderRadius: "var(--radius-sm)",
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
                    borderRadius: "var(--radius-sm)",
                    background: isDownloading
                      ? "rgba(59, 130, 246, 0.4)"
                      : "linear-gradient(135deg, var(--accent, #3b82f6) 0%, var(--accent-dim, #2563eb) 100%)",
                    border: "none",
                    outline: "none",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: isDownloading ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    boxShadow: isDownloading
                      ? "none"
                      : "0 4px 14px var(--accent-glow, rgba(59, 130, 246, 0.35))",
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
                      <span>Обновить до v{targetVersion}</span>
                    </>
                  )}
                </button>
              </>
            ) : isDowngrade ? (
              <>
                {!isDownloading && (
                  <button
                    onClick={handleClose}
                    style={{
                      padding: "8px 18px",
                      borderRadius: "var(--radius-sm)",
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
                    Отмена
                  </button>
                )}

                <button
                  onClick={handleInstall}
                  disabled={isDownloading}
                  style={{
                    padding: "8px 22px",
                    borderRadius: "var(--radius-sm)",
                    background: isDownloading
                      ? "rgba(245, 158, 11, 0.4)"
                      : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                    border: "none",
                    outline: "none",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: isDownloading ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    boxShadow: isDownloading
                      ? "none"
                      : "0 4px 14px rgba(245, 158, 11, 0.35)",
                    transition: "all 0.15s ease",
                  }}
                  className={!isDownloading ? "hover-scale" : ""}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{isDone ? "Запуск отката..." : "Скачивание..."}</span>
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      <span>Откатить до v{targetVersion}</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                style={{
                  padding: "8px 26px",
                  borderRadius: "var(--radius-sm)",
                  background: "linear-gradient(135deg, var(--accent, #3b82f6) 0%, var(--accent-dim, #2563eb) 100%)",
                  border: "none",
                  outline: "none",
                  color: "#ffffff",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 4px 14px var(--accent-glow, rgba(59, 130, 246, 0.35))",
                  transition: "all 0.15s ease",
                }}
                className="hover-scale"
              >
                <span>Понятно</span>
              </button>
            )}
          </div>
        </div>
      </div>
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
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (closeTimerRef.current) return;
    const isNoAnim = typeof document !== "undefined" && document.documentElement.classList.contains("no-animations");
    if (isNoAnim) {
      onClose();
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, 155);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handlePostpone = () => {
    invoke("postpone_update").catch(console.error).finally(handleClose);
  };

  return (
    <div className={`update-toast ${isClosing ? "update-toast--closing" : ""}`}>
      <div className="update-toast__header">
        <div className="update-toast__title-group">
          <div className="update-toast__icon">
            <Sparkles size={16} color="#ffffff" />
          </div>
          <div>
            <div className="update-toast__title">Доступно обновление</div>
            <div className="update-toast__version">
              Версия v{updateInfo.latest_version.replace(/^[vV]/, "")}
            </div>
          </div>
        </div>
        <button
          className="update-toast__close"
          onClick={handleClose}
          title="Закрыть"
          aria-label="Закрыть"
        >
          <X size={16} />
        </button>
      </div>

      <div className="update-toast__actions">
        <button
          className="update-toast__btn update-toast__btn--secondary"
          onClick={handlePostpone}
        >
          Отложить
        </button>
        <button
          className="update-toast__btn update-toast__btn--primary"
          onClick={onOpenModal}
        >
          Обновить
        </button>
      </div>
    </div>
  );
};
