// ─── Утилиты форматирования и перевода отчётов MediaInfo ────

export const KEY_TRANSLATIONS: Record<string, string> = {
  // Общее
  "Unique ID": "Уникальный идентификатор",
  "Complete name": "Полное имя",
  "Format": "Формат",
  "Format version": "Версия формата",
  "Format profile": "Профиль формата",
  "Format settings": "Настройки формата",
  "Format settings, CABAC": "Параметр CABAC формата",
  "Format settings, Reference frames": "Параметр RefFrames формата",
  "Format settings, ReFrames": "Параметр RefFrames формата",
  "Format settings, BVOP": "Параметр BVOP формата",
  "Format settings, Matrix": "Параметр матрицы формата",
  "Format settings, GOP": "Параметр GOP формата",
  "Codec ID": "Идентификатор кодека",
  "Codec ID/Info": "Информация об идентификаторе кодека",
  "File size": "Размер файла",
  "Duration": "Продолжительность",
  "Overall bit rate": "Общий битрейт",
  "Overall bit rate mode": "Вид общего битрейта",
  "Frame rate": "Частота кадров",
  "Frame rate mode": "Режим частоты кадров",
  "Writing application": "Программа кодирования",
  "Writing library": "Библиотека кодирования",
  "Writing front-end": "Оболочка программы кодирования",
  "Encoded date": "Дата кодирования",
  "Tagged date": "Дата маркировки",
  "File modification date/time": "Дата изменения файла",
  "File creation date/time": "Дата создания файла",

  // Видео
  "ID": "Идентификатор",
  "Format/Info": "Формат/Информация",
  "Bit rate mode": "Вид битрейта",
  "Bit rate": "Битрейт",
  "Nominal bit rate": "Номинальный битрейт",
  "Maximum bit rate": "Максимальный битрейт",
  "Minimum bit rate": "Минимальный битрейт",
  "Width": "Ширина",
  "Height": "Высота",
  "Display aspect ratio": "Соотношение сторон",
  "Original display aspect ratio": "Исходное соотношение сторон",
  "Pixel aspect ratio": "Соотношение сторон пикселей",
  "Color space": "Цветовое пространство",
  "Chroma subsampling": "Цветовая субдискретизация",
  "Bit depth": "Битовая глубина",
  "Scan type": "Тип развёртки",
  "Bits/(Pixel*Frame)": "Бит/(Пиксели*Кадры)",
  "Stream size": "Размер потока",
  "Title": "Заголовок",
  "Default": "По умолчанию",
  "Forced": "Принудительно",
  "Color range": "Цветовой диапазон",
  "Color primaries": "Основные цвета",
  "Transfer characteristics": "Характеристики трансфера",
  "Matrix coefficients": "Коэффициенты матрицы",

  // Аудио
  "Commercial name": "Коммерческое название",
  "Channel(s)": "Каналы",
  "Channel layout": "Расположение каналов",
  "Channel positions": "Расположение каналов",
  "Sampling rate": "Частота дискретизации",
  "Compression mode": "Метод сжатия",
  "Compression ratio": "Степень сжатия",
  "Language": "Язык",
  "Service kind": "Вид сервиса",
  "Dialogue Normalization": "Нормализация звука речи",
  "Dialogue Normalization, Mean": "Нормализация звука речи, среднее",
  "Dialogue Normalization, Minimum": "Нормализация звука речи, минимум",
  "Dialogue Normalization, Maximum": "Нормализация звука речи, максимум",
  "Dialnorm": "Нормализация звука речи",
  "Dialnorm, Mean": "Нормализация звука речи, среднее",
  "Dialnorm, Minimum": "Нормализация звука речи, минимум",
  "Dialnorm, Maximum": "Нормализация звука речи, максимум",
  "Audio delay": "Задержка звука",
  "Delay relative to video": "Задержка относительно видео",
  "Video delay": "Задержка видео",

  // Текст / Субтитры
  "Element count": "Количество элементов",
  "Count of elements": "Количество элементов",
  "Count of audio streams": "Количество аудиопотоков",
  "Count of text streams": "Количество потоков субтитров",
  "Source duration": "Продолжительность источника",
  "Source stream size": "Размер потока источника",
};

export const SECTION_TRANSLATIONS: Record<string, string> = {
  "General": "Общее",
  "Video": "Видео",
  "Audio": "Аудио",
  "Text": "Текст",
  "Menu": "Меню",
  "Chapters": "Главы",
};

