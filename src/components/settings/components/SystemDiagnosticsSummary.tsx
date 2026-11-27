import type { ReactNode } from "react";
import {
  AppWindow,
  CheckCircle2,
  Clapperboard,
  Cpu,
  FileSearch,
  Film,
  Globe,
  HardDrive,
  Layers,
  Loader2,
  Package,
  RotateCw,
  Sparkles,
  Type,
  Zap,
} from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";
import { CopyCheckMorphIcon } from "../../common/CopyCheckMorphIcon";
import type { SystemDiagnosticsInfo } from "../lib/systemDiagnostics";
import { DiagnosticGroupCard } from "./diagnostics/DiagnosticGroupCard";
import { DiagnosticRow } from "./diagnostics/DiagnosticRow";
import {
  collectAiRuntimes,
  formatFfmpegVersion,
  formatLibmpvVersion,
  formatMediainfoVersion,
  hasKnownWebViewVersion,
} from "./diagnostics/formatDiagnostics";

interface Props {
  embedded?: boolean;
  info: SystemDiagnosticsInfo | null;
  loading: boolean;
  copied: boolean;
  onRefresh: () => void;
  onCopy: () => void;
  actions?: ReactNode;
}

/**
 * Сводка системных компонентов с группировкой по 3 смысловым блокам и панелью действий.
 */
