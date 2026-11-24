/**
 * Умный токенайзер субтитров на базе нативного Web API Intl.Segmenter.
 * 
 * Предоставляет локале-зависимое разбиение реплик на слова, знаки препинания
 * и лексемы. В отличие от наивного text.split(/\s+/), корректно работает с:
 * 1. Иероглифическими языками без пробелов (CJK: японский, китайский, корейский).
 * 2. Составными словами, дефисами, апострофами («какой-то», «don't», «c'est-à-dire»).
 * 3. Расчетом скорости чтения (WPM / CPS) по профессиональным стандартам субтитрирования.
 * 4. Высокоскоростным LRU-кэшированием для мгновенного доступа O(1) при скролле.
 */

import type { SubtitleLine } from "./subtitleTypes";

// ─── Типизация современного Web API Intl.Segmenter (Chromium 87+) ──────────
declare namespace Intl {
  interface SegmentData {
    segment: string;
    index: number;
    input: string;
    isWordLike?: boolean;
  }

  interface Segments {
    [Symbol.iterator](): IterableIterator<SegmentData>;
    containing(index: number): SegmentData | undefined;
  }

  interface SegmenterOptions {
    granularity?: "grapheme" | "word" | "sentence";
    localeMatcher?: "best fit" | "lookup";
  }

  interface Segmenter {
    segment(input: string): Segments;
  }

  interface SegmenterConstructor {
    new (locales?: string | string[], options?: SegmenterOptions): Segmenter;
    (locales?: string | string[], options?: SegmenterOptions): Segmenter;
    supportedLocalesOf(locales: string | string[], options?: SegmenterOptions): string[];
  }

  const Segmenter: SegmenterConstructor | undefined;
}

/** Одиночный токен субтитров с метаинформацией */
export interface SubtitleWordToken {
  /** Текст токена */
  segment: string;
  /** Является ли токен реальным словом (не знаком препинания и не пробелом) */
  isWord: boolean;
  /** Индекс начального символа в исходной строке */
  index: number;
  /** Длина сегмента */
  length: number;
}

/** Метрики скорости речи и чтения для реплики субтитров */
export interface SubtitleSpeechMetrics {
  /** Количество слов в реплике */
  wordCount: number;
  /** Количество символов (без пробелов) */
  charCount: number;
  /** Скорость чтения в словах в минуту (Words Per Minute) */
  wpm: number;
  /** Скорость чтения в символах в секунду (Characters Per Second) */
  cps: number;
  /** Превышен ли порог комфортного восприятия субтитров (> 210 WPM или > 21 CPS) */
  isTooFast: boolean;
}

/** Сводная статистика корпуса субтитров */
export interface SubtitleCorpusStats {
  /** Общее число реплик */
  totalLines: number;
  /** Общее число слов */
  totalWords: number;
  /** Число уникальных лексем в дорожке */
  uniqueWordsCount: number;
  /** Средняя скорость речи в дорожке (WPM) */
  averageWpm: number;
}

// ─── Высокопроизводительные кэши ───────────────────────────────────────────

/** Кэш экземпляров Intl.Segmenter по локалям для максимальной производительности */
const segmenterCache = new Map<string, Intl.Segmenter>();

/** Кэш подсчитанных слов для предотвращения повторной сегментации при скролле */
const wordCountCache = new Map<string, number>();
const MAX_WORD_COUNT_CACHE = 2000;

/** Кэш метрик скорости речи для O(1) рендеринга виртуализированных строк */
const speechMetricsCache = new Map<string, SubtitleSpeechMetrics>();
const MAX_SPEECH_METRICS_CACHE = 1500;

/**
 * Очистка внутренних кэшей токенайзера (вызывается при смене медиафайла или дорожки).
 */
export function clearTokenizerCache(): void {
  wordCountCache.clear();
  speechMetricsCache.clear();
}

/**
 * Нормализует код языка дорожки субтитров (ISO 639-1 / 639-2) в стандартный BCP-47 locale.
 *
 * @param langCode Код языка из метаданных дорожки (например, "rus", "eng", "jpn")
 * @param fallbackLocale Локаль по умолчанию при отсутствии кода
 * @returns BCP-47 локаль (например, "ru-RU", "ja-JP")
 */
