import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Cpu,
  RotateCw,
  Copy,
  Check,
  Link2,
  Loader2,
  ExternalLink,
  Trash2,
  FileText,
  CheckCircle2,
  HardDrive,
  Sparkles,
  Layers,
} from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";

/**
 * Системная диагностическая информация от бэкенда Rust.
 */
export interface SystemDiagnosticsInfo {
  app_version: string;
  app_arch: string;
  app_exe_dir: string;
  is_portable: boolean;

  libmpv_version: string;
  libmpv_available: boolean;
  libmpv_has_animejanai: boolean;
  libmpv_path: string;

  ffmpeg_version: string;
  ffmpeg_available: boolean;
  ffmpeg_path: string;

  mediainfo_version: string;
  mediainfo_available: boolean;
  mediainfo_path: string;

  aji_available: boolean;
  aji_trt_available: boolean;
  aji_dml_available: boolean;
  tensorrt_available: boolean;
  directml_available: boolean;
  models_count: number;
  compiled_engines_count: number;

  gpu_name: string;
  gpu_vendor: string;
  gpu_vram_mb: number;
  gpu_sm_arch: string;
  gpu_recommended_backend: string;
  gpu_supports_tensorrt: boolean;

  context_menu_registered: boolean;
  os_name: string;
}

/**
 * Очистка строковых версий от избыточных системных префиксов для компактного UI.
 */
function cleanFfmpegVersion(raw: string): string {
  return raw
    .replace(/^ffmpeg\s+version\s+/i, "")
    .replace(/\s+Copyright\s*\(c\).*/i, "")
    .replace(/-essentials_build/i, "")
    .replace(/-www\.gyan\.dev/i, " (gyan.dev)")
    .trim();
}

function cleanMediaInfoVersion(raw: string): string {
  return raw.replace(/^MediaInfoLib\s*-\s*/i, "").trim();
}

/**
 * Компактная вкладка «Система»: диагностический дашборд бинарников, DLL,
 * установленных движков ИИ, файловых ассоциаций и контекстного меню Windows Explorer.
 */
