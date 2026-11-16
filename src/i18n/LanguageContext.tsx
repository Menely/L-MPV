/**
 * React Context и хук useTranslation для системы i18n плеера L-MPV.
 *
 * Обеспечивает реактивное обновление всех компонентов при смене языка
 * без перезагрузки страницы. Подписывается на событие l-mpv-settings-changed
 * для синхронизации со стандартным механизмом настроек плеера.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Locale, TranslationDict } from "./types";
import {
  getDict,
  getEffectiveLocale,
  saveLocale,
  getSavedLocale,
} from "./index";

// ─── Типы контекста ────────────────────────────────────────────────────────

interface LanguageContextValue {
  /** Текущая активная локаль. */
  locale: Locale;
  /** Словарь переводов текущей локали. */
  dict: TranslationDict;
  /**
   * Переключить язык интерфейса.
   * Сохраняет выбор в localStorage и обновляет все подписанные компоненты.
   */
  setLocale: (locale: Locale) => void;
}

// ─── Создание контекста ────────────────────────────────────────────────────

const LanguageContext = createContext<LanguageContextValue | null>(null);

// ─── Провайдер ─────────────────────────────────────────────────────────────

interface LanguageProviderProps {
  children: React.ReactNode;
}

/**
 * Провайдер локализации приложения.
 *
 * Оборачивает дерево компонентов и предоставляет текущий словарь переводов
 * через контекст. Подписывается на системное событие l-mpv-settings-changed
 * для синхронизации при внешнем изменении настроек (например, из файла).
 */
export function LanguageProvider({
  children,
}: LanguageProviderProps): React.ReactElement {
  const [locale, setLocaleState] = useState<Locale>(
    () => getEffectiveLocale(),
  );

  /**
   * Изменить локаль: обновить состояние React + персистировать в localStorage.
   */
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    saveLocale(next);
  }, []);

  /**
   * Синхронизация с внешними изменениями настроек — например, при загрузке
   * конфига из config/settings.json в UiSettingsSync.
   */
  useEffect(() => {
    const handleSettingsChanged = () => {
      const saved = getSavedLocale();
      if (saved && saved !== locale) {
        setLocaleState(saved);
      }
    };

    window.addEventListener(
      "l-mpv-settings-changed",
      handleSettingsChanged,
    );
    return () => {
      window.removeEventListener(
        "l-mpv-settings-changed",
        handleSettingsChanged,
      );
    };
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const dict = useMemo(() => getDict(locale), [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, dict, setLocale }),
    [locale, dict, setLocale],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// ─── Хук ───────────────────────────────────────────────────────────────────

/**
 * Хук для доступа к переводам в компонентах.
 *
 * Использование:
 * ```tsx
 * const { dict, locale, setLocale } = useTranslation();
 * // dict.controls.audioTracks → "Аудиодорожки" | "Audio Tracks"
 * ```
 *
 * Компонент автоматически перерисовывается при смене языка.
 */
export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error(
      "useTranslation: компонент должен находиться внутри LanguageProvider",
    );
  }
  return ctx;
}
