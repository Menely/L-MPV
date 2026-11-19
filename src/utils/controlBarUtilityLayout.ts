/**
 * Все поддерживаемые идентификаторы кнопок правого блока утилит панели управления.
 */
export const ALL_UTILITY_BUTTON_IDS = [
  "speed",
  "skipOpening",
  "alwaysOnTop",
  "info",
  "mediaInfo",
  "visualizer",
  "playlist",
  "screenshot",
  "fullscreen",
] as const;

export type UtilityButtonId = (typeof ALL_UTILITY_BUTTON_IDS)[number];

/**
 * Стандартная раскладка правого блока утилит по карточкам (островкам):
 * Карточка 1 — основные утилиты, Карточка 2 — кнопка полноэкранного режима.
 */
export const DEFAULT_UTILITY_CARDS: UtilityButtonId[][] = [
  [
    "speed",
    "skipOpening",
    "alwaysOnTop",
    "info",
    "mediaInfo",
    "visualizer",
    "playlist",
    "screenshot",
  ],
  ["fullscreen"],
];

export const UTILITY_CARDS_STORAGE_KEY = "l-mpv-utility-button-cards";
export const UTILITY_CARDS_CHANGED_EVENT = "l-mpv-utility-cards-changed";

const VALID_ID_SET = new Set<string>(ALL_UTILITY_BUTTON_IDS);
const MAX_CARDS_COUNT = ALL_UTILITY_BUTTON_IDS.length;

/**
 * Проверяет, является ли строка допустимым идентификатором кнопки утилит.
 */
export function isUtilityButtonId(value: unknown): value is UtilityButtonId {
  return typeof value === "string" && VALID_ID_SET.has(value);
}

/**
 * Создаёт глубокую копию стандартной раскладки карточек.
 */
export function cloneDefaultUtilityCards(): UtilityButtonId[][] {
  return DEFAULT_UTILITY_CARDS.map((card) => [...card]);
}

/**
 * Нормализует пользовательскую раскладку карточек:
 * - удаляет неизвестные ID и дубликаты;
 * - докладывает недостающие кнопки, чтобы ни одна кнопка не потерялась;
 * - по умолчанию убирает пустые карточки (либо сохраняет их в режиме конструктора).
 */
export function normalizeUtilityCards(
  raw: unknown,
  allowEmptyCards = false,
): UtilityButtonId[][] {
  if (!Array.isArray(raw)) {
    return cloneDefaultUtilityCards();
  }

  const seen = new Set<UtilityButtonId>();
  const cards: UtilityButtonId[][] = [];

  for (const item of raw) {
    if (!Array.isArray(item)) continue;
    const card: UtilityButtonId[] = [];
    for (const id of item) {
      if (isUtilityButtonId(id) && !seen.has(id)) {
        seen.add(id);
        card.push(id);
      }
    }
    if (card.length > 0 || (allowEmptyCards && cards.length < MAX_CARDS_COUNT)) {
      cards.push(card);
    }
  }

  const missing = ALL_UTILITY_BUTTON_IDS.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    if (cards.length === 0) {
      return cloneDefaultUtilityCards();
    }
    const targetCardIndex = cards.findIndex((card) => card.length > 0);
    const index = targetCardIndex >= 0 ? targetCardIndex : 0;
    cards[index] = [...cards[index], ...missing];
  }

  if (!allowEmptyCards) {
    const nonEmpty = cards.filter((card) => card.length > 0);
    return nonEmpty.length > 0 ? nonEmpty : cloneDefaultUtilityCards();
  }

  return cards.length > 0 ? cards.slice(0, MAX_CARDS_COUNT) : cloneDefaultUtilityCards();
}

/**
 * Читает сохранённую раскладку карточек утилит из localStorage.
 */
export function getSavedUtilityCards(allowEmptyCards = false): UtilityButtonId[][] {
  try {
    const raw = localStorage.getItem(UTILITY_CARDS_STORAGE_KEY);
    if (!raw) {
      return cloneDefaultUtilityCards();
    }
    return normalizeUtilityCards(JSON.parse(raw), allowEmptyCards);
  } catch (error) {
    console.error("[ControlBarUtilityLayout] Ошибка чтения раскладки карточек:", error);
    return cloneDefaultUtilityCards();
  }
}

/**
 * Сохраняет раскладку карточек утилит в localStorage и уведомляет интерфейс.
 */
export function saveUtilityCards(
  cards: unknown,
  options: { allowEmptyCards?: boolean; notify?: boolean } = {},
): UtilityButtonId[][] {
  const { allowEmptyCards = false, notify = true } = options;
  const normalized = normalizeUtilityCards(cards, allowEmptyCards);
  try {
    localStorage.setItem(UTILITY_CARDS_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.error("[ControlBarUtilityLayout] Ошибка сохранения раскладки карточек:", error);
  }
  if (notify) {
    window.dispatchEvent(new Event(UTILITY_CARDS_CHANGED_EVENT));
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
  }
  return normalized;
}

/**
 * Сбрасывает раскладку карточек утилит к заводскому состоянию.
 */
export function resetUtilityCards(): UtilityButtonId[][] {
  return saveUtilityCards(cloneDefaultUtilityCards());
}

/**
 * Проверяет, совпадает ли текущая раскладка карточек со стандартной.
 */
export function isDefaultUtilityCards(cards: UtilityButtonId[][]): boolean {
  if (cards.length !== DEFAULT_UTILITY_CARDS.length) {
    return false;
  }
  for (let i = 0; i < DEFAULT_UTILITY_CARDS.length; i++) {
    const current = cards[i];
    const def = DEFAULT_UTILITY_CARDS[i];
    if (!current || current.length !== def.length) {
      return false;
    }
    for (let j = 0; j < def.length; j++) {
      if (current[j] !== def[j]) {
        return false;
      }
    }
  }
  return true;
}
