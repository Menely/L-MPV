import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ClipboardPaste, Download, Link2, Loader2, RefreshCw, X } from "lucide-react";
import { useSurfaceDismiss } from "../motion/useSurfaceDismiss";
import { MotionSurface } from "../motion/MotionSurface";
import { useTranslation } from "../../i18n/LanguageContext";
import {
  STREAM_QUALITY_OPTIONS,
  type StreamQuality,
  type StreamingToolsProgress,
  type StreamingToolsStatus,
  getSavedStreamQuality,
  looksLikeStreamUrl,
  saveStreamQuality,
  streamErrorCode,
} from "../../utils/streamUrl";

interface OpenUrlModalProps {
  /** Ссылка, вставленная до открытия окна (например, Ctrl+V по плееру). */
  initialUrl?: string;
  onClose: () => void;
}

/** Прямая ссылка на файл/манифест — yt-dlp не нужен (дублирует проверку бэкенда). */
function isDirectMediaUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  if (!/^(https?|ytdl):\/\//.test(lower)) return /^[a-z][a-z\d+.-]+:\/\//.test(lower);
  const path = lower.split(/[?#]/)[0];
  return /\.(mp4|m4v|mkv|webm|mov|avi|ts|m2ts|flv|m3u8?|mpd|mp3|m4a|aac|flac|ogg|opus|wav)$/.test(path);
}

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Окно «Открыть ссылку»: YouTube и другие сайты через yt-dlp + deno (без cookies).
 */
export function OpenUrlModal({ initialUrl = "", onClose }: OpenUrlModalProps) {
  const { dict } = useTranslation();
  const text = dict.openUrl;
  const [url, setUrl] = useState(initialUrl);
  const [quality, setQuality] = useState<StreamQuality>(() => getSavedStreamQuality());
  const [status, setStatus] = useState<StreamingToolsStatus | null>(null);
  const [progress, setProgress] = useState<StreamingToolsProgress | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  const busy = installing || opening;
  const { handleClose } = useSurfaceDismiss({ onClose, disabled: installing });

  useEffect(() => {
    mountedRef.current = true;
    inputRef.current?.focus();
    inputRef.current?.select();
    invoke<StreamingToolsStatus>("get_streaming_tools_status")
      .then((next) => {
        if (!mountedRef.current) return;
        setStatus(next);
        setInstalling(next.installing);
        setUpdating(next.updating);
      })
      .catch((err) => console.error("Статус yt-dlp/deno:", err));
    const unlisten = listen<StreamingToolsProgress>("streaming-tools-progress", (event) => {
      if (mountedRef.current && event.payload.stage !== "update") setProgress(event.payload);
    });
    return () => {
      mountedRef.current = false;
      unlisten.then((off) => off());
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    setError(null);
    setNotice(null);
    setInstalling(true);
    setProgress(null);
    try {
      const next = await invoke<StreamingToolsStatus>("install_streaming_tools");
      if (mountedRef.current) setStatus(next);
      return next.ready;
    } catch (err) {
      const code = streamErrorCode(err);
      if (mountedRef.current) {
        setError(code === "STREAM_TOOLS_BUSY" ? text.errToolsBusy : text.errInstall(String(err)));
      }
      return false;
    } finally {
      if (mountedRef.current) {
        setInstalling(false);
        setProgress(null);
      }
    }
  }, [text]);

  const update = useCallback(async () => {
    setError(null);
    setNotice(null);
    setUpdating(true);
    try {
      const next = await invoke<StreamingToolsStatus>("update_streaming_tools");
      if (!mountedRef.current) return;
      setStatus(next);
      setNotice(text.toolsUpdated);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(streamErrorCode(err) === "STREAM_TOOLS_BUSY" ? text.errToolsBusy : String(err));
    } finally {
      if (mountedRef.current) setUpdating(false);
    }
  }, [text]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const clip = (await navigator.clipboard.readText()).trim();
      if (clip) {
        setUrl(clip);
        setError(null);
      }
    } catch {
      /* доступ к буферу запрещён — пользователь вставит сам */
    }
    inputRef.current?.focus();
  }, []);

  const submit = useCallback(async () => {
    const value = url.trim();
    if (!looksLikeStreamUrl(value)) {
      setError(text.errInvalidUrl);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    // Сайт без установленных компонентов: сначала скачиваем, затем открываем.
    if (!isDirectMediaUrl(value) && status && !status.ready) {
      const ready = await install();
      if (!ready) return;
    }
    setOpening(true);
    try {
      await invoke<string>("open_url", { url: value, maxHeight: quality > 0 ? quality : null });
      saveStreamQuality(quality);
      onClose();
    } catch (err) {
      if (!mountedRef.current) return;
      const code = streamErrorCode(err);
      setError(
        code === "STREAM_INVALID_URL" ? text.errInvalidUrl
          : code === "STREAM_TOOLS_MISSING" ? text.errToolsMissing
          : String(err)
      );
      setOpening(false);
    }
  }, [install, onClose, quality, status, text, url]);

  const ready = status?.ready ?? false;
  const percent = Math.max(0, Math.min(100, progress?.percent ?? 0));
  const showProgress = installing;

  return (
    <div className="modal-overlay open-url-overlay" onClick={busy ? undefined : handleClose}>
      <MotionSurface
        kind="dialog"
        className="modal open-url-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-url-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <div className="open-url-modal__heading">
            <span className="open-url-modal__icon" aria-hidden="true">
              <Link2 size={18} />
            </span>
            <div className="open-url-modal__titles">
              <h2 id="open-url-title" className="modal__title">{text.title}</h2>
              <p className="open-url-modal__subtitle">{text.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            className="modal__close"
            onClick={handleClose}
            disabled={installing}
            aria-label={text.close}
          >
            <X size={18} />
          </button>
        </div>

        <form
          className="open-url-modal__body"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void submit();
          }}
        >
          <div className="open-url-modal__field">
            <input
              ref={inputRef}
              className="open-url-modal__input"
              type="text"
              inputMode="url"
              spellCheck={false}
              autoComplete="off"
              placeholder={text.placeholder}
              aria-label={text.title}
              aria-invalid={error === text.errInvalidUrl ? true : undefined}
              value={url}
              disabled={busy}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
            />
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={() => void pasteFromClipboard()}
              disabled={busy}
              title={text.paste}
              aria-label={text.paste}
            >
              <ClipboardPaste size={16} />
            </button>
          </div>

          <div className="open-url-modal__row">
            <span className="open-url-modal__label" id="open-url-quality">{text.quality}</span>
            <div className="open-url-modal__segments" role="radiogroup" aria-labelledby="open-url-quality">
              {STREAM_QUALITY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={quality === option}
                  className={`open-url-modal__segment${quality === option ? " open-url-modal__segment--active" : ""}`}
                  onClick={() => setQuality(option)}
                  disabled={busy}
                >
                  {option === 0 ? text.qualityBest : `${option}p`}
                </button>
              ))}
            </div>
          </div>

          <section className={`open-url-modal__tools${ready ? "" : " open-url-modal__tools--missing"}`} aria-live="polite">
            <div className="open-url-modal__tools-head">
              <span className="open-url-modal__label">{text.toolsTitle}</span>
              {status && ready && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void update()}
                  disabled={busy || updating}
                >
                  <RefreshCw size={13} className={updating ? "animate-spin" : undefined} />
                  {updating ? text.toolsUpdating : text.toolsUpdate}
                </button>
              )}
            </div>

            {status && ready && (
              <p className="open-url-modal__note">
                {text.toolsReady(status.ytdlp_version ?? "?", status.deno_version ?? "?")}
              </p>
            )}

            {status && !ready && !showProgress && (
              <>
                <p className="open-url-modal__note">{text.toolsMissing}</p>
                <p className="open-url-modal__note open-url-modal__note--muted">{text.toolsHint}</p>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm open-url-modal__install"
                  onClick={() => void install()}
                  disabled={busy}
                >
                  <Download size={14} />
                  {text.toolsInstall}
                </button>
              </>
            )}

            {showProgress && (
              <div className="open-url-modal__progress">
                <div className="open-url-modal__progress-meta">
                  <span>{progress ? text.stage(progress.stage) : text.toolsInstalling}</span>
                  <span className="open-url-modal__progress-num">
                    {progress && progress.total_bytes > 0
                      ? `${formatMb(progress.downloaded_bytes)} / ${formatMb(progress.total_bytes)} MB · `
                      : ""}
                    {Math.round(percent)}%
                  </span>
                </div>
                <div
                  className="open-url-modal__progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percent)}
                >
                  <div className="open-url-modal__progress-fill" style={{ width: `${percent}%` }} />
                </div>
              </div>
            )}
          </section>

          {(error || notice) && (
            <p className={`open-url-modal__message${error ? " open-url-modal__message--error" : ""}`} role={error ? "alert" : "status"}>
              {error ?? notice}
            </p>
          )}

          <div className="open-url-modal__actions">
            <button type="button" className="btn btn--ghost btn--md" onClick={handleClose} disabled={installing}>
              {text.cancel}
            </button>
            <button type="submit" className="btn btn--primary btn--md" disabled={busy || !url.trim()}>
              {opening ? <Loader2 size={14} className="animate-spin" /> : null}
              {opening ? text.opening : installing ? text.toolsInstalling : text.open}
            </button>
          </div>
        </form>
      </MotionSurface>
    </div>
  );
}
