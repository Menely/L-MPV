import React from "react";
import { Check, RefreshCw, Zap, X } from "lucide-react";
import { ModelFileItem, UpscaleCompileProgress } from "./types";
import { useTranslation } from "../../i18n/LanguageContext";
import { TrackLiquidProgressFill } from "../player/controls/track-popover/TrackDownloadVisuals";

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
 * Блок управления компиляцией TensorRT-движка (.engine) под 1080p:
 * - При компиляции: плавная анимация перекатывающейся жидкости (TrackLiquidProgressFill)
 *   в акцентном цвете пользователя, без бордеров, иконка загрузки убрана, процент смещён направо.
 * - При готовности 1080p: широкий бейдж без переносов слов с каноничной галочкой Check,
 *   минимальные отступы вокруг увеличенной иконки пересборки без фона.
 * - Все состояния имеют стабильную фиксированную геометрию.
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

  const isCompiling =
    compilingModel === model.filename || compileProgressItem !== undefined;
  const isCompileFinished = !!(
    compileProgressItem &&
    compileProgressItem.is_finished &&
    !compileProgressItem.error
  );
  const isCompileError = !!(compileProgressItem && compileProgressItem.error);

  const targetPercent = isCompiling
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(
            compileProgressItem?.percent ?? (isCompileFinished ? 100 : 8)
          )
        )
      )
    : 0;

  // Плавная интерполяция процентов и наполнения шкалы без резких скачков
  const [animatedPercent, setAnimatedPercent] = React.useState<number>(targetPercent);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!isCompiling) {
      setAnimatedPercent(0);
      return;
    }

    if (targetPercent === animatedPercent) return;

    const startVal = animatedPercent;
    const diff = targetPercent - startVal;
    const startTime = performance.now();
    const duration = Math.min(650, Math.max(320, Math.abs(diff) * 16));

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + diff * ease);
      setAnimatedPercent(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [targetPercent, isCompiling]);

  // 1. Активный процесс компиляции: жидкая акцентная заливка, без бордеров, процент строго справа
  if (isCompiling) {
    const percent = animatedPercent;

    return (
      <div
        className="model-compile-action"
        style={{
          position: "relative",
          width: "100%",
          height: 28,
          borderRadius: "var(--radius-control, 7px)",
          overflow: "hidden",
          boxSizing: "border-box",
          border: "none",
          background: isCompileError
            ? "var(--danger-surface)"
            : "rgba(255, 255, 255, 0.06)",
          display: "flex",
          alignItems: "center",
        }}
        title={isCompileError ? dict.settings.upscaling.errorLabel : `${percent}%`}
      >
        {/* Живая анимация перекатывающейся жидкости с SVG-мениском Безье в акцентном цвете темы */}
        {!isCompileError && (
          <TrackLiquidProgressFill
            progress={percent}
            status={isCompileFinished ? "completed" : "running"}
            className="track-liquid-fill--vivid"
          />
        )}

        {/* Контент: без иконки спиннера, процент смещён строго направо */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: isCompileError ? "center" : "flex-end",
            width: "100%",
            paddingRight: isCompileError ? 0 : 12,
            paddingLeft: isCompileError ? 8 : 0,
            lineHeight: 1,
            boxSizing: "border-box",
          }}
        >
          {isCompileError ? (
            <button
              type="button"
              onClick={onPrecompile}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "transparent",
                border: "none",
                color: "var(--danger-text)",
                cursor: "pointer",
                padding: 0,
                fontSize: "var(--fs-xs)",
                fontWeight: 600,
              }}
            >
              <X size={15} style={{ flexShrink: 0 }} />
              <span>{dict.settings.upscaling.errorLabel}</span>
            </button>
          ) : isCompileFinished ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "var(--fs-xs, 12px)",
                textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
              }}
            >
              <Check size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
              <span>100%</span>
            </span>
          ) : (
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
                fontSize: "var(--fs-xs, 12px)",
                fontWeight: 700,
                color: "#ffffff",
                textShadow: "0 1px 2px rgba(0, 0, 0, 0.6)",
              }}
            >
              {percent}%
            </span>
          )}
        </div>
      </div>
    );
  }

  // 2. Модель скомпилирована под 1080p: широкий бейдж без переносов текста + крупная иконка пересборки без фона с минимальным отступом
  if (model.has_engine_1080p) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          gap: 4,
        }}
      >
        {/* Бейдж статуса: без обводки-бордера, мягкий зелёный фон, свободная ширина без переносов слов */}
        <span
          style={{
            height: 28,
            padding: "0 8px",
            borderRadius: "var(--radius-control, 7px)",
            fontSize: "var(--fs-xs)",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            boxSizing: "border-box",
            lineHeight: 1,
            whiteSpace: "nowrap",
            border: "none",
            background: "rgba(46, 204, 113, 0.16)",
            color: "var(--success-text)",
            flex: 1,
            minWidth: 0,
          }}
          title={dict.settings.upscaling.trtReadyTitle}
        >
          <Check size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: "nowrap" }}>{dict.settings.upscaling.trtReadyBadge}</span>
        </span>

        {/* Иконка пересборки правее: без серого фона и рамки, минимальные отступы, крупная (17px) */}
        <button
          type="button"
          onClick={onPrecompile}
          disabled={!!compilingModel}
          aria-label={dict.settings.upscaling.trtRecompileTitle}
          title={dict.settings.upscaling.trtRecompileTitle}
          className="ui-reset-btn hover-bright"
          style={{
            width: 26,
            height: 28,
            minWidth: 26,
            minHeight: 28,
            padding: 0,
            margin: 0,
            border: "none",
            background: "transparent",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--text-muted)",
            flexShrink: 0,
            transition: "color var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth)",
          }}
        >
          <RefreshCw size={17} strokeWidth={2.2} />
        </button>
      </div>
    );
  }

  // 3. Модель еще не компилировалась (или устарела): комфортная кнопка запуска сборки
  return (
    <button
      type="button"
      className="btn btn--secondary model-compile-action"
      onClick={onPrecompile}
      disabled={!!compilingModel}
      title={
        model.engine_outdated
          ? dict.settings.upscaling.trtRebuildRequired
          : dict.settings.upscaling.trtCompileTitle
      }
      style={{
        width: "100%",
        height: 28,
        padding: "0 10px",
        borderRadius: "var(--radius-control, 7px)",
        fontSize: "var(--fs-xs)",
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        boxSizing: "border-box",
        lineHeight: 1,
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      {model.engine_outdated ? (
        <RefreshCw size={14} color="var(--warning-text)" />
      ) : (
        <Zap size={14} color="var(--accent-text, var(--accent))" />
      )}
      <span>
        {model.engine_outdated
          ? dict.settings.upscaling.trtRebuildBadge
          : dict.settings.upscaling.trtCompileBadge}
      </span>
    </button>
  );
});
