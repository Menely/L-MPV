import React from "react";
import { CheckCircle2, RefreshCw, Zap } from "lucide-react";
import { ModelFileItem, UpscaleCompileProgress } from "./types";

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
 * Все элементы жестко выровнены по высоте 24px и имеют единый радиус скругления 6px.
 */
export const ModelTensorRtAction: React.FC<ModelTensorRtActionProps> = ({
  model,
  supportsTensorrt,
  compilingModel,
  compileProgressItem,
  onPrecompile,
}) => {
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
          gap: 2,
          width: 150,
          minWidth: 150,
          maxWidth: 150,
          height: 24,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.70rem",
            color: isCompileError
              ? "#e74c3c"
              : isCompileFinished
              ? "#2ecc71"
              : "var(--accent)",
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
            {compileProgressItem?.stage || "Сборка..."}
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {isCompileError
              ? "Ошибка"
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
                ? "0 0 6px rgba(46, 204, 113, 0.4)"
                : "0 0 6px rgba(127, 199, 255, 0.4)",
            }}
          />
        </div>
      </div>
    );
  }

  // 2. Модель уже скомпилирована под 1080p: бейдж статуса + кнопка повтора
  if (model.has_engine_1080p) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span
          className="badge badge--success"
          style={{
            height: 24,
            padding: "0 8px",
            borderRadius: "var(--radius-sm, 6px)",
            fontSize: "0.76rem",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            boxSizing: "border-box",
            lineHeight: 1,
          }}
          title="Движок TensorRT (.engine) уже скомпилирован под разрешение 1080p — включение будет мгновенным"
        >
          <CheckCircle2 size={13} />
          <span>1080p готов</span>
        </span>

        <button
          type="button"
          className="btn btn--secondary"
          onClick={onPrecompile}
          disabled={!!compilingModel}
          title="Перекомпилировать движок TensorRT под 1080p"
          style={{
            width: 24,
            height: 24,
            minWidth: 24,
            padding: 0,
            borderRadius: "var(--radius-sm, 6px)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            cursor: "pointer",
          }}
        >
          <RefreshCw size={12} />
        </button>
      </div>
    );
  }

  // 3. Модель еще не компилировалась: компактная кнопка запуска сборки
  return (
    <button
      type="button"
      className="btn btn--secondary"
      onClick={onPrecompile}
      disabled={!!compilingModel}
      title="Скомпилировать TensorRT движок под 1080p заранее, чтобы исключить задержку при воспроизведении"
      style={{
        height: 24,
        padding: "0 9px",
        borderRadius: "var(--radius-sm, 6px)",
        fontSize: "0.76rem",
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        boxSizing: "border-box",
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      <Zap size={12} color="var(--accent)" />
      <span>1080p сборка</span>
    </button>
  );
};
