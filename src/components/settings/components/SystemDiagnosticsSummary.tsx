import type { ReactNode } from "react";
import { Check, CheckCircle2, Copy, Cpu, FileText, HardDrive, Layers, Loader2, RotateCw, Sparkles } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";
import type { SystemDiagnosticsInfo } from "../lib/systemDiagnostics";

interface Props {
  embedded?: boolean;
  info: SystemDiagnosticsInfo | null;
  loading: boolean;
  copied: boolean;
  onRefresh: () => void;
  onCopy: () => void;
}

function DiagnosticRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div className="system-diagnostics__row">
    <dt>{icon}<span>{label}</span></dt>
    <dd>{children}</dd>
  </div>;
}

export function SystemDiagnosticsSummary({ info, loading, copied, onRefresh, onCopy, embedded = false }: Props) {
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
      <DiagnosticRow icon={<Layers size={14} aria-hidden />} label={f.coreTitle}>
        <span>v{info.app_version} · {info.app_arch}</span>
        {info.is_portable && <span className="system-settings__badge">{f.modePortable}</span>}
      </DiagnosticRow>
      <DiagnosticRow icon={<HardDrive size={14} aria-hidden />} label={f.libmpvTitle}>
        <span>{info.libmpv_available ? info.libmpv_version : f.libmpvMissing}</span>
        {info.libmpv_has_animejanai && <span className="system-settings__badge" title={f.animejanaiCompiled}>
          <CheckCircle2 size={11} aria-hidden />vf_animejanai
        </span>}
      </DiagnosticRow>
      <DiagnosticRow icon={<Cpu size={14} aria-hidden />} label={f.ffmpegTitle}>
        {info.ffmpeg_available ? ffmpeg : f.statusMissing}
      </DiagnosticRow>
      <DiagnosticRow icon={<FileText size={14} aria-hidden />} label={f.mediainfoTitle}>
        {info.mediainfo_available ? info.mediainfo_version.replace(/^MediaInfoLib\s*-\s*/i, "").trim() : f.statusMissing}
      </DiagnosticRow>
      <DiagnosticRow icon={<Sparkles size={14} aria-hidden />} label={f.aiInferenceTitle}>
        <span>{installed.length ? installed.join(" · ") : f.noAiEngines}</span>
        {(info.models_count > 0 || info.compiled_engines_count > 0) &&
          <span className="system-diagnostics__muted">{info.models_count} ONNX / {info.compiled_engines_count} .engine</span>}
      </DiagnosticRow>
      <DiagnosticRow icon={<Cpu size={14} aria-hidden />} label={f.hardwareTitle}>
        <span>{info.gpu_name}</span>
        <span className="system-diagnostics__muted">{(info.gpu_vram_mb / 1024).toFixed(1)} GB VRAM</span>
        {info.gpu_sm_arch && <span className="system-settings__badge">{info.gpu_sm_arch}</span>}
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
    </div>
  </section>;
}
