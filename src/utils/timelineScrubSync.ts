/**
 * Синхронный канал передачи позиции перетаскивания таймлайна (scrubbing)
 * без лишних ререндеров React-дерева панели управления.
 *
 * Позволяет тепловой карте и другим Canvas-индикаторам обновляться
 * синхронно с ползунком таймлайна в том же кадре анимации (`requestAnimationFrame`),
 * не дожидаясь редких ответов опроса `mpv` на паузе и прыжков по ключевым кадрам.
 */

/** Время (мс), в течение которого зафиксированная после отпускания позиция удерживается до подтверждения React. */
const COMMIT_HOLD_TTL_MS = 200;

export interface TimelineScrubState {
  /** Выполняется ли прямо сейчас перетаскивание ползунка таймлайна. */
  active: boolean;
  /** Целевая позиция в секундах при перетаскивании или фиксации. */
  position: number | null;
  /** Нормализованная координата по оси X [0..1] для точного совпадения с ползунком. */
  ratio: number | null;
  /** Длительность шкалы таймлайна в секундах на момент обновления. */
  duration: number;
  /** Признак только что зафиксированной цели после отпускания кнопки мыши. */
  committed: boolean;
  /** Момент времени (`Date.now()`) фиксации цели после отпускания мыши. */
  committedAtMs: number;
}

export type TimelineScrubListener = (state: TimelineScrubState) => void;

const INITIAL_SCRUB_STATE: TimelineScrubState = {
  active: false,
  position: null,
  ratio: null,
  duration: 0,
  committed: false,
  committedAtMs: 0,
};

/**
 * Ограничение числового значения в замкнутом интервале `[minValue, maxValue]`.
 */
function clampNumber(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

/**
 * Проверка и нормализация входных координат перетаскивания таймлайна.
 */
function normalizeScrubCoords(
  position: number,
  ratio: number,
  duration: number
): { position: number; ratio: number; duration: number } | null {
  if (
    !Number.isFinite(position) ||
    !Number.isFinite(ratio) ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return null;
  }

  const safeRatio = clampNumber(ratio, 0, 1);
  const safePosition = clampNumber(position, 0, duration);
  return {
    position: safePosition,
    ratio: safeRatio,
    duration,
  };
}

/**
 * Вычисление итоговой позиции и длительности для отрисовки тепловой карты
 * с учётом активного перетаскивания таймлайна.
 */
export function resolveWaveformRenderPosition(
  playerPosition: number,
  playerDuration: number,
  scrubState: TimelineScrubState | null,
  nowMs: number = Date.now()
): { position: number; duration: number } {
  const safeDuration =
    Number.isFinite(playerDuration) && playerDuration > 0
      ? playerDuration
      : scrubState && Number.isFinite(scrubState.duration) && scrubState.duration > 0
      ? scrubState.duration
      : 0;

  if (!scrubState) {
    return { position: playerPosition, duration: safeDuration };
  }

  const isFreshCommit =
    scrubState.committed && nowMs - scrubState.committedAtMs <= COMMIT_HOLD_TTL_MS;

  if (!scrubState.active && !isFreshCommit) {
    return { position: playerPosition, duration: safeDuration };
  }

  if (scrubState.ratio !== null && Number.isFinite(scrubState.ratio) && safeDuration > 0) {
    return {
      position: clampNumber(scrubState.ratio, 0, 1) * safeDuration,
      duration: safeDuration,
    };
  }

  if (scrubState.position !== null && Number.isFinite(scrubState.position)) {
    return {
      position: Math.max(0, scrubState.position),
      duration: safeDuration,
    };
  }

  return { position: playerPosition, duration: safeDuration };
}

/**
 * Шина синхронизации состояния перетаскивания таймлайна (паттерн Observer).
 */
export class TimelineScrubBus {
  private state: TimelineScrubState = { ...INITIAL_SCRUB_STATE };
  private readonly listeners = new Set<TimelineScrubListener>();

  /** Получить актуальный снимок состояния перетаскивания. */
  public getSnapshot(): TimelineScrubState {
    return this.state;
  }

  /** Подписаться на обновления позиции перетаскивания. Возвращает функцию отписки. */
  public subscribe(listener: TimelineScrubListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Обновить позицию во время активного перетаскивания ползунка. */
  public update(position: number, ratio: number, duration: number): void {
    const normalized = normalizeScrubCoords(position, ratio, duration);
    if (!normalized) {
      this.cancel();
      return;
    }

    this.state = {
      active: true,
      position: normalized.position,
      ratio: normalized.ratio,
      duration: normalized.duration,
      committed: false,
      committedAtMs: 0,
    };
    this.emit();
  }

  /** Зафиксировать целевую позицию при отпускании кнопки мыши до завершения seekTo. */
  public commit(position: number, ratio: number, duration: number, nowMs: number = Date.now()): void {
    const normalized = normalizeScrubCoords(position, ratio, duration);
    if (!normalized) {
      this.cancel();
      return;
    }

    this.state = {
      active: false,
      position: normalized.position,
      ratio: normalized.ratio,
      duration: normalized.duration,
      committed: true,
      committedAtMs: nowMs,
    };
    this.emit();
  }

  /** Снять удержание зафиксированной цели после коммита состояния в React без лишнего emit. */
  public acknowledgeCommit(): void {
    if (!this.state.active && this.state.committed) {
      this.state = { ...INITIAL_SCRUB_STATE };
    }
  }

  /** Немедленно сбросить состояние перетаскивания (отмена или размонтирование). */
  public cancel(): void {
    const wasEmpty =
      !this.state.active &&
      !this.state.committed &&
      this.state.position === null &&
      this.state.ratio === null;
    if (wasEmpty) return;

    this.state = { ...INITIAL_SCRUB_STATE };
    this.emit();
  }

  private emit(): void {
    const snapshot = this.state;
    this.listeners.forEach((listener) => {
      listener(snapshot);
    });
  }
}

/** Единый экземпляр шины перетаскивания для координации таймлайна и тепловой карты. */
export const timelineScrubSync = new TimelineScrubBus();
