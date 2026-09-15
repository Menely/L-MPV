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
      style={{
        padding: "10px 14px",
        borderRadius: "var(--radius-md)",
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid var(--border-pill)",
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
          style={{
            padding: "2px 8px",
            borderRadius: 4,
            background:
              gpuInfo.recommended_backend === "TensorRT"
                ? "rgba(118, 185, 0, 0.15)"
                : "rgba(127, 199, 255, 0.15)",
            color:
              gpuInfo.recommended_backend === "TensorRT"
                ? "#76b900"
                : "var(--accent)",
            fontWeight: 600,
            fontSize: "0.78rem",
          }}
        >
          {gpuInfo.recommended_backend}{" "}
          {gpuInfo.supports_tensorrt ? `(${gpuInfo.sm_architecture})` : ""}
        </span>
      </div>
    </div>
  );
};