export function SystemSettingsTab(): React.ReactElement {
  const { dict } = useTranslation();
  const [diag, setDiag] = useState<SystemDiagnosticsInfo | null>(null);
  const [isLoadingDiag, setIsLoadingDiag] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const [integrationLogs, setIntegrationLogs] = useState<string[]>([]);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isUnregistering, setIsUnregistering] = useState<boolean>(false);
  const [isContextMenuRegistered, setIsContextMenuRegistered] = useState<boolean | null>(null);
  const [isContextMenuLoading, setIsContextMenuLoading] = useState<boolean>(false);

  const isMountedRef = useRef<boolean>(true);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const fetchDiagnostics = useCallback(async () => {
    setIsLoadingDiag(true);
    try {
      const data = await invoke<SystemDiagnosticsInfo>("get_system_diagnostics");
      if (!isMountedRef.current) return;
      setDiag(data);
      setIsContextMenuRegistered(data.context_menu_registered);
    } catch (e) {
      if (!isMountedRef.current) return;
      setIntegrationLogs((prev) => [
        ...prev,
        dict.settings.systemFields.diagError(String(e)),
      ]);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingDiag(false);
      }
    }
  }, [dict]);

  const checkContextMenuStatus = useCallback(async () => {
    try {
      const reg = await invoke<boolean>("is_explorer_context_menu_registered");
      if (!isMountedRef.current) return;
      setIsContextMenuRegistered(reg);
    } catch {
      if (!isMountedRef.current) return;
      setIsContextMenuRegistered(false);
    }
  }, []);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  const copyReportToClipboard = useCallback(async () => {
    if (!diag) return;
    const vramGb = (diag.gpu_vram_mb / 1024).toFixed(1);
    const report = [
      "========================================",
      `=== L-MPV System Diagnostics Report ===`,
      "========================================",
      `Application: L-MPV v${diag.app_version} (${diag.app_arch})`,
      `Mode: ${diag.is_portable ? "Portable" : "Installed"}`,
      `OS: ${diag.os_name}`,
      `Exe Directory: ${diag.app_exe_dir}`,
      "",
      `[Playback Engine - libmpv]`,
      `Version: ${diag.libmpv_version}`,
      `Available: ${diag.libmpv_available ? "YES" : "NO"}`,
      `vf_animejanai filter: ${diag.libmpv_has_animejanai ? "COMPILED / PRESENT" : "NOT DETECTED"}`,
      `File Path: ${diag.libmpv_path}`,
      "",
      `[Native Utilities]`,
      `FFmpeg: ${diag.ffmpeg_version} (${diag.ffmpeg_available ? "Ready" : "Missing"})`,
      `FFmpeg Path: ${diag.ffmpeg_path}`,
      `MediaInfo: ${diag.mediainfo_version} (${diag.mediainfo_available ? "Ready" : "Missing"})`,
      `MediaInfo Path: ${diag.mediainfo_path}`,
      "",
      `[Installed AI Inference Engines]`,
      `aji Bridge (aji.dll): ${diag.aji_available ? "YES" : "NO"}`,
      `TensorRT 11: ${diag.tensorrt_available ? "Installed" : "NO"}`,
      `DirectML: ${diag.directml_available ? "Installed" : "NO"}`,
      `ONNX Models in models/onnx: ${diag.models_count}`,
      `Compiled TensorRT Engines (.engine): ${diag.compiled_engines_count}`,
      "",
      `[Graphics Hardware (GPU)]`,
      `GPU: ${diag.gpu_name} (${diag.gpu_vendor})`,
      `VRAM: ${diag.gpu_vram_mb} MB (~${vramGb} GB)`,
      `Compute Architecture: ${diag.gpu_sm_arch}`,
      `Recommended AI Backend: ${diag.gpu_recommended_backend}`,
      `TensorRT Acceleration: ${diag.gpu_supports_tensorrt ? "Supported" : "Not supported"}`,
      "",
      `[Windows Shell Integration]`,
      `Explorer Context Menu ("L-MPV MediaInfo"): ${isContextMenuRegistered ? "Registered" : "Not registered"}`,
      "========================================",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(report);
      if (!isMountedRef.current) return;
      setIsCopied(true);
      setIntegrationLogs((prev) => [
        ...prev,
        `[INFO] ${dict.settings.systemFields.reportCopied}`,
      ]);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setIsCopied(false);
        }
      }, 2500);
    } catch {
      if (!isMountedRef.current) return;
      setIntegrationLogs((prev) => [
        ...prev,
        dict.settings.systemFields.copyReportError,
      ]);
    }
  }, [diag, isContextMenuRegistered, dict]);

  const handleRegisterFileAssoc = useCallback(async () => {
    setIsRegistering(true);
    try {
      const logs = await invoke<string[]>("register_file_associations");
      if (!isMountedRef.current) return;
      setIntegrationLogs(logs);
      await checkContextMenuStatus();
    } catch (e) {
      if (!isMountedRef.current) return;
      setIntegrationLogs([`[ERROR] ${dict.settings.integrationFields.errReg(String(e))}`]);
    } finally {
      if (isMountedRef.current) {
        setIsRegistering(false);
      }
    }
  }, [checkContextMenuStatus, dict]);

  const handleUnregisterFileAssoc = useCallback(async () => {
    setIsUnregistering(true);
    try {
      const logs = await invoke<string[]>("unregister_file_associations");
      if (!isMountedRef.current) return;
      setIntegrationLogs(logs);
      await checkContextMenuStatus();
    } catch (e) {
      if (!isMountedRef.current) return;
      setIntegrationLogs([`[ERROR] ${dict.settings.integrationFields.errUnreg(String(e))}`]);
    } finally {
      if (isMountedRef.current) {
        setIsUnregistering(false);
      }
    }
  }, [checkContextMenuStatus, dict]);

  const handleOpenDefaultApps = useCallback(async () => {
    try {
      await invoke("open_default_apps_settings");
      if (!isMountedRef.current) return;
      setIntegrationLogs((prev) => [
        ...prev,
        "[INFO] Windows 'Default Apps' settings opened",
      ]);
    } catch (e) {
      if (!isMountedRef.current) return;
      setIntegrationLogs((prev) => [
        ...prev,
        `[ERROR] ${dict.settings.integrationFields.errOpenSettings(String(e))}`,
      ]);
    }
  }, [dict]);

  const handleRegisterContextMenu = useCallback(async () => {
    setIsContextMenuLoading(true);
    try {
      const logs = await invoke<string[]>("register_explorer_context_menu");
      if (!isMountedRef.current) return;
      setIntegrationLogs(logs);
      await checkContextMenuStatus();
    } catch (e) {
      if (!isMountedRef.current) return;
      setIntegrationLogs([`[ERROR] ${dict.settings.integrationFields.errCmenuReg(String(e))}`]);
    } finally {
      if (isMountedRef.current) {
        setIsContextMenuLoading(false);
      }
    }
  }, [checkContextMenuStatus, dict]);

  const handleUnregisterContextMenu = useCallback(async () => {
    setIsContextMenuLoading(true);
    try {
      const logs = await invoke<string[]>("unregister_explorer_context_menu");
      if (!isMountedRef.current) return;
      setIntegrationLogs(logs);
      await checkContextMenuStatus();
    } catch (e) {
      if (!isMountedRef.current) return;
      setIntegrationLogs([`[ERROR] ${dict.settings.integrationFields.errCmenuUnreg(String(e))}`]);
    } finally {
      if (isMountedRef.current) {
        setIsContextMenuLoading(false);
      }
    }
  }, [checkContextMenuStatus, dict]);

  const f = dict.settings.systemFields;
  const i = dict.settings.integrationFields;

  // Формируем список ТОЛЬКО дополнительно установленных компонентов ИИ (без "Не установлен")
  const installedAiItems = useMemo(() => {
    if (!diag) return [];
    const items: string[] = [];
    if (diag.tensorrt_available) items.push("TensorRT 11");
    if (diag.directml_available) items.push("DirectML");
    if (diag.aji_available) items.push("aji v0.25.0");
    return items;
  }, [diag]);

  return (
    <div className="modal__section" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {/* ─── 1. Компактная шапка с заголовком и мини-кнопками ─── */}
      <div
        className="glass-section settings-group-card"
        style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Cpu size={17} style={{ color: "var(--accent-text)" }} />
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--accent-text)" }}>
            {f.title}
          </span>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            • {f.desc}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            disabled={isLoadingDiag}
            onClick={fetchDiagnostics}
            className="settings-action-btn settings-action-btn--secondary"
            title={f.btnRefreshTooltip}
            style={{ padding: "4px 9px", fontSize: "11px", height: "26px", display: "flex", alignItems: "center", gap: 5 }}
          >
            <RotateCw size={12} className={isLoadingDiag ? "spin-animation" : ""} />
            <span>{isLoadingDiag ? "…" : f.btnRefresh}</span>
          </button>

          <button
            type="button"
            disabled={!diag || isLoadingDiag}
            onClick={copyReportToClipboard}
            className={`settings-action-btn ${isCopied ? "settings-action-btn--primary" : "settings-action-btn--secondary"}`}
            style={{ padding: "4px 9px", fontSize: "11px", height: "26px", display: "flex", alignItems: "center", gap: 5 }}
            title={f.btnCopyReportTooltip}
          >
            {isCopied ? <Check size={12} /> : <Copy size={12} />}
            <span>{isCopied ? f.reportCopied : f.btnCopyReport}</span>
          </button>
        </div>
      </div>

      {/* ─── 2. Диагностическая сетка (компактные карточки 2x3) ─── */}
      {isLoadingDiag && !diag ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 0", gap: 10, color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}>
          <Loader2 size={16} className="spin-animation" />
          <span>{f.loadingDiagnostics}</span>
        </div>
      ) : diag ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "var(--space-3)",
          }}
        >
          {/* Карточка 1: L-MPV Core */}
          <div
            className="glass-section"
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--accent-text)", fontSize: "12px" }}>
                <Layers size={14} />
                {f.coreTitle}
              </div>
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(34, 197, 94, 0.15)",
                  color: "var(--success-text)",
                  fontWeight: 600,
                }}
              >
                {f.modePortable}
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.3 }}>
              v{diag.app_version} • {diag.app_arch}
            </div>
          </div>

          {/* Карточка 2: libmpv */}
          <div
            className="glass-section"
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--accent-text)", fontSize: "12px" }}>
                <HardDrive size={14} />
                {f.libmpvTitle}
              </div>
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-sm)",
                  background: diag.libmpv_available ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: diag.libmpv_available ? "var(--success-text)" : "var(--error-text)",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                {diag.libmpv_has_animejanai && <CheckCircle2 size={10} />}
                {diag.libmpv_has_animejanai ? "vf_animejanai" : f.libmpvActive}
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={diag.libmpv_version}>
              {diag.libmpv_version}
            </div>
          </div>

          {/* Карточка 3: FFmpeg */}
          <div
            className="glass-section"
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--accent-text)", fontSize: "12px" }}>
                <Cpu size={14} />
                {f.ffmpegTitle}
              </div>
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-sm)",
                  background: diag.ffmpeg_available ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: diag.ffmpeg_available ? "var(--success-text)" : "var(--error-text)",
                  fontWeight: 600,
                }}
              >
                {diag.ffmpeg_available ? f.statusActive : f.statusMissing}
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={diag.ffmpeg_version}>
              {cleanFfmpegVersion(diag.ffmpeg_version)}
            </div>
          </div>

          {/* Карточка 4: MediaInfo */}
          <div
            className="glass-section"
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--accent-text)", fontSize: "12px" }}>
                <FileText size={14} />
                {f.mediainfoTitle}
              </div>
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-sm)",
                  background: diag.mediainfo_available ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: diag.mediainfo_available ? "var(--success-text)" : "var(--error-text)",
                  fontWeight: 600,
                }}
              >
                {diag.mediainfo_available ? f.statusActive : f.statusMissing}
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={diag.mediainfo_version}>
              {cleanMediaInfoVersion(diag.mediainfo_version)} (C-API)
            </div>
          </div>

          {/* Карточка 5: Дополнительные движки ИИ (ТОЛЬКО то, что установлено) */}
          <div
            className="glass-section"
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--accent-text)", fontSize: "12px" }}>
                <Sparkles size={14} />
                {f.aiInferenceTitle}
              </div>
              {installedAiItems.length > 0 && (
                <span
                  style={{
                    fontSize: "10px",
                    padding: "1px 6px",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(34, 197, 94, 0.15)",
                    color: "var(--success-text)",
                    fontWeight: 600,
                  }}
                >
                  {f.aiInstalledBadge(installedAiItems.length)}
                </span>
              )}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.3 }}>
              {installedAiItems.length > 0 ? (
                <>
                  <strong style={{ color: "#fff" }}>{installedAiItems.join(" • ")}</strong>
                  {(diag.models_count > 0 || diag.compiled_engines_count > 0) && (
                    <span style={{ color: "var(--text-muted)" }}>
                      {" "}({diag.models_count} ONNX / {diag.compiled_engines_count} .engine)
                    </span>
                  )}
                </>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>{f.noAiEngines}</span>
              )}
            </div>
          </div>

          {/* Карточка 6: Видеоадаптер (GPU) */}
          <div
            className="glass-section"
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--accent-text)", fontSize: "12px" }}>
                <Cpu size={14} />
                {f.hardwareTitle}
              </div>
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(59, 130, 246, 0.15)",
                  color: "var(--accent-text)",
                  fontWeight: 600,
                }}
              >
                {diag.gpu_sm_arch}
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={diag.gpu_name}>
              {diag.gpu_name} • {(diag.gpu_vram_mb / 1024).toFixed(1)} GB VRAM
            </div>
          </div>
        </div>
      ) : null}

      {/* ─── 3. Компактная секция интеграции с Windows ─── */}
      <div
        className="glass-section settings-group-card"
        style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}
      >
        {/* Ассоциации медиафайлов */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "13px", fontWeight: 600, color: "var(--accent-text)" }}>
              <Link2 size={15} />
              {i.fileAssocTitle}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 2 }}>
              {i.fileAssocSubtitle}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={isRegistering || isUnregistering}
              onClick={handleRegisterFileAssoc}
              className="settings-action-btn settings-action-btn--primary"
              style={{ padding: "5px 12px", fontSize: "12px", height: "30px", display: "flex", alignItems: "center", gap: 5 }}
            >
              {isRegistering ? (
                <>
                  <Loader2 size={13} className="spin-animation" />
                  <span>{i.statusLinkingShort}</span>
                </>
              ) : (
                <>
                  <Link2 size={13} />
                  <span>{i.btnLinkFiles}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleOpenDefaultApps}
              className="settings-action-btn settings-action-btn--secondary"
              style={{ padding: "5px 12px", fontSize: "12px", height: "30px", display: "flex", alignItems: "center", gap: 5 }}
              title={i.btnWindowsParamsTooltip}
            >
              <ExternalLink size={13} />
              <span>{i.btnWindowsParams}</span>
            </button>

            <button
              type="button"
              disabled={isRegistering || isUnregistering}
              onClick={handleUnregisterFileAssoc}
              className="settings-action-btn settings-action-btn--danger"
              style={{ padding: "5px 12px", fontSize: "12px", height: "30px", display: "flex", alignItems: "center", gap: 5 }}
              title={i.btnUnlinkFilesTooltip}
            >
              {isUnregistering ? (
                <>
                  <Loader2 size={13} className="spin-animation" />
                  <span>{i.statusUnlinkingShort}</span>
                </>
              ) : (
                <>
                  <Trash2 size={13} />
                  <span>{i.btnUnlinkFiles}</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div style={{ height: "1px", background: "var(--border)", opacity: 0.5, margin: "2px 0" }} />

        {/* Контекстное меню Windows Explorer (MediaInfo) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "13px", fontWeight: 600, color: "var(--accent-text)" }}>
              <FileText size={15} />
              <span>{i.cmenuTitle}</span>
              {isContextMenuRegistered !== null && (
                <span
                  style={{
                    fontSize: "10px",
                    padding: "1px 6px",
                    borderRadius: "var(--radius-sm)",
                    background: isContextMenuRegistered ? "rgba(34, 197, 94, 0.15)" : "rgba(148, 163, 184, 0.15)",
                    color: isContextMenuRegistered ? "var(--success-text)" : "var(--text-muted)",
                    fontWeight: 600,
                  }}
                >
                  {isContextMenuRegistered ? i.cmenuActive : i.cmenuInactive}
                </span>
              )}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 2 }}>
              {i.cmenuSubtitle}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              disabled={isContextMenuLoading || isRegistering || isUnregistering}
              onClick={handleRegisterContextMenu}
              className="settings-action-btn settings-action-btn--primary"
              style={{ padding: "5px 12px", fontSize: "12px", height: "30px", display: "flex", alignItems: "center", gap: 5 }}
            >
              {isContextMenuLoading ? (
                <>
                  <Loader2 size={13} className="spin-animation" />
                  <span>{i.statusApplyingShort}</span>
                </>
              ) : (
                <>
                  <FileText size={13} />
                  <span>{i.btnAddCmenuShort}</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isContextMenuLoading || isRegistering || isUnregistering}
              onClick={handleUnregisterContextMenu}
              className="settings-action-btn settings-action-btn--danger"
              style={{ padding: "5px 12px", fontSize: "12px", height: "30px", display: "flex", alignItems: "center", gap: 5 }}
            >
              <Trash2 size={13} />
              <span>{i.btnRemoveCmenuShort}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── 4. Компактный журнал операций ─── */}
      <div
        role="log"
        aria-live="polite"
        tabIndex={0}
        style={{
          background: "#0c0c0c",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "8px 12px",
          height: "100px",
          overflowY: "auto",
          overflowX: "auto",
          overflowWrap: "anywhere",
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#d4d4d4",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {integrationLogs.length === 0 ? (
          <span style={{ color: "#666" }}>{i.logPlaceholder}</span>
        ) : (
          integrationLogs.map((log, i) => {
            let color = "#d4d4d4";
            if (log.startsWith("[OK]") || log.startsWith("[DONE]")) color = "#4caf50";
            if (log.startsWith("[ERROR]")) color = "#f44336";
            if (log.startsWith("[WARN]")) color = "#ff9800";
            if (log.startsWith("[INFO]")) color = "#2196f3";
            return (
              <div key={i} style={{ color }}>{log}</div>
            );
          })
        )}
      </div>
    </div>
  );
}
