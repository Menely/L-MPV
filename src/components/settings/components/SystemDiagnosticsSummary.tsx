import type { ReactNode } from "react";
import { useCallback } from "react";
import { showOsd } from "../../../hooks/useOsd";
import { invoke } from "@tauri-apps/api/core";
import { Check, CheckCircle2, Copy, Cpu, FileText, FolderOpen, HardDrive, Layers, Loader2, RotateCw, Sparkles } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";
import type { SystemDiagnosticsInfo } from "../lib/systemDiagnostics";

interface Props {
  embedded?: boolean;
  info: SystemDiagnosticsInfo | null;
  loading: boolean;
  copied: boolean;
  onRefresh: () => void;
  onCopy: () => void;
  actions?: ReactNode;
}

function DiagnosticRow({ icon, label, status, children, onOpenFolder, path }: {
  icon: ReactNode; label: string; status?: "ok" | "warn" | "bad";
  children: ReactNode; onOpenFolder?: () => Promise<void>; path?: string;
}) {
  const { dict } = useTranslation();
  const copyPath = useCallback(() => {
    if (path) void navigator.clipboard.writeText(path)
      .then(() => showOsd(dict.settings.systemFields.pathCopied))
      .catch(error => showOsd(dict.settings.systemFields.pathActionError(String(error)), { isError: true }));
  }, [path, dict]);
  return <div className="system-diagnostics__row" data-status={status}>
    <dt><span className="system-diagnostics__dot" data-status={status} aria-hidden />{icon}<span>{label}</span></dt>
    <dd>
      <span className="system-diagnostics__value">{children}</span>
      {path && path !== "Отсутствует" && path !== "Missing" && (
        <span className="system-diagnostics__actions">
          {onOpenFolder && <button type="button" className="system-diagnostics__mini-btn" onClick={() => void onOpenFolder().catch(error => showOsd(dict.settings.systemFields.pathActionError(String(error)), { isError: true }))} title={dict.settings.systemFields.btnOpenFolder} aria-label={`${dict.settings.systemFields.btnOpenFolder}: ${label}`}><FolderOpen size={12} aria-hidden /></button>}
          <button type="button" className="system-diagnostics__mini-btn" onClick={copyPath} title={dict.settings.systemFields.btnCopyPath} aria-label={`${dict.settings.systemFields.btnCopyPath}: ${label}`}><Copy size={12} aria-hidden /></button>
        </span>
      )}
    </dd>
  </div>;
}

function openFolder(path: string) {
  if (!path || path === "Отсутствует" || path === "Missing") return Promise.resolve();
  // Открываем родительский каталог для файлов, сам каталог — для папок.
  return invoke<void>("open_path_in_explorer", { path });
}