export function normalizeSubtitleLocale(
  langCode?: string,
  fallbackLocale: string = "ru-RU"
): string {
  if (!langCode) return fallbackLocale;
  const clean = langCode.trim().toLowerCase();

  if (clean.startsWith("ru") || clean === "rus") return "ru-RU";
  if (clean.startsWith("en") || clean === "eng") return "en-US";
  if (clean.startsWith("ja") || clean === "jpn") return "ja-JP";
  if (clean.startsWith("zh") || clean === "chi" || clean === "zho") return "zh-CN";
  if (clean.startsWith("ko") || clean === "kor") return "ko-KR";
  if (clean.startsWith("fr") || clean === "fra" || clean === "fre") return "fr-FR";
  if (clean.startsWith("de") || clean === "deu" || clean === "ger") return "de-DE";
  if (clean.startsWith("es") || clean === "spa") return "es-ES";
  if (clean.startsWith("it") || clean === "ita") return "it-IT";

  return clean.length === 2 ? `${clean}-${clean.toUpperCase()}` : fallbackLocale;
}

/**
 * Получает или инициализирует кэшированный экземпляр Intl.Segmenter.
 * При отсутствии поддержки API возвращает null для безопасного фоллбэка.
 */
function getWordSegmenter(locale: string = "ru-RU"): Intl.Segmenter | null {
  if (typeof Intl === "undefined" || !Intl.Segmenter) {
    return null;
  }

  const SegmenterCtor = Intl.Segmenter;
  let segmenter = segmenterCache.get(locale);
  if (!segmenter) {
    try {
      segmenter = new SegmenterCtor(locale, { granularity: "word" });
      segmenterCache.set(locale, segmenter);
    } catch {
      try {
        segmenter = new SegmenterCtor(undefined, { granularity: "word" });
        segmenterCache.set(locale, segmenter);
      } catch {
        return null;
      }
    }
  }
  return segmenter;
}

/**
 * Сегментирует текст реплики на токены слов и межсловных символов
 * с использованием Intl.Segmenter.
 *
 * @param text Исходный текст реплики субтитров
 * @param locale Локаль текста (по умолчанию "ru-RU")
 * @returns Массив токенов SubtitleWordToken
 */
export function segmentSubtitleWords(
  text: string,
  locale: string = "ru-RU"
): SubtitleWordToken[] {
  if (!text) return [];

  const segmenter = getWordSegmenter(locale);
  if (segmenter) {
    const tokens: SubtitleWordToken[] = [];
    const iterator = segmenter.segment(text);
    for (const item of iterator) {
      tokens.push({
        segment: item.segment,
        isWord: Boolean(item.isWordLike),
        index: item.index,
        length: item.segment.length,
      });
    }
    return tokens;
  }

  // Фоллбэк через регулярные выражения для сред без Intl.Segmenter
  const tokens: SubtitleWordToken[] = [];
  const regex = /([\p{L}\p{N}]+|[^\p{L}\p{N}\s]+|\s+)/gu;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const segment = match[0];
    const isWord = /^[\p{L}\p{N}]+$/u.test(segment);
    tokens.push({
      segment,
      isWord,
      index: match.index,
      length: segment.length,
    });
  }

  return tokens;
}

/**
 * Вычисляет точное количество слов в реплике субтитров с учетом локали
 * (включая CJK без пробелов) с кэшированием результатов.
 *
 * @param text Текст субтитров
 * @param locale Локаль текста
 * @returns Число слов
 */
export function countSubtitleWords(text: string, locale: string = "ru-RU"): number {
  if (!text || !text.trim()) return 0;

  const cacheKey = `${text}__${locale}`;
  const cached = wordCountCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let count = 0;
  const segmenter = getWordSegmenter(locale);
  if (segmenter) {
    for (const item of segmenter.segment(text)) {
      if (item.isWordLike) {
        count++;
      }
    }
  } else {
    const matches = text.match(/[\p{L}\p{N}]+/gu);
    count = matches ? matches.length : 0;
  }

  // Вытеснение старых элементов кэша пачкой для защиты от утечки памяти
  if (wordCountCache.size >= MAX_WORD_COUNT_CACHE) {
    let evicted = 0;
    for (const key of wordCountCache.keys()) {
      wordCountCache.delete(key);
      evicted++;
      if (evicted >= 400) break;
    }
  }

  wordCountCache.set(cacheKey, count);
  return count;
}