export function SystemDiagnosticsSummary({
  info,
  loading,
  copied,
  onRefresh,
  onCopy,
  actions,
  embedded = false,
}: Props) {
  const { dict } = useTranslation();
  const f = dict.settings.systemFields;

  const installedRuntimes = info ? collectAiRuntimes(info) : [];
  const ffmpegText = formatFfmpegVersion(info, f);
  const libmpvText = formatLibmpvVersion(info, f);

  return (
    <section
      className={
        embedded
          ? "system-diagnostics system-diagnostics--embedded"
          : "glass-section settings-group-card system-diagnostics"
      }
      aria-busy={loading}
    >
      {!embedded && (
        <div className="system-diagnostics__header">
          <h3>
            <Cpu size={17} aria-hidden="true" />
            {f.title}
          </h3>
        </div>
      )}

      {loading && !info ? (
        <div className="system-diagnostics__loading" role="status">
          <Loader2 size={16} className="spin-animation" aria-hidden="true" />
          {f.loadingDiagnostics}
        </div>
      ) : (
        info && (
          <div className="system-diagnostics__groups">
            <DiagnosticGroupCard icon={<Package size={14} />} title={f.groupCoreTitle}>
              <DiagnosticRow
                icon={<AppWindow size={14} />}
                label={f.coreTitle}
                status={info.exe_dir_writable ? "ok" : "warn"}
                path={info.app_exe_dir}
                allowOpenFolder
              >
                <span>
                  v{info.app_version} · {info.app_arch}
                </span>
                {info.is_portable && <span className="system-settings__badge">{f.modePortable}</span>}
                {!info.exe_dir_writable && (
                  <span className="system-settings__badge system-settings__badge--warn">
                    {f.exeWritableNo}
                  </span>
                )}
              </DiagnosticRow>

              <DiagnosticRow
                icon={<Clapperboard size={14} />}
                label={f.libmpvTitle}
                status={info.libmpv_available ? "ok" : "bad"}
                path={info.libmpv_path}
                allowOpenFolder
              >
                <span>{info.libmpv_available ? libmpvText : f.libmpvMissing}</span>
                {info.libmpv_has_animejanai && (
                  <span
                    className="system-settings__badge system-settings__badge--accent"
                    title={f.animejanaiCompiled}
                  >
                    <CheckCircle2 size={11} aria-hidden="true" />
                    vf_animejanai
                  </span>
                )}
              </DiagnosticRow>

              <DiagnosticRow
                icon={<Film size={14} />}
                label={f.ffmpegTitle}
                status={info.ffmpeg_available ? "ok" : "bad"}
                path={info.ffmpeg_path}
                allowOpenFolder
              >
                <span>{info.ffmpeg_available ? ffmpegText : f.statusMissing}</span>
              </DiagnosticRow>

              <DiagnosticRow
                icon={<FileSearch size={14} />}
                label={f.mediainfoTitle}
                status={info.mediainfo_available ? "ok" : "bad"}
                path={info.mediainfo_path}
                allowOpenFolder
              >
                <span>
                  {info.mediainfo_available ? formatMediainfoVersion(info) : f.statusMissing}
                </span>
              </DiagnosticRow>
            </DiagnosticGroupCard>

            <DiagnosticGroupCard icon={<Zap size={14} />} title={f.groupGraphicsTitle}>
              <DiagnosticRow
                icon={<Cpu size={14} />}
                label={f.hardwareTitle}
                status={info.gpu_name ? "ok" : "warn"}
              >
                <span>{info.gpu_name}</span>
                <span className="system-settings__badge">
                  {(info.gpu_vram_mb / 1024).toFixed(1)} GB VRAM
                </span>
                {info.gpu_sm_arch && (
                  <span className="system-settings__badge">{info.gpu_sm_arch}</span>
                )}
              </DiagnosticRow>

              <DiagnosticRow
                icon={<Sparkles size={14} />}
                label={f.aiInferenceTitle}
                status={installedRuntimes.length ? "ok" : "warn"}
              >
                <span>
                  {installedRuntimes.length ? installedRuntimes.join(" · ") : f.noAiEngines}
                </span>
                {(info.models_count > 0 || info.compiled_engines_count > 0) && (
                  <span className="system-settings__badge">
                    {info.models_count} ONNX / {info.compiled_engines_count} .engine
                  </span>
                )}
              </DiagnosticRow>
            </DiagnosticGroupCard>

            <DiagnosticGroupCard icon={<Layers size={14} />} title={f.groupEnvTitle}>
              <DiagnosticRow
                icon={<Globe size={14} />}
                label={f.webview2Title}
                status={hasKnownWebViewVersion(info.webview2_version) ? "ok" : "warn"}
              >
                <span>
                  {hasKnownWebViewVersion(info.webview2_version) ? info.webview2_version : "—"}
                </span>
              </DiagnosticRow>

              <DiagnosticRow
                icon={<HardDrive size={14} />}
                label={f.diskTitle}
                status={info.disk_total_mb <= 0 || info.disk_free_mb < 1024 ? "warn" : "ok"}
                path={info.app_exe_dir}
                allowOpenFolder
              >
                <span>
                  {info.disk_total_mb > 0 ? f.diskFree(info.disk_free_mb, info.disk_total_mb) : "—"}
                </span>
              </DiagnosticRow>

              <DiagnosticRow icon={<Type size={14} />} label={f.fontsTitle} status="ok">
                <span>{f.fontsValue(info.fonts_builtin, info.fonts_custom)}</span>
              </DiagnosticRow>
            </DiagnosticGroupCard>
          </div>
        )
      )}

      <div className="system-diagnostics__tools">
        <div className="system-diagnostics__tools-group">
          <button
            type="button"
            disabled={loading}
            onClick={onRefresh}
            className="system-diagnostics__btn"
            title={f.btnRefreshTooltip}
          >
            <RotateCw
              size={14}
              className={loading ? "spin-animation" : undefined}
              aria-hidden="true"
            />
            <span>{f.btnRefresh}</span>
          </button>
          <button
            type="button"
            disabled={!info || loading}
            onClick={onCopy}
            className={`system-diagnostics__btn system-diagnostics__btn--primary${
              copied ? " system-diagnostics__btn--copied" : ""
            }`}
            title={f.btnCopyReportTooltip}
          >
            <CopyCheckMorphIcon copied={copied} size={14} />
            <span>{copied ? f.reportCopied : f.btnCopyReport}</span>
          </button>
        </div>
        {actions && (
          <div className="system-diagnostics__tools-group system-diagnostics__tools-group--end">
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}
