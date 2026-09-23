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

  const vramGb = gpuInfo.vram_bytes > 0
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
        gap: 8,
        fontSize: "0.82rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Cpu size={16} color="var(--accent)" />
        <span style={{ color: "var(--text-primary)" }}>
          <strong>{dict.settings.upscaling.gpuLabel}</strong> {gpuInfo.name}
          {vramGb && (
            <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
              {dict.settings.upscaling.vramLabel(vramGb)}
            </span>
          )}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--text-muted)" }}>{dict.settings.upscaling.recommended}:</span>
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
