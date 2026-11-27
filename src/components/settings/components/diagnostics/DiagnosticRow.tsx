import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen } from "lucide-react";
import { showOsd } from "../../../../hooks/useOsd";
import { useTranslation } from "../../../../i18n/LanguageContext";
import { CopyCheckMorphIcon } from "../../../common/CopyCheckMorphIcon";
import { hasActionablePath } from "./formatDiagnostics";

export type DiagnosticStatus = "ok" | "warn" | "bad";

export interface DiagnosticRowProps {
  /** Уникальная иконка компонента в начале строки. */
  icon: ReactNode;
  /** Короткое название параметра (выводится в одну строку). */
  label: string;
  /** Семантический статус для цветовой индикации иконки и значения. */
  status?: DiagnosticStatus;
  /** Основное содержимое значения и бейджей. */
  children: ReactNode;
  /** Полный путь к файлу или каталогу компонента. */
  path?: string;
  /** Флаг доступности кнопки открытия каталога в Проводнике. */
  allowOpenFolder?: boolean;
}

/**
 * Строка системной диагностики без дублирующего точечного индикатора.
 */
export function DiagnosticRow({
  icon,
  label,
  status = "ok",
  children,
  path,
  allowOpenFolder = false,
}: DiagnosticRowProps) {
  const { dict } = useTranslation();
  const fields = dict.settings.systemFields;
  const [pathCopied, setPathCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleOpenFolder = useCallback(() => {
    if (!hasActionablePath(path)) return;
    void invoke<void>("open_path_in_explorer", { path }).catch((error) => {
      showOsd(fields.pathActionError(String(error)), { isError: true });
    });
  }, [path, fields]);

  const handleCopyPath = useCallback(() => {
    if (!hasActionablePath(path)) return;
    void navigator.clipboard
      .writeText(path)
      .then(() => {
        setPathCopied(true);
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => setPathCopied(false), 2000);
        showOsd(fields.pathCopied);
      })
      .catch((error) => {
        showOsd(fields.pathActionError(String(error)), { isError: true });
      });
  }, [path, fields]);

  const showPathActions = hasActionablePath(path);

  return (
    <div className="system-diagnostics__row" data-status={status}>
      <dt title={label}>
        <span className="system-diagnostics__row-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="system-diagnostics__row-label">{label}</span>
      </dt>
      <dd>
        <span className="system-diagnostics__value">{children}</span>
        {showPathActions && (
          <span className="system-diagnostics__actions">
            {allowOpenFolder && (
              <button
                type="button"
                className="system-diagnostics__mini-btn"
                onClick={handleOpenFolder}
                title={fields.btnOpenFolder}
                aria-label={`${fields.btnOpenFolder}: ${label}`}
              >
                <FolderOpen size={13} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="system-diagnostics__mini-btn"
              onClick={handleCopyPath}
              title={fields.btnCopyPath}
              aria-label={`${fields.btnCopyPath}: ${label}`}
            >
              <CopyCheckMorphIcon copied={pathCopied} size={13} />
            </button>
          </span>
        )}
      </dd>
    </div>
  );
}
