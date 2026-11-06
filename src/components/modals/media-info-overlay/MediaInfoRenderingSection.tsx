import React from "react";
import type { RenderingAndSystemStats } from "./mediaInfoOverlayUtils";
import { formatBytes } from "./mediaInfoOverlayUtils";
import { useTranslation } from "../../../i18n/LanguageContext";

/**
 * Пропсы секции телеметрии оборудования и рендеринга.
 */
export interface MediaInfoRenderingSectionProps {
  /** Актуальные замеры оборудования, декодера и синхронизации. */
  stats: RenderingAndSystemStats | null;
  /** Флаг загрузки данных. */
  isLoading: boolean;
}

/**
 * Модульная секция сведений о рендеринге, нагрузке на систему и кадровой синхронизации (Вкладка 2).
 * В стиле «Капсула» разделяется на самостоятельные парящие карточки:
 * 1. Оборудование (CPU, RAM, GPU, VRAM)
 * 2. Декодер и цветопередача (HW декодер, пиксели, гамма, MaxCLL/FALL)
 * 3. Дисплей и синхронизация (Display FPS, A/V Sync, задержки)
 */
export const MediaInfoRenderingSection: React.FC<MediaInfoRenderingSectionProps> = ({
  stats,
  isLoading,
}) => {
  const { dict } = useTranslation();

  if (isLoading && !stats) {
    return (
      <div className="media-info__section">
        <div className="media-info__row">
          <span className="media-info__value media-info__value--muted">
            {dict.mediaInfo.loading}
          </span>
        </div>
      </div>
    );
  }

  const cpuText = stats
    ? `L-MPV: ${stats.cpu_app_percent.toFixed(1)}% | ПК: ${stats.cpu_total_percent.toFixed(1)}%`
    : "—";

  const ramText = stats
    ? `L-MPV: ${formatBytes(stats.ram_app_bytes)} | ПК: ${formatBytes(
        stats.ram_total_used_bytes
      )} / ${formatBytes(stats.ram_total_bytes)}`
    : "—";

  const gpuName = stats?.gpu_name || "Direct3D 11";
  const vramText =
    stats && stats.vram_total_bytes > 0
      ? stats.vram_used_bytes > 0
        ? `${formatBytes(stats.vram_used_bytes)} / ${formatBytes(
            stats.vram_total_bytes
          )}`
        : formatBytes(stats.vram_total_bytes)
      : "—";

  const hwdecLabel = stats?.hwdec_current
    ? stats.hwdec_active
      ? `${stats.hwdec_current.toUpperCase()} (HW)`
      : stats.hwdec_current.toLowerCase() === "no" || !stats.hwdec_current
      ? "Software (CPU)"
      : `${stats.hwdec_current.toUpperCase()} (SW)`
    : "—";

  const cllFallText =
    stats && (stats.max_cll > 0 || stats.max_fall > 0)
      ? `${Math.round(stats.max_cll)} nit / ${Math.round(stats.max_fall)} nit`
      : "—";

  const avSyncText = stats
    ? `${stats.av_sync_ms >= 0 ? "+" : ""}${stats.av_sync_ms.toFixed(1)} ms`
    : "—";

  const displayFpsText =
    stats && stats.display_fps > 0
      ? `${stats.display_fps.toFixed(3)} Hz`
      : "—";

  const delayedText = stats
    ? `${stats.vo_delayed_frames} delayed / ${stats.vo_mistimed_frames} mistimed`
    : "—";

  return (
    <>
      {/* ─── Карточка 1: Оборудование (Hardware Monitor) ─── */}
      <div className="media-info__section">
        <div className="media-info__section-header">
          <span className="media-info__section-title">
            {dict.mediaInfoModal.hardwareTitle}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.cpu}</span>
          <span className="media-info__value">{cpuText}</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.ram}</span>
          <span className="media-info__value">{ramText}</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.gpu}</span>
          <span className="media-info__value" title={gpuName}>
            {gpuName}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.vram}</span>
          <span className="media-info__value">{vramText}</span>
        </div>
      </div>

      {/* ─── Карточка 2: Декодер и цвет ─── */}
      <div className="media-info__section">
        <div className="media-info__section-header">
          <span className="media-info__section-title">
            {dict.mediaInfoModal.decoderTitle}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.hwdec}</span>
          <span
            className={`media-info__value ${
              stats?.hwdec_active ? "media-info__value--accent" : ""
            }`}
          >
            {hwdecLabel}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">
            {dict.mediaInfoModal.pixelFormat}
          </span>
          <span className="media-info__value">
            {stats?.pixel_format || "—"}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">
            {dict.mediaInfoModal.colorRange}
          </span>
          <span className="media-info__value">
            {stats?.color_range || "—"}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">
            {dict.mediaInfoModal.colorTransfer}
          </span>
          <span className="media-info__value">
            {stats?.color_transfer || stats?.color_space || "—"}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">
            {dict.mediaInfoModal.maxCllFall}
          </span>
          <span className="media-info__value">{cllFallText}</span>
        </div>
      </div>

      {/* ─── Карточка 3: Синхронизация и дисплей ─── */}
      <div className="media-info__section">
        <div className="media-info__section-header">
          <span className="media-info__section-title">
            {dict.mediaInfoModal.displaySyncTitle}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">
            {dict.mediaInfoModal.displayFps}
          </span>
          <span className="media-info__value">{displayFpsText}</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">
            {dict.mediaInfoModal.avSync}
          </span>
          <span className="media-info__value">{avSyncText}</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">
            {dict.mediaInfoModal.voDelayed}
          </span>
          <span className="media-info__value">{delayedText}</span>
        </div>
      </div>
    </>
  );
};