export const WORD_MAP: Record<string, string> = {
  Yes: "Да",
  No: "Нет",
  Constant: "Постоянный",
  Variable: "Переменный",
  Progressive: "Прогрессивная",
  Interlaced: "Чересстрочная",
  Lossy: "С потерями",
  Lossless: "Без потерь",
  Japanese: "Японский",
  Russian: "Русский",
  English: "Английский",
  German: "Немецкий",
  French: "Французский",
  Spanish: "Испанский",
  Chinese: "Китайский",
  Korean: "Корейский",
  Italian: "Итальянский",
  Ukrainian: "Украинский",
  Belarusian: "Белорусский",
  Polish: "Польский",
  Portuguese: "Португальский",
  Turkish: "Турецкий",
  Arabic: "Арабский",
  FPS: "кадра/сек",
  "kb/s": "Кбит/сек",
  "Mb/s": "Мбит/сек",
  "Gb/s": "Гбит/сек",
  "b/s": "бит/сек",
  GiB: "Гбайт",
  MiB: "Мбайт",
  KiB: "Кбайт",
  kHz: "кГц",
  Hz: "Гц",
  bits: "бит",
  bit: "бит",
  bytes: "байт",
  byte: "байт",
  min: "м.",
  h: "ч.",
  s: "с.",
  ms: "мс",
};

const WORD_REGEX = /\b(Yes|No|Constant|Variable|Progressive|Interlaced|Lossy|Lossless|Japanese|Russian|English|German|French|Spanish|Chinese|Korean|Italian|Ukrainian|Belarusian|Polish|Portuguese|Turkish|Arabic|FPS|kb\/s|Mb\/s|Gb\/s|b\/s|GiB|MiB|KiB|kHz|Hz|bits|bit|bytes|byte|min|h|s|ms)\b/g;

/** Форматирование числительных с учётом правил русского языка */
export function formatPlural(num: number, one: string, few: string, many: string): string {
  const mod10 = num % 10;
  const mod100 = num % 100;
  if (mod10 === 1 && mod100 !== 11) return `${num} ${one}`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${num} ${few}`;
  return `${num} ${many}`;
}

/** Высокоскоростной перевод значений в один регулярный проход */
export function translateValue(val: string): string {
  return val
    .replace(/(\d+)\s+channels\b/g, (_m, n) => formatPlural(parseInt(n, 10), "канал", "канала", "каналов"))
    .replace(/(\d+)\s+frames\b/g, (_m, n) => formatPlural(parseInt(n, 10), "кадр", "кадра", "кадров"))
    .replace(/\bchannels\b/g, "канала")
    .replace(/\bchannel\b/g, "канал")
    .replace(/\bframes\b/g, "кадра")
    .replace(/\bpixels\b/g, "пикселей")
    .replace(WORD_REGEX, (m) => WORD_MAP[m] || m)
    .replace(/(\d+)\.(\d+)(?=\s*(?:Гбайт|Мбайт|Кбайт|кГц|Гц|кадра\/сек|кадров\/сек|\(24000\/1001\)))/g, "$1,$2");
}

export interface ParsedMediaInfoLine {
  id: number;
  text: string;
  isSection: boolean;
}

export interface ParsedMediaInfoReport {
  rawText: string;
  lines: ParsedMediaInfoLine[];
}

/** Парсинг и форматирование строк отчёта MediaInfo */
export function parseMediaInfoLines(rawText: string, useRussian: boolean): ParsedMediaInfoReport {
  if (!rawText) return { rawText: "", lines: [] };

  const rawLines = rawText.split("\n");
  const linesOut: ParsedMediaInfoLine[] = [];
  const textOut: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].replace(/\r$/, "");
    const trimmed = line.trim();

    if (!trimmed && linesOut.length === 0) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      if (!trimmed) {
        linesOut.push({ id: i, text: "", isSection: false });
        textOut.push("");
        continue;
      }

      let sectionName = trimmed;
      if (useRussian) {
        const match = trimmed.match(/^([A-Za-z]+)(\s+#\d+)?$/);
        if (match) {
          const base = SECTION_TRANSLATIONS[match[1]] || match[1];
          sectionName = match[2] ? `${base}${match[2]}` : base;
        }
      }
      linesOut.push({ id: i, text: sectionName, isSection: true });
      textOut.push(sectionName);
    } else {
      const rawKey = line.substring(0, colonIdx).trim();
      const rawVal = line.substring(colonIdx + 1).trim();
      if (!rawKey && !rawVal) continue;

      const key = useRussian ? KEY_TRANSLATIONS[rawKey] || rawKey : rawKey;
      const val = useRussian ? translateValue(rawVal) : rawVal;
      const formattedLine = `${key.padEnd(38)} : ${val}`;

      linesOut.push({ id: i, text: formattedLine, isSection: false });
      textOut.push(formattedLine);
    }
  }

  return {
    rawText: textOut.join("\n"),
    lines: linesOut,
  };
}