export function SystemDiagnosticsSummary({ info, loading, copied, onRefresh, onCopy, actions, embedded = false }: Props) {
  const { dict } = useTranslation();
  const f = dict.settings.systemFields;
  const installed = info ? [
    info.tensorrt_available && "TensorRT 11",
    info.directml_available && "DirectML",
    info.aji_available && "aji v0.25.0",
  ].filter(Boolean) : [];
  const ffmpeg = info?.ffmpeg_version.replace(/^ffmpeg\s+version\s+/i, "")
    .replace(/\s+Copyright\s*\(c\).*/i, "").replace(/-essentials_build/i, "")
    .replace(/-www\.gyan\.dev/i, " (gyan.dev)").trim();

  return <section className={embedded ? "system-diagnostics system-diagnostics--embedded" : "glass-section settings-group-card system-diagnostics"} aria-busy={loading}>
    {!embedded && <div className="system-diagnostics__header"><h3><Cpu size={17} aria-hidden />{f.title}</h3></div>}
    {loading && !info ? <div className="system-diagnostics__loading" role="status">
      <Loader2 size={16} className="spin-animation" aria-hidden />{f.loadingDiagnostics}
    </div> : info && <dl className="system-diagnostics__list">
      <DiagnosticRow icon={<Layers size={14} aria-hidden />} label={f.coreTitle} status={info.exe_dir_writable ? "ok" : "warn"}
        path={info.app_exe_dir} onOpenFolder={() => openFolder(info.app_exe_dir)}>
        <span>v{info.app_version} · {info.app_arch}</span>
        {info.is_portable && <span className="system-settings__badge">{f.modePortable}</span>}
        {!info.exe_dir_writable && <span className="system-settings__badge" data-active={false}>{f.exeWritableNo}</span>}
      </DiagnosticRow>
      <DiagnosticRow icon={<HardDrive size={14} aria-hidden />} label={f.libmpvTitle}
        status={info.libmpv_available ? "ok" : "bad"}
        path={info.libmpv_path} onOpenFolder={() => openFolder(info.libmpv_path)}>
        <span>{info.libmpv_available ? info.libmpv_version : f.libmpvMissing}</span>
        {info.libmpv_has_animejanai && <span className="system-settings__badge" title={f.animejanaiCompiled}>
          <CheckCircle2 size={11} aria-hidden />vf_animejanai
        </span>}
      </DiagnosticRow>
      <DiagnosticRow icon={<Cpu size={14} aria-hidden />} label={f.ffmpegTitle}
        status={info.ffmpeg_available ? "ok" : "bad"}
        path={info.ffmpeg_path} onOpenFolder={() => openFolder(info.ffmpeg_path)}>
        {info.ffmpeg_available ? ffmpeg : f.statusMissing}
      </DiagnosticRow>
      <DiagnosticRow icon={<FileText size={14} aria-hidden />} label={f.mediainfoTitle}
        status={info.mediainfo_available ? "ok" : "bad"}
        path={info.mediainfo_path} onOpenFolder={() => openFolder(info.mediainfo_path)}>
        {info.mediainfo_available ? info.mediainfo_version.replace(/^MediaInfoLib\s*-\s*/i, "").trim() : f.statusMissing}
      </DiagnosticRow>
      <DiagnosticRow icon={<Sparkles size={14} aria-hidden />} label={f.aiInferenceTitle}
        status={installed.length ? "ok" : "warn"}>
        <span>{installed.length ? installed.join(" · ") : f.noAiEngines}</span>
        {(info.models_count > 0 || info.compiled_engines_count > 0) &&
          <span className="system-diagnostics__muted">{info.models_count} ONNX / {info.compiled_engines_count} .engine</span>}
      </DiagnosticRow>
      <DiagnosticRow icon={<Cpu size={14} aria-hidden />} label={f.hardwareTitle}
        status={info.gpu_name ? "ok" : "warn"}>
        <span>{info.gpu_name}</span>
        <span className="system-diagnostics__muted">{(info.gpu_vram_mb / 1024).toFixed(1)} GB VRAM</span>
        {info.gpu_sm_arch && <span className="system-settings__badge">{info.gpu_sm_arch}</span>}
      </DiagnosticRow>
      <DiagnosticRow icon={<Layers size={14} aria-hidden />} label={f.webview2Title}
        status={info.webview2_version && info.webview2_version !== "unknown" && info.webview2_version !== "Не определён" ? "ok" : "warn"}>
        <span>{info.webview2_version && info.webview2_version !== "unknown" ? info.webview2_version : "—"}</span>

      </DiagnosticRow>
      <DiagnosticRow icon={<HardDrive size={14} aria-hidden />} label={f.diskTitle}
        status={info.disk_total_mb <= 0 || info.disk_free_mb < 1024 ? "warn" : "ok"}
        path={info.app_exe_dir} onOpenFolder={() => openFolder(info.app_exe_dir)}>
        <span>{info.disk_total_mb > 0 ? f.diskFree(info.disk_free_mb, info.disk_total_mb) : "—"}</span>
      </DiagnosticRow>
      <DiagnosticRow icon={<FileText size={14} aria-hidden />} label={f.fontsTitle} status="ok">
        <span>{f.fontsValue(info.fonts_builtin, info.fonts_custom)}</span>
      </DiagnosticRow>
    </dl>}
    <div className="system-diagnostics__tools">
      <button type="button" disabled={loading} onClick={onRefresh}
        className="system-settings__tool" title={f.btnRefreshTooltip}>
        <RotateCw size={13} className={loading ? "spin-animation" : ""} aria-hidden />{f.btnRefresh}
      </button>
      <button type="button" disabled={!info || loading} onClick={onCopy}
        className="system-settings__tool" title={f.btnCopyReportTooltip}>
        {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
        {copied ? f.reportCopied : f.btnCopyReport}
      </button>
      {actions}
    </div>
  </section>;
}
