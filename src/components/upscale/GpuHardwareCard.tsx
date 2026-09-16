import React from "react";
import { Cpu } from "lucide-react";
import { GpuHardwareInfo } from "./types";

interface GpuHardwareCardProps {
  gpuInfo?: GpuHardwareInfo;
}

export const GpuHardwareCard: React.FC<GpuHardwareCardProps> = ({ gpuInfo }) => {
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
          <strong>Видеокарта:</strong> {gpuInfo.name}
          {vramGb && (
            <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
              ({vramGb} ГБ VRAM)
            </span>
          )}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--text-muted)" }}>Рекомендуется:</span>
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
