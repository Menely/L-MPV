/**
 * Реестр всех пунктов, доступных для размещения в ПКМ-меню.
 *
 * Каждый дескриптор описывает пункт статически — без привязки
 * к конкретному экземпляру ContextMenu и без React-зависимостей,
 * чтобы его можно было безопасно использовать в конфигураторе.
 */

import type { TranslationDict } from "../i18n/types";

/** Уникальный идентификатор пункта меню. */
export type MenuItemId =
  | "open_file"
  | "audio_track"
  | "subtitle_track"
  | "chapters"
  | "aspect_ratio"
  | "rotation"
  | "ambient"
  | "speed"
  | "upscale"
  | "repeat_mode"
  | "shuffle"
  | "always_on_top"
  | "screenshot"
  | "media_info"
  | "detailed_media_info"
  | "presets"
  | "time_position"
  | "time_format"
  | "control_bar_style"
  | "control_buttons_visibility"
  | "settings";

/** Статический дескриптор пункта меню для конфигуратора. */
export interface MenuItemDescriptor {
  id: MenuItemId;
  label: string;
  iconName: string;
  hasSubmenu: boolean;
  description: string;
}

/** Полный реестр всех поддерживаемых пунктов ПКМ-меню. */
export const MENU_ITEM_REGISTRY: MenuItemDescriptor[] = [
  { id: "open_file", label: "Открыть файл", iconName: "FolderOpen", hasSubmenu: true, description: "Открыть файл с диска или из истории последних файлов" },
  { id: "audio_track", label: "Аудиодорожка", iconName: "AudioLines", hasSubmenu: true, description: "Выбор активной аудиодорожки из доступных в файле" },
  { id: "subtitle_track", label: "Субтитры", iconName: "Subtitles", hasSubmenu: true, description: "Выбор субтитров или загрузка внешнего файла субтитров" },
  { id: "chapters", label: "Главы", iconName: "BookOpen", hasSubmenu: false, description: "Открыть панель навигации по главам файла" },
  { id: "aspect_ratio", label: "Соотношение сторон", iconName: "Monitor", hasSubmenu: true, description: "Принудительное задание пропорций видеокадра (16:9, 4:3, …)" },
  { id: "rotation", label: "Поворот видео", iconName: "RotateCw", hasSubmenu: true, description: "Поворот видео на 0°, 90°, 180° или 270°" },
  { id: "ambient", label: "Подсветка полос", iconName: "Sparkles", hasSubmenu: true, description: "Режим Ambient Light: выкл / размытие / цветной фон" },
  { id: "speed", label: "Скорость воспроизведения", iconName: "Zap", hasSubmenu: true, description: "Скорость воспроизведения: 0.25× – 2×" },
  { id: "upscale", label: "Апскейлинг", iconName: "Cpu", hasSubmenu: true, description: "Выбор нейросетевых моделей апскейлинга и качества видео" },
  { id: "repeat_mode", label: "Режим повтора", iconName: "Repeat", hasSubmenu: true, description: "Без повтора / повтор файла / повтор плейлиста" },
  { id: "shuffle", label: "Случайный порядок", iconName: "Shuffle", hasSubmenu: false, description: "Переключить случайный порядок воспроизведения плейлиста" },
  { id: "always_on_top", label: "Поверх всех окон", iconName: "Pin", hasSubmenu: false, description: "Закрепить окно плеера поверх всех приложений" },
  { id: "screenshot", label: "Сохранить кадр", iconName: "Camera", hasSubmenu: false, description: "Сохранить текущий кадр в папку скриншотов (горячая клавиша S)" },
  { id: "media_info", label: "Информация о файле", iconName: "Info", hasSubmenu: false, description: "Открыть компактное окно с техническими данными медиафайла" },
  { id: "detailed_media_info", label: "L-MPV MediaInfo", iconName: "FileText", hasSubmenu: false, description: "Открыть детальное окно MediaInfo (Shift+F10)" },
  { id: "presets", label: "Пресеты", iconName: "SlidersHorizontal", hasSubmenu: true, description: "Выбор пользовательских и встроенных пресетов настроек" },
  { id: "time_position", label: "Расположение времени", iconName: "Clock", hasSubmenu: true, description: "Выбор позиции отображения таймера в интерфейсе" },
  { id: "time_format", label: "Формат времени", iconName: "Timer", hasSubmenu: true, description: "Формат таймера: прошедшее / оставшееся / до конца / …" },
  { id: "control_bar_style", label: "Стиль панели", iconName: "LayoutTemplate", hasSubmenu: true, description: "Стиль нижней панели управления плеером" },
  { id: "control_buttons_visibility", label: "Кнопки панели управления", iconName: "Eye", hasSubmenu: true, description: "Настройка видимости кнопок на нижней панели управления" },
  { id: "settings", label: "Настройки", iconName: "Settings", hasSubmenu: false, description: "Открыть окно настроек L-MPV (F2)" },
];

