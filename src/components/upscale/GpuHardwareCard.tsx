import React from "react";
import { Cpu } from "lucide-react";
import { GpuHardwareInfo } from "./types";
import { useTranslation } from "../../i18n/LanguageContext";

interface GpuHardwareCardProps {
  gpuInfo?: GpuHardwareInfo;
}

/**
 * Аппаратная карточка характеристик графического процессора (GPU).
 * Отображает модель видеокарты, объем видеопамяти VRAM и рекомендованный бэкенд
 * по новым стандартам: чистая векторная иконка, аккуратные бейджи без двойных рамок.
 */
export const GpuHardwareCard: React.FC<GpuHardwareCardProps> = ({ gpuInfo }) => {
  const { dict } = useTranslation();
  if (!gpuInfo) return null;

  const vramGb =
    gpuInfo.vram_bytes > 0
      ? (gpuInfo.vram_bytes / (1024 * 1024 * 1024)).toFixed(1)
      : null;

  return (
    <div
      className="glass-tile"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        fontSize: "var(--fs-sm)",
        padding: "10px 14px",
        borderRadius: "var(--radius-card, 10px)",
      }}
    >
      <div className="row-center" style={{ gap: 10, minWidth: 0, flex: 1, flexWrap: "wrap" }}>
        <Cpu size={17} style={{ color: "var(--accent-text)", flexShrink: 0 }} />
        <div className="t-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <strong>{dict.settings.upscaling.gpuLabel}</strong>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {gpuInfo.name}
          </span>
          {vramGb && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--fs-2xs)",
                padding: "2px 7px",
                borderRadius: "var(--radius-pill)",
                background: "rgba(255, 255, 255, 0.08)",
                color: "var(--text-secondary)",
                lineHeight: 1.2,
                fontWeight: 500,
              }}
            >
              {vramGb} ГБ VRAM
            </span>
          )}
        </div>
      </div>

      <div className="row-center" style={{ gap: 8, flexShrink: 0 }}>
        <span className="t-muted" style={{ fontSize: "var(--fs-xs)" }}>
          {dict.settings.upscaling.recommended}:
        </span>
        <span
          style={{
            height: 24,
            padding: "0 8px",
            borderRadius: "var(--radius-control, 7px)",
            fontSize: "var(--fs-xs)",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            background:
              gpuInfo.recommended_backend === "TensorRT"
                ? "rgba(46, 204, 113, 0.16)"
                : "var(--surface-accent-subtle)",
            color:
              gpuInfo.recommended_backend === "TensorRT"
                ? "var(--success-text)"
                : "var(--accent-text)",
            lineHeight: 1,
            border: "none",
          }}
        >
          {gpuInfo.recommended_backend}{" "}
          {gpuInfo.supports_tensorrt ? `(${gpuInfo.sm_architecture})` : ""}
        </span>
      </div>
    </div>
  );
};
