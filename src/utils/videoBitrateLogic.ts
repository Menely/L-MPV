import type { MediaInfo, PlaybackState } from "../contexts/PlayerStateContext";

/**
 * Длительность одной корзины мгновенного битрейта видео в секундах (500 мс).
 */
export const VIDEO_BITRATE_BIN_SEC = 0.5;

/**
 * Порог скачка позиции воспроизведения (в секундах), определяющий перемотку (seek).
 */
const SEEK_JUMP_THRESHOLD_SEC = 1.5;

/**
 * Порог скачка в полусекундных корзинах (> 1.5 с = 3 корзины), определяющий перемотку.
 */
const SEEK_JUMP_THRESHOLD_BINS = 3;

/**
 * Ответ Tauri-команды `get_live_video_bitrate`.
 */
export interface LiveVideoBitrateResponse {
  /** Битрейт текущей полусекундной корзины в бит/с. */
  bitrate_bps: number;
  /** Хронологическая история битрейта в бит/с вплоть до текущей корзины. */
  history_bps: number[];
  /** Индекс текущей полусекундной корзины (`floor(position / 0.5)`). */
  bin_index: number;
  /** Длительность одной корзины в секундах (`0.5`). */
  bin_duration_sec: number;
  /** Признак достоверной готовности расчёта по пакетам. */
  ready: boolean;
}

/**
 * Безопасное определение наличия активного видеопотока в медиафайле.
 *
 * @param live Текущее состояние воспроизведения libmpv.
 * @param media Метаданные файла.
 * @returns true, если медиафайл содержит видеодорожку.
 */
export function checkHasVideoTrack(
  live: PlaybackState | null,
  media: MediaInfo | null,
): boolean {
  if (live?.has_video) return true;
  if (media?.has_video) return true;
  if (media?.video_codec && media.video_codec.trim() !== "") return true;
  if (media?.width && media.width > 0 && media?.height && media.height > 0) {
    return true;
  }
  return false;
}

/**
 * Извлечение целочисленного 1-базового номера активной видеодорожки из состояния `mpv`.
 *
 * @param live Динамическое состояние воспроизведения (`current_vid`).
 * @returns Номер активной видеодорожки (`>= 1`).
 */
