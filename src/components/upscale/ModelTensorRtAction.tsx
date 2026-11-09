import React from "react";
import { CheckCircle2, RefreshCw, Zap } from "lucide-react";
import { ModelFileItem, UpscaleCompileProgress } from "./types";
import { useTranslation } from "../../i18n/LanguageContext";

export interface ModelTensorRtActionProps {
  /** Файл модели нейросети */
  model: ModelFileItem;
  /** Поддерживается ли бэкенд TensorRT на текущем GPU */
  supportsTensorrt: boolean;
  /** Имя модели, которая в текущий момент находится в процессе компиляции */
  compilingModel: string | null;
  /** Текущий объект прогресса сборки для данной модели */
  compileProgressItem?: UpscaleCompileProgress;
  /** Обработчик вызова предкомпиляции модели под 1080p */
  onPrecompile: () => void;
}

/**
 * Компактный и визуально унифицированный блок управления компиляцией
 * TensorRT-движка (.engine) для разрешения 1080p.
 * Все элементы жестко выровнены по высоте 28px и имеют единый радиус скругления 6px.
 */
export const ModelTensorRtAction: React.FC<ModelTensorRtActionProps> = React.memo(({
  model,
  supportsTensorrt,
  compilingModel,
  compileProgressItem,
  onPrecompile,
}) => {
  const { dict } = useTranslation();
  if (!supportsTensorrt) {
    return null;
  }

  const isCompiling = compilingModel === model.filename || compileProgressItem !== undefined;
  const isCompileFinished = !!(
    compileProgressItem &&
    compileProgressItem.is_finished &&
    !compileProgressItem.error
  );
  const isCompileError = !!(compileProgressItem && compileProgressItem.error);

  // 1. Состояние активного процесса компиляции с микро-прогрессбаром
  if (isCompiling) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "var(--space-1)",
          width: 150,
          minWidth: 150,
          maxWidth: 150,
          height: "var(--size-action-compact)",
          boxSizing: "border-box",
        }}
        >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "var(--fs-2xs)",
            color: isCompileError
              ? "var(--danger-text)"
              : isCompileFinished
              ? "var(--success-text)"
              : "var(--accent-text)",
            fontWeight: 600,
            lineHeight: 1,
          }}
          >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 105,
            }}
            >
            {compileProgressItem?.stage || dict.settings.upscaling.compilingProgress}
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {isCompileError
              ? dict.settings.upscaling.errorLabel
              : isCompileFinished
              ? "100%"
              : `${compileProgressItem?.percent || 0}%`}
          </span>
        </div>

        <div
          style={{
            width: "100%",
            height: 4,
            background: "rgba(255, 255, 255, 0.1)",
            borderRadius: 2,
            overflow: "hidden",
          }}
          >
          <div
            style={{
              width: isCompileError
                ? "100%"
                : isCompileFinished
                ? "100%"
                : `${compileProgressItem?.percent || 8}%`,
              height: "100%",
              background: isCompileError
                ? "#e74c3c"
                : isCompileFinished
                ? "linear-gradient(90deg, #27ae60, #2ecc71)"
                : "linear-gradient(90deg, #3498db, var(--accent), #2ecc71)",
              borderRadius: 2,
              transition: "width 0.25s ease-out",
              boxShadow: isCompileFinished
                ? "0 0 6px var(--success-glow)"
                : "0 0 6px var(--surface-accent-glow)",
            }}
          />
        </div>
      </div>
    );
  }

  // 2. Модель уже скомпилирована под 1080p: бейдж статуса + кнопка повтора
  if (model.has_engine_1080p) {
    return (
      <div className="row-center row-gap-2">
        <span
          className="badge badge--success"
          style={{
            height: "var(--size-action-compact)",
            padding: "0 8px",
            borderRadius: "var(--radius-control)",
            fontSize: "var(--fs-xs)",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            boxSizing: "border-box",
            lineHeight: 1,
          }}
          title={dict.settings.upscaling.trtReadyTitle}
          >
          <CheckCircle2 size={14} />
          <span>{dict.settings.upscaling.trtReadyBadge}</span>
        </span>

        <button
          type="button"
          className="btn btn--secondary model-compile-action"
          onClick={onPrecompile}
          disabled={!!compilingModel}
          aria-label={dict.settings.upscaling.trtRecompileTitle}
          title={dict.settings.upscaling.trtRecompileTitle}
          style={{
            width: "var(--size-action-compact)",
            height: "var(--size-action-compact)",
            minWidth: "var(--size-action-compact)",
            padding: "var(--space-0)",
            borderRadius: "var(--radius-control)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            cursor: "pointer",
          }}
          >
          <RefreshCw size={14} />
        </button>
      </div>
    );
  }

  // 3. Модель еще не компилировалась: компактная кнопка запуска сборки
  return (
    <button
      type="button"
      className="btn btn--secondary model-compile-action"
      onClick={onPrecompile}
      disabled={!!compilingModel}
      title={dict.settings.upscaling.trtCompileTitle}
      style={{
        height: "var(--size-action-compact)",
        padding: "0 8px",
        borderRadius: "var(--radius-control)",
        fontSize: "var(--fs-xs)",
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        boxSizing: "border-box",
        lineHeight: 1,
        cursor: "pointer",
      }}
      >
      <Zap size={14} color="var(--accent-text, var(--accent))" />
      <span>{dict.settings.upscaling.trtCompileBadge}</span>
    </button>
  );
});
