import React from "react";
import { Cpu } from "lucide-react";
import { GpuHardwareInfo } from "./types";
import { useTranslation } from "../../i18n/LanguageContext";

interface GpuHardwareCardProps {
  gpuInfo?: GpuHardwareInfo;
}

export const GpuHardwareCard: React.FC<GpuHardwareCardProps> = ({ gpuInfo }) => {
  const { dict } = useTranslation();
  if (!gpuInfo) return null;

  const vramGb = gpuInfo.vram_bytes> 0
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
        gap: "var(--space-4)",
        fontSize: "var(--fs-sm)",
      }}
      >
      <div className="row-center row-gap-4">
        <Cpu size={16} color="var(--accent)" />
        <span className="t-primary">
          <strong>{dict.settings.upscaling.gpuLabel}</strong> {gpuInfo.name}
          {vramGb && (
            <span style={{ color: "var(--text-muted)", marginLeft: "var(--space-3)" }}>
              {dict.settings.upscaling.vramLabel(vramGb)}
            </span>
          )}
        </span>
      </div>
      <div className="row-center row-gap-3">
        <span className="t-muted">{dict.settings.upscaling.recommended}:</span>
        <span
          className={`badge ${
            gpuInfo.recommended_backend === "TensorRT"
              ? "badge--success"
              : "badge--accent"
          }`}
          >
          {gpuInfo.recommended_backend}{" "}
          {gpuInfo.supports_tensorrt ? `(${gpuInfo.sm_architecture})` : ""}
        </span>
      </div>
    </div>
  );
};