/** Константная хэш-таблица дескрипторов для мгновенного поиска за O(1). */
export const MENU_ITEM_MAP: ReadonlyMap<MenuItemId, MenuItemDescriptor> = new Map(
  MENU_ITEM_REGISTRY.map((desc) => [desc.id, desc]),
);

/** Набор допустимых строковых идентификаторов пунктов для валидации. */
export const VALID_MENU_ITEM_IDS: ReadonlySet<string> = new Set(
  MENU_ITEM_REGISTRY.map((desc) => desc.id),
);

/** Проверяет, является ли переданная строка допустимым MenuItemId. */
export function isMenuItemId(id: unknown): id is MenuItemId {
  return typeof id === "string" && VALID_MENU_ITEM_IDS.has(id);
}

/** Вспомогательная функция быстрого поиска дескриптора по ID за O(1). */
export function getMenuItemDescriptor(
  id: MenuItemId,
): MenuItemDescriptor | undefined {
  return MENU_ITEM_MAP.get(id);
}

/** Возвращает локализованное название и описание пункта меню. */
export function getLocalizedMenuItem(
  dict: TranslationDict,
  descriptor: MenuItemDescriptor,
): { label: string; description: string } {
  const reg = dict.settings.cmenuReg;
  switch (descriptor.id) {
    case "open_file":
      return { label: reg.openFile, description: reg.openFileDesc };
    case "audio_track":
      return { label: reg.audioTrack, description: reg.audioTrackDesc };
    case "subtitle_track":
      return { label: reg.subTrack, description: reg.subTrackDesc };
    case "chapters":
      return { label: reg.chapters, description: reg.chaptersDesc };
    case "aspect_ratio":
      return { label: reg.aspect, description: reg.aspectDesc };
    case "rotation":
      return { label: reg.rotation, description: reg.rotationDesc };
    case "ambient":
      return { label: reg.ambient, description: reg.ambientDesc };
    case "speed":
      return { label: reg.speed, description: reg.speedDesc };
    case "upscale":
      return { label: reg.upscale, description: reg.upscaleDesc };
    case "repeat_mode":
      return { label: reg.repeat, description: reg.repeatDesc };
    case "shuffle":
      return { label: reg.shuffle, description: reg.shuffleDesc };
    case "always_on_top":
      return { label: reg.top, description: reg.topDesc };
    case "screenshot":
      return { label: reg.screenshot, description: reg.screenshotDesc };
    case "media_info":
      return { label: reg.fileInfo, description: reg.fileInfoDesc };
    case "detailed_media_info":
      return { label: reg.mediaInfo, description: reg.mediaInfoDesc };
    case "presets":
      return { label: reg.presets, description: reg.presetsDesc };
    case "time_position":
      return { label: reg.timePos, description: reg.timePosDesc };
    case "time_format":
      return { label: reg.timeFmt, description: reg.timeFmtDesc };
    case "control_bar_style":
      return { label: reg.barStyle, description: reg.barStyleDesc };
    case "control_buttons_visibility":
      return { label: reg.controlBtns, description: reg.controlBtnsDesc };
    case "settings":
      return { label: reg.settings, description: reg.settingsDesc };
    default:
      return { label: descriptor.label, description: descriptor.description };
  }
}

