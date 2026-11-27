import type { SystemDiagnosticsInfo } from "../../lib/systemDiagnostics";

const INVALID_PATHS = new Set(["missing", "Отсутствует", "Missing"]);
const UNKNOWN_VERSIONS = new Set(["unknown", "Не определён"]);

/**
 * Форматирует строку версии FFmpeg, удаляя лишний шум сборки.
 */
export function formatFfmpegVersion(
  info: SystemDiagnosticsInfo | null,
  labels: { ffmpegInstalledUnknown: string; statusMissing: string },
): string {
  if (!info) return "";
  const raw =
    info.ffmpeg_version === "installed_unknown"
      ? labels.ffmpegInstalledUnknown
      : info.ffmpeg_version === "missing"
      ? labels.statusMissing
      : info.ffmpeg_version ?? "";

  return raw
    .replace(/^ffmpeg\s+version\s+/i, "")
    .replace(/\s+Copyright\s*\(c\).*/i, "")
    .replace(/-essentials_build/i, "")
    .replace(/-www\.gyan\.dev/i, " (gyan.dev)")
    .trim();
}

/**
 * Форматирует отображаемую версию движка libmpv.
 */
export function formatLibmpvVersion(
  info: SystemDiagnosticsInfo | null,
  labels: { libmpvActiveFallback: string; libmpvNotLoaded: string },
): string {
  if (!info) return "";
  if (info.libmpv_version === "active_fallback") {
    return labels.libmpvActiveFallback;
  }
  if (info.libmpv_version === "not_loaded") {
    return labels.libmpvNotLoaded;
  }
  return info.libmpv_version;
}

/**
 * Форматирует версию MediaInfo без избыточного префикса библиотеки.
 */
export function formatMediainfoVersion(info: SystemDiagnosticsInfo): string {
  return info.mediainfo_version.replace(/^MediaInfoLib\s*-\s*/i, "").trim();
}

/**
 * Возвращает перечень доступных рантаймов нейросетевого апскейлинга.
 */
export function collectAiRuntimes(info: SystemDiagnosticsInfo): string[] {
  const runtimes: string[] = [];
  if (info.tensorrt_available) runtimes.push("TensorRT 11");
  if (info.directml_available) runtimes.push("DirectML");
  if (info.aji_available) runtimes.push("aji v0.25.0");
  return runtimes;
}

/**
 * Проверяет, доступен ли путь для копирования и открытия в Проводнике.
 */
export function hasActionablePath(path?: string): path is string {
  return Boolean(path && !INVALID_PATHS.has(path));
}

/**
 * Проверяет, определена ли строка версии среды выполнения WebView2.
 */
export function hasKnownWebViewVersion(version?: string): version is string {
  return Boolean(version && !UNKNOWN_VERSIONS.has(version));
}
