/**
 * Точка входа системы интернационализации (i18n) плеера L-MPV.
 *
 * Экспортирует словари локалей, функцию форматирования t() и утилиты
 * для управления текущей локалью. Не имеет React-зависимостей —
 * чистая логика, используемая как в компонентах, так и в утилитах.
 */

import type { Locale, TranslationDict } from "./types";
import { ru } from "./locales/ru";
import { en } from "./locales/en";

/** Реестр всех доступных словарей. */
const locales: Record<Locale, TranslationDict> = { ru, en };

/** Ключ хранения выбранного языка в localStorage. */
const LOCALE_STORAGE_KEY = "l-mpv-language";

/**
 * Возвращает сохранённую пользователем локаль из localStorage.
 * При отсутствии значения возвращает undefined.
 */
export function getSavedLocale(): Locale | undefined {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === "ru" || raw === "en") return raw;
  } catch {
    // localStorage недоступен
  }
  return undefined;
}

/**
 * Сохраняет выбранную пользователем локаль в localStorage и
 * рассылает событие обновления настроек по всему приложению.
 */
export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
  } catch {
    // localStorage недоступен
  }
}

let cachedSystemLocale: Locale | null = null;

/**
 * Автоопределяет предпочтительную локаль системы пользователя.
 * Если среди языков системы или браузера присутствует русский язык, возвращает "ru",
 * для остальных международных локалей возвращает английский ("en").
 */
export function detectSystemLocale(): Locale {
  if (cachedSystemLocale) return cachedSystemLocale;
  try {
    const lang = navigator.language?.toLowerCase() ?? "";
    if (lang.startsWith("ru")) {
      cachedSystemLocale = "ru";
      return "ru";
    }
    if (Array.isArray(navigator.languages)) {
      if (navigator.languages.some((l) => l.toLowerCase().startsWith("ru"))) {
        cachedSystemLocale = "ru";
        return "ru";
      }
    }
  } catch {
    // navigator недоступен
  }
  cachedSystemLocale = "en";
  return "en";
}

/**
 * Возвращает эффективную локаль: явно сохранённую пользователем,
 * либо автоматически определённую по языку системы пользователя.
 */
export function getEffectiveLocale(): Locale {
  return getSavedLocale() ?? detectSystemLocale();
}

/**
 * Возвращает словарь переводов для указанной локали.
 * Типобезопасный доступ к любому полю словаря через TypeScript.
 */
export function getDict(locale: Locale): TranslationDict {
  return locales[locale];
}

export type { Locale, TranslationDict };
export { locales };
