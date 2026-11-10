import React, { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Link2, Loader2, ExternalLink, Trash2, FileText } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";

import {
  type SystemDiagnosticsInfo,
  getCachedSystemDiagnostics,
  setCachedSystemDiagnostics,
  loadPreloadedSystemDiagnostics,
} from "../lib/systemDiagnostics";
export type { SystemDiagnosticsInfo } from "../lib/systemDiagnostics";
import { SystemDiagnosticsSummary } from "../components/SystemDiagnosticsSummary";
import { AccordionSection } from "../components/AccordionSection";
import "../../../styles/settings-system.css";

/**
 * Компактная вкладка «Система»: диагностический дашборд бинарников, DLL,
 * установленных движков ИИ, файловых ассоциаций и контекстного меню Windows Explorer.
 */
export function SystemSettingsTab(): React.ReactElement {
  const { dict } = useTranslation();
  const cachedDiag = getCachedSystemDiagnostics();
  const [diag, setDiag] = useState<SystemDiagnosticsInfo | null>(cachedDiag);
  const [isLoadingDiag, setIsLoadingDiag] = useState<boolean>(!cachedDiag);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const [integrationLogs, setIntegrationLogs] = useState<string[]>([]);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isUnregistering, setIsUnregistering] = useState<boolean>(false);
  const [isContextMenuRegistered, setIsContextMenuRegistered] = useState<boolean | null>(
    () => cachedDiag?.context_menu_registered ?? null
  );
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

  const fetchDiagnostics = useCallback(async (force = false) => {
    if (!getCachedSystemDiagnostics() || force) {
      setIsLoadingDiag(true);
    }
    try {
      const data = await loadPreloadedSystemDiagnostics(force);
      if (!isMountedRef.current) return;
      setDiag(data);
      setCachedSystemDiagnostics(data);
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
        `[ERROR] ${dict.settings.systemFields.copyReportError}`,
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
      setIntegrationLogs([dict.settings.integrationFields.errReg(String(e))]);
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
      setIntegrationLogs([dict.settings.integrationFields.errUnreg(String(e))]);
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
        dict.settings.integrationFields.errOpenSettings(String(e)),
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
      setIntegrationLogs([dict.settings.integrationFields.errCmenuReg(String(e))]);
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
      setIntegrationLogs([dict.settings.integrationFields.errCmenuUnreg(String(e))]);
    } finally {
      if (isMountedRef.current) {
        setIsContextMenuLoading(false);
      }
    }
  }, [checkContextMenuStatus, dict]);

  const i = dict.settings.integrationFields;
  const [openIntegration, setOpenIntegration] = useState<"files" | "explorer" | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  useEffect(() => {
    if (integrationLogs.length > 0) setLogOpen(true);
  }, [integrationLogs]);
  const busy = isRegistering || isUnregistering || isContextMenuLoading;

  return (
    <div className="modal__section system-settings">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {integrationLogs[integrationLogs.length - 1] ?? ""}
      </div>
      <SystemDiagnosticsSummary info={diag} loading={isLoadingDiag} copied={isCopied}
        onRefresh={() => fetchDiagnostics(true)} onCopy={copyReportToClipboard} />

      <AccordionSection isOpen={openIntegration === "files"}
        onToggle={() => setOpenIntegration((current) => current === "files" ? null : "files")}
        icon={<Link2 size={16} />} title={i.fileAssocTitle}>
        <p className="system-settings__description">{i.fileAssocSubtitle}</p>
        <div className="system-settings__actions">
          <button type="button" disabled={busy} onClick={handleRegisterFileAssoc}
            className="settings-action-btn settings-action-btn--primary">
            {isRegistering ? <Loader2 size={14} className="spin-animation" /> : <Link2 size={14} />}
            {isRegistering ? i.statusLinkingShort : i.btnLinkFiles}
          </button>
          <button type="button" onClick={handleOpenDefaultApps}
            className="settings-action-btn settings-action-btn--secondary" title={i.btnWindowsParamsTooltip}>
            <ExternalLink size={14} />{i.btnWindowsParams}
          </button>
          <button type="button" disabled={busy} onClick={handleUnregisterFileAssoc}
            className="settings-action-btn settings-action-btn--danger" title={i.btnUnlinkFilesTooltip}>
            {isUnregistering ? <Loader2 size={14} className="spin-animation" /> : <Trash2 size={14} />}
            {isUnregistering ? i.statusUnlinkingShort : i.btnUnlinkFiles}
          </button>
        </div>
      </AccordionSection>

      <AccordionSection isOpen={openIntegration === "explorer"}
        onToggle={() => setOpenIntegration((current) => current === "explorer" ? null : "explorer")}
        icon={<FileText size={16} />} title={i.cmenuTitle}
        badge={isContextMenuRegistered !== null ? <span className="system-settings__badge" data-active={isContextMenuRegistered}>
          {isContextMenuRegistered ? i.cmenuActive : i.cmenuInactive}
        </span> : undefined}>
        <p className="system-settings__description">{i.cmenuSubtitle}</p>
        <div className="system-settings__actions">
          <button type="button" disabled={busy} onClick={handleRegisterContextMenu}
            className="settings-action-btn settings-action-btn--primary">
            {isContextMenuLoading ? <Loader2 size={14} className="spin-animation" /> : <FileText size={14} />}
            {isContextMenuLoading ? i.statusApplyingShort : i.btnAddCmenuShort}
          </button>
          <button type="button" disabled={busy} onClick={handleUnregisterContextMenu}
            className="settings-action-btn settings-action-btn--danger">
            <Trash2 size={14} />{i.btnRemoveCmenuShort}
          </button>
        </div>
      </AccordionSection>

      {integrationLogs.length > 0 && <AccordionSection isOpen={logOpen}
        onToggle={() => setLogOpen((current) => !current)} icon={<FileText size={16} />}
        title={i.operationLogTitle}>
        <div className="system-settings__log" role="log" aria-live="off" tabIndex={0}>
          {integrationLogs.map((line, index) => {
            const level = /^\[(OK|DONE)\]/.test(line) ? "success"
              : line.startsWith("[ERROR]") ? "error" : line.startsWith("[WARN]") ? "warning" : "info";
            return <div key={index} data-level={level}>{line}</div>;
          })}
        </div>
      </AccordionSection>}
    </div>
  );
}