export function resolveActiveVideoTrackId(live: PlaybackState | null): number {
  const raw = live?.current_vid?.trim();
  if (!raw) {
    return 1;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Определение актуальной временной позиции кадра на экране в секундах.
 *
 * @param explicitPosition Явно переданная позиция из прогресса плеера.
 * @param live Динамическое состояние воспроизведения.
 * @param media Метаданные медиафайла.
 * @returns Неотрицательная позиция в секундах.
 */
export function resolveEffectivePosition(
  explicitPosition: number | undefined,
  live: PlaybackState | null,
  media: MediaInfo | null,
): number {
  if (
    typeof explicitPosition === "number" &&
    Number.isFinite(explicitPosition) &&
    explicitPosition >= 0
  ) {
    return explicitPosition;
  }
  if (
    typeof live?.position === "number" &&
    Number.isFinite(live.position) &&
    live.position >= 0
  ) {
    return live.position;
  }
  if (
    typeof media?.position === "number" &&
    Number.isFinite(media.position) &&
    media.position >= 0
  ) {
    return media.position;
  }
  return 0;
}

/**
 * Преобразование позиции времени (в секундах) в индекс полусекундной корзины битрейта.
 *
 * @param positionSec Позиция воспроизведения в секундах.
 * @returns Неотрицательный целочисленный индекс корзины.
 */
export function positionToBitrateBin(positionSec: number): number {
  if (!Number.isFinite(positionSec) || positionSec <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor(positionSec / VIDEO_BITRATE_BIN_SEC));
}

/**
 * Вычисление канонической временной точки (в секундах) для полусекундной корзины.
 *
 * @param binIndex Индекс полусекундной корзины.
 * @returns Позиция начала корзины в секундах.
 */
export function binToSamplePosition(binIndex: number): number {
  if (!Number.isFinite(binIndex) || binIndex <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor(binIndex)) * VIDEO_BITRATE_BIN_SEC;
}

/**
 * Проверка, произошёл ли скачок позиции воспроизведения в секундах.
 *
 * @param prevPositionSec Предыдущая зафиксированная позиция в секундах.
 * @param nextPositionSec Новая позиция в секундах.
 * @returns true, если зафиксирована перемотка.
 */
export function isSeekJump(
  prevPositionSec: number | null,
  nextPositionSec: number,
): boolean {
  if (prevPositionSec === null || !Number.isFinite(prevPositionSec)) {
    return false;
  }
  const delta = nextPositionSec - prevPositionSec;
  return delta < -0.35 || delta > SEEK_JUMP_THRESHOLD_SEC;
}

/**
 * Проверка, произошёл ли скачок индекса полусекундной корзины (перемотка вперёд или назад).
 *
 * @param prevBin Предыдущий индекс корзины.
 * @param nextBin Новый индекс корзины.
 * @returns true, если переход между корзинами является перемоткой.
 */
export function isSeekBinJump(
  prevBin: number | null,
  nextBin: number,
): boolean {
  if (prevBin === null || !Number.isFinite(prevBin) || prevBin < 0) {
    return false;
  }
  const delta = nextBin - prevBin;
  return delta < 0 || delta > SEEK_JUMP_THRESHOLD_BINS;
}

/**
 * Нормализация массива точек истории битрейта для компонента `BitrateSparkline`.
 *
 * @param historyBps Исходный массив значений битрейта в бит/с.
 * @param limit Максимальное число точек графика.
 * @returns Подготовленный массив положительных целых значений (минимум 2 точки при наличии данных).
 */
export function normalizeSparklineHistory(
  historyBps: readonly number[],
  limit: number,
): number[] {
  const maxPoints = Math.max(2, Math.floor(limit || 25));
  const cleaned = historyBps
    .filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0)
    .map((v) => Math.max(1, Math.round(v)));

  if (cleaned.length === 0) {
    return [];
  }
  if (cleaned.length === 1) {
    return [cleaned[0], cleaned[0]];
  }
  return cleaned.length > maxPoints
    ? cleaned.slice(cleaned.length - maxPoints)
    : cleaned;
}

/**
 * Резервное вычисление битрейта (для потоковых URL или при недоступности пакетного анализатора)
 * без инерционного EMA-сглаживания.
 *
 * @param live Динамическое состояние libmpv.
 * @param media Метаданные медиафайла.
 * @param lastValidBitrate Последнее подтверждённое значение текущей позиции.
 * @returns Оценка битрейта в бит/с.
 */
export function resolveFallbackBitrate(
  live: PlaybackState | null,
  media: MediaInfo | null,
  lastValidBitrate: number,
): number {
  if (!checkHasVideoTrack(live, media)) {
    return 0;
  }

  const liveVideoBitrate = live?.video_bitrate ?? 0;
  if (Number.isFinite(liveVideoBitrate) && liveVideoBitrate > 0) {
    return Math.round(liveVideoBitrate);
  }

  if (Number.isFinite(lastValidBitrate) && lastValidBitrate > 0) {
    return Math.round(lastValidBitrate);
  }

  const mediaVideoBitrate = media?.video_bitrate ?? 0;
  if (Number.isFinite(mediaVideoBitrate) && mediaVideoBitrate > 0) {
    return Math.round(mediaVideoBitrate);
  }

  const totalBitrate = media?.total_bitrate ?? 0;
  const audioBitrate = live?.audio_bitrate ?? media?.audio_bitrate ?? 0;
  if (Number.isFinite(totalBitrate) && totalBitrate > 0) {
    const estimated = Math.max(0, totalBitrate - audioBitrate);
    return Math.round(estimated > 0 ? estimated : totalBitrate);
  }

  return 0;
}