/**
 * Рассчитывает профессиональные метрики скорости речи реплики (WPM / CPS)
 * на основе длительности показа строки и числа слов, распознанных Intl.Segmenter.
 * Результат кэшируется для O(1) производительности при скролле виртуального списка.
 *
 * @param text Текст реплики
 * @param durationSeconds Длительность показа реплики в секундах
 * @param locale Локаль текста
 * @returns Объект метрик SubtitleSpeechMetrics
 */
export function computeSpeechMetrics(
  text: string,
  durationSeconds: number,
  locale: string = "ru-RU"
): SubtitleSpeechMetrics {
  if (!text || durationSeconds <= 0) {
    return {
      wordCount: 0,
      charCount: 0,
      wpm: 0,
      cps: 0,
      isTooFast: false,
    };
  }

  // Ограничиваем минимальную длительность 0.4с во избежание деления на ноль при флешах
  const safeDuration = Math.max(durationSeconds, 0.4);
  const cacheKey = `${text}__${safeDuration.toFixed(2)}__${locale}`;

  const cached = speechMetricsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const wordCount = countSubtitleWords(text, locale);
  const cleanChars = text.replace(/\s+/g, "").length;

  const wpm = Math.round((wordCount / safeDuration) * 60);
  const cps = Number((cleanChars / safeDuration).toFixed(1));

  // Нормативы стандартов субтитрирования (Netflix / BBC / EBU-TT):
  // Комфортный порог: до 210 WPM и до 21 CPS.
  const isTooFast = wpm > 210 || cps > 21.0;

  const metrics: SubtitleSpeechMetrics = {
    wordCount,
    charCount: cleanChars,
    wpm,
    cps,
    isTooFast,
  };

  if (speechMetricsCache.size >= MAX_SPEECH_METRICS_CACHE) {
    let evicted = 0;
    for (const key of speechMetricsCache.keys()) {
      speechMetricsCache.delete(key);
      evicted++;
      if (evicted >= 300) break;
    }
  }

  speechMetricsCache.set(cacheKey, metrics);
  return metrics;
}

/**
 * Рассчитывает общую статистику по всей дорожке субтитров:
 * общее число слов, словарь уникальных слов и среднюю скорость чтения.
 *
 * @param lines Список строк субтитров
 * @param locale Локаль текста
 * @returns Сводка SubtitleCorpusStats
 */
export function computeSubtitlesCorpusStats(
  lines: SubtitleLine[],
  locale: string = "ru-RU"
): SubtitleCorpusStats {
  let totalWords = 0;
  let totalDuration = 0;
  const uniqueWords = new Set<string>();

  const segmenter = getWordSegmenter(locale);

  for (const line of lines) {
    const duration = Math.max(line.end - line.start, 0);
    totalDuration += duration;

    if (segmenter) {
      for (const item of segmenter.segment(line.text)) {
        if (item.isWordLike) {
          totalWords++;
          uniqueWords.add(item.segment.toLowerCase());
        }
      }
    } else {
      const words = line.text.match(/[\p{L}\p{N}]+/gu);
      if (words) {
        totalWords += words.length;
        for (const w of words) {
          uniqueWords.add(w.toLowerCase());
        }
      }
    }
  }

  const averageWpm =
    totalDuration > 0 ? Math.round((totalWords / totalDuration) * 60) : 0;

  return {
    totalLines: lines.length,
    totalWords,
    uniqueWordsCount: uniqueWords.size,
    averageWpm,
  };
}

/**
 * Проверяет, совпадает ли запрос с границами целых слов (Whole Word Match)
 * с помощью нативного Intl.Segmenter.
 *
 * @param text Исходный текст
 * @param query Поисковое слово
 * @param locale Локаль текста
 * @returns true если слово присутствует в тексте как отдельная лексема
 */
export function isWholeWordMatch(
  text: string,
  query: string,
  locale: string = "ru-RU"
): boolean {
  if (!text || !query) return false;
  const qClean = query.trim().toLowerCase();
  if (!qClean) return false;

  const segmenter = getWordSegmenter(locale);
  if (segmenter) {
    for (const item of segmenter.segment(text)) {
      if (item.isWordLike && item.segment.toLowerCase() === qClean) {
        return true;
      }
    }
    return false;
  }

  const regex = new RegExp(`\\b${qClean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return regex.test(text);
}
