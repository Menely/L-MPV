export interface HotkeyAction {
  id: string;
  label: string;
  defaultKeys: string[];
  category: string;
}

export const DEFAULT_HOTKEYS: Record<string, string[]> = {
  togglePause: ["Space", "MouseLeft"],
  seekBack: ["ArrowLeft"],
  seekForward: ["ArrowRight"],
  volumeUp: ["ArrowUp"],
  volumeDown: ["ArrowDown"],
  toggleMute: ["KeyM"],
  frameBack: ["Comma"],
  frameForward: ["Period"],
  screenshot: ["KeyS"],
  copyFrame: ["Ctrl+KeyC"],
  fileInfo: ["KeyI"],
  detailedMediaInfo: ["Shift+F10"],
  playlist: ["KeyL", "KeyP"],
  fullscreen: ["KeyF", "F11", "MouseLeftDoubleClick"],
  openFile: ["Ctrl+KeyO", "KeyO"],
  resetZoom: ["Digit0"],
  openContextMenu: ["MouseRight"],
  cycleAudioTrack: ["KeyA", "MouseLeft"],
  toggleAudioMenu: ["MouseRight"],
  cycleSubTrack: ["KeyV", "MouseLeft"],
  toggleSubMenu: ["MouseRight"],
  searchSubtitles: ["Ctrl+KeyF"],
  playlistPrev: ["PageUp"],
  playlistNext: ["PageDown"],
  seekBack10: [],
  seekForward10: [],
  skipOpening: [],
  toggleRepeat: ["KeyR"],
  toggleShuffle: [],
  alwaysOnTop: ["KeyT"],
  speedUp: ["BracketRight"],
  speedDown: ["BracketLeft"],
  speedReset: ["Backspace"],
  toggleAmbient: ["KeyB"],
  toggleLanguage: ["Ctrl+KeyL"],
  chapters: ["KeyC"],
  settings: ["F2"],
  toggleVisualizer: ["KeyW"],
  cycleVisualizerMode: ["Shift+KeyW"],
  rotateVideo: ["Alt+KeyR"],
  upscaleStats: ["Ctrl+KeyJ"],
  upscaleOff: ["Shift+Digit1"],
  upscaleNet1: ["Shift+Digit2"],
  upscaleNet2: ["Shift+Digit3"],
  upscaleNet3: ["Shift+Digit4"],
  upscaleNet4: ["Shift+Digit5"],
  upscaleNet5: ["Shift+Digit6"],
  upscaleNet6: ["Shift+Digit7"],
  upscaleNet7: ["Shift+Digit8"],
  upscaleNet8: ["Shift+Digit9"],
  upscaleNet9: ["Shift+Digit0"],
};

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  // Воспроизведение
  { id: "togglePause", label: "Воспроизведение / Пауза", defaultKeys: DEFAULT_HOTKEYS["togglePause"], category: "playback" },
  { id: "toggleRepeat", label: "Режим повтора", defaultKeys: DEFAULT_HOTKEYS["toggleRepeat"], category: "playback" },
  { id: "toggleShuffle", label: "Случайный порядок", defaultKeys: DEFAULT_HOTKEYS["toggleShuffle"], category: "playback" },

  // Перемотка
  { id: "seekBack", label: "Перемотка назад (-5 сек)", defaultKeys: DEFAULT_HOTKEYS["seekBack"], category: "seeking" },
  { id: "seekForward", label: "Перемотка вперед (+5 сек)", defaultKeys: DEFAULT_HOTKEYS["seekForward"], category: "seeking" },
  { id: "seekBack10", label: "Перемотка назад (-10 сек)", defaultKeys: DEFAULT_HOTKEYS["seekBack10"], category: "seeking" },
  { id: "seekForward10", label: "Перемотка вперед (+10 сек)", defaultKeys: DEFAULT_HOTKEYS["seekForward10"], category: "seeking" },
  { id: "skipOpening", label: "Перемотка опенинга", defaultKeys: DEFAULT_HOTKEYS["skipOpening"], category: "seeking" },
  { id: "frameBack", label: "Кадр назад", defaultKeys: DEFAULT_HOTKEYS["frameBack"], category: "seeking" },
  { id: "frameForward", label: "Кадр вперед", defaultKeys: DEFAULT_HOTKEYS["frameForward"], category: "seeking" },

  // Аудио
  { id: "volumeUp", label: "Громкость +5%", defaultKeys: DEFAULT_HOTKEYS["volumeUp"], category: "audio" },
  { id: "volumeDown", label: "Громкость -5%", defaultKeys: DEFAULT_HOTKEYS["volumeDown"], category: "audio" },
  { id: "toggleMute", label: "Включить / отключить звук", defaultKeys: DEFAULT_HOTKEYS["toggleMute"], category: "audio" },
  { id: "cycleAudioTrack", label: "Смена аудиодорожки", defaultKeys: DEFAULT_HOTKEYS["cycleAudioTrack"], category: "audio" },
  { id: "toggleAudioMenu", label: "Меню аудиодорожек", defaultKeys: DEFAULT_HOTKEYS["toggleAudioMenu"], category: "audio" },

  // Субтитры
  { id: "cycleSubTrack", label: "Смена субтитров", defaultKeys: DEFAULT_HOTKEYS["cycleSubTrack"], category: "subtitles" },
  { id: "toggleSubMenu", label: "Меню субтитров", defaultKeys: DEFAULT_HOTKEYS["toggleSubMenu"], category: "subtitles" },
  { id: "searchSubtitles", label: "Поиск по субтитрам", defaultKeys: DEFAULT_HOTKEYS["searchSubtitles"], category: "subtitles" },

  // Скорость
  { id: "speedUp", label: "Увеличить скорость", defaultKeys: DEFAULT_HOTKEYS["speedUp"], category: "speed" },
  { id: "speedDown", label: "Уменьшить скорость", defaultKeys: DEFAULT_HOTKEYS["speedDown"], category: "speed" },
  { id: "speedReset", label: "Сбросить скорость (1.0x)", defaultKeys: DEFAULT_HOTKEYS["speedReset"], category: "speed" },

  // Интерфейс и Окно
  { id: "fullscreen", label: "Полноэкранный режим", defaultKeys: DEFAULT_HOTKEYS["fullscreen"], category: "interface" },
  { id: "alwaysOnTop", label: "Поверх всех окон", defaultKeys: DEFAULT_HOTKEYS["alwaysOnTop"], category: "interface" },
  { id: "openContextMenu", label: "Открыть контекстное меню", defaultKeys: DEFAULT_HOTKEYS["openContextMenu"], category: "interface" },
  { id: "fileInfo", label: "Информация о файле", defaultKeys: DEFAULT_HOTKEYS["fileInfo"], category: "interface" },
  { id: "detailedMediaInfo", label: "Свойства MediaInfo (MPC)", defaultKeys: DEFAULT_HOTKEYS["detailedMediaInfo"], category: "interface" },
  { id: "chapters", label: "Главы видео (Chapters)", defaultKeys: DEFAULT_HOTKEYS["chapters"], category: "interface" },
  { id: "settings", label: "Открыть настройки", defaultKeys: DEFAULT_HOTKEYS["settings"], category: "interface" },
  { id: "toggleVisualizer", label: "Вкл/Выкл аудио-визуализатор", defaultKeys: DEFAULT_HOTKEYS["toggleVisualizer"], category: "interface" },
  { id: "cycleVisualizerMode", label: "Сменить стиль визуализатора", defaultKeys: DEFAULT_HOTKEYS["cycleVisualizerMode"], category: "interface" },
  { id: "rotateVideo", label: "Поворот видео на 90°", defaultKeys: DEFAULT_HOTKEYS["rotateVideo"], category: "interface" },
  { id: "resetZoom", label: "Сброс масштаба видео (100%)", defaultKeys: DEFAULT_HOTKEYS["resetZoom"], category: "interface" },
  { id: "screenshot", label: "Сохранить кадр", defaultKeys: DEFAULT_HOTKEYS["screenshot"], category: "interface" },
  { id: "copyFrame", label: "Копировать кадр в буфер", defaultKeys: DEFAULT_HOTKEYS["copyFrame"], category: "interface" },
  { id: "toggleAmbient", label: "Blur (выключить / включить)", defaultKeys: DEFAULT_HOTKEYS["toggleAmbient"], category: "interface" },
  { id: "toggleLanguage", label: "Переключить язык интерфейса", defaultKeys: DEFAULT_HOTKEYS["toggleLanguage"], category: "interface" },

  // Плейлист
  { id: "playlist", label: "Боковая панель плейлиста", defaultKeys: DEFAULT_HOTKEYS["playlist"], category: "playlist" },
  { id: "playlistPrev", label: "Предыдущий файл в плейлисте", defaultKeys: DEFAULT_HOTKEYS["playlistPrev"], category: "playlist" },
  { id: "playlistNext", label: "Следующий файл в плейлисте", defaultKeys: DEFAULT_HOTKEYS["playlistNext"], category: "playlist" },
  { id: "openFile", label: "Открыть файл", defaultKeys: DEFAULT_HOTKEYS["openFile"], category: "playlist" },

  // Апскейлинг 4K (до 9 моделей)
  { id: "upscaleStats", label: "Статус и статистика 4K AI", defaultKeys: DEFAULT_HOTKEYS["upscaleStats"], category: "upscaling" },
  { id: "upscaleOff", label: "Апскейлинг: Выключить", defaultKeys: DEFAULT_HOTKEYS["upscaleOff"], category: "upscaling" },
  { id: "upscaleNet1", label: "Апскейлинг: Нейросеть #1", defaultKeys: DEFAULT_HOTKEYS["upscaleNet1"], category: "upscaling" },
  { id: "upscaleNet2", label: "Апскейлинг: Нейросеть #2", defaultKeys: DEFAULT_HOTKEYS["upscaleNet2"], category: "upscaling" },
  { id: "upscaleNet3", label: "Апскейлинг: Нейросеть #3", defaultKeys: DEFAULT_HOTKEYS["upscaleNet3"], category: "upscaling" },
  { id: "upscaleNet4", label: "Апскейлинг: Нейросеть #4", defaultKeys: DEFAULT_HOTKEYS["upscaleNet4"], category: "upscaling" },
  { id: "upscaleNet5", label: "Апскейлинг: Нейросеть #5", defaultKeys: DEFAULT_HOTKEYS["upscaleNet5"], category: "upscaling" },
  { id: "upscaleNet6", label: "Апскейлинг: Нейросеть #6", defaultKeys: DEFAULT_HOTKEYS["upscaleNet6"], category: "upscaling" },
  { id: "upscaleNet7", label: "Апскейлинг: Нейросеть #7", defaultKeys: DEFAULT_HOTKEYS["upscaleNet7"], category: "upscaling" },
  { id: "upscaleNet8", label: "Апскейлинг: Нейросеть #8", defaultKeys: DEFAULT_HOTKEYS["upscaleNet8"], category: "upscaling" },
  { id: "upscaleNet9", label: "Апскейлинг: Нейросеть #9", defaultKeys: DEFAULT_HOTKEYS["upscaleNet9"], category: "upscaling" },
];

export const VIDEO_MOUSE_ACTIONS = new Set([
  "togglePause",
  "fullscreen",
  "openContextMenu",
  "fileInfo",
  "detailedMediaInfo",
  "chapters",
  "settings",
  "screenshot",
  "resetZoom",
  "copyFrame",
  "toggleRepeat",
  "playlist",
]);

export const AUDIO_TRACK_MOUSE_ACTIONS = new Set(["cycleAudioTrack", "toggleAudioMenu"]);
export const SUB_TRACK_MOUSE_ACTIONS = new Set(["cycleSubTrack", "toggleSubMenu"]);

/**
 * Проверка совместимости контекстов мыши.
 * Действия на полотне видео и на кнопках тулбара не мешают друг другу.
 */
export function isMouseScopeCompatible(actionA: string, actionB: string): boolean {
  if (VIDEO_MOUSE_ACTIONS.has(actionA) && VIDEO_MOUSE_ACTIONS.has(actionB)) {
    return false; // Конфликт внутри контекста полотна видео
  }
  if (AUDIO_TRACK_MOUSE_ACTIONS.has(actionA) && AUDIO_TRACK_MOUSE_ACTIONS.has(actionB)) {
    return false; // Конфликт внутри контекста кнопки аудио
  }
  if (SUB_TRACK_MOUSE_ACTIONS.has(actionA) && SUB_TRACK_MOUSE_ACTIONS.has(actionB)) {
    return false; // Конфликт внутри контекста кнопки субтитров
  }
  return true;
}

const HOTKEYS_MIGRATION_V2_KEY = "l-mpv-hotkeys-migrated-v2";

/**
 * Одноразовая нормализация устаревших профилей для плавного перехода со старых версий.
 * Запускается строго один раз, фиксируя флаг HOTKEYS_MIGRATION_V2_KEY.
 */
function migrateLegacyHotkeys(migrated: Record<string, string[]>): Record<string, string[]> {
  const isMigrated = localStorage.getItem(HOTKEYS_MIGRATION_V2_KEY) === "true";
  if (isMigrated) {
    return migrated;
  }

  // Миграция бинда playlist: добавление KeyP при наличии только KeyL, если KeyP не занят другим действием
  if (migrated["playlist"] && !migrated["playlist"].includes("KeyP")) {
    const keyPTaken = Object.entries(migrated).some(
      ([act, codes]) => act !== "playlist" && codes.includes("KeyP")
    );
    if (!keyPTaken) {
      migrated["playlist"] = [...migrated["playlist"], "KeyP"];
    }
  }

  // Миграция устаревшего бинда KeyC на Ctrl+KeyC для copyFrame
  if (migrated["copyFrame"]?.length === 1 && migrated["copyFrame"][0] === "KeyC") {
    migrated["copyFrame"] = ["Ctrl+KeyC"];
  }

  // Миграция устаревшего бинда KeyO на Ctrl+KeyO для openFile
  if (migrated["openFile"]?.length === 1 && migrated["openFile"][0] === "KeyO") {
    migrated["openFile"] = ["Ctrl+KeyO", "KeyO"];
  }

  // Нормализация привязок мыши со старых версий: ЛКМ — смена дорожки, ПКМ — вызов меню
  for (const menuKey of ["toggleAudioMenu", "toggleSubMenu"]) {
    migrated[menuKey] = (migrated[menuKey] || ["MouseRight"]).filter(
      (k) => k !== "MouseLeft"
    );
    if (!migrated[menuKey].length) migrated[menuKey] = ["MouseRight"];
  }
  for (const [cycleKey, defKey] of [
    ["cycleAudioTrack", "KeyA"],
    ["cycleSubTrack", "KeyV"],
  ]) {
    const list = migrated[cycleKey] || [defKey];
    migrated[cycleKey] = list.includes("MouseLeft")
      ? list
      : [...list, "MouseLeft"];
  }

  // Гарантируем наличие базовых мышиных действий при переходе со старых версий (если мышиных биндов вообще не было)
  const hasAnyMouseBinding = Object.values(migrated).some(codes => 
    codes.some(c => c.startsWith("Mouse"))
  );
  if (!hasAnyMouseBinding) {
    if (!migrated["togglePause"]?.includes("MouseLeft")) {
      migrated["togglePause"] = [...(migrated["togglePause"] || []), "MouseLeft"];
    }
    if (!migrated["fullscreen"]?.includes("MouseLeftDoubleClick")) {
      migrated["fullscreen"] = [...(migrated["fullscreen"] || []), "MouseLeftDoubleClick"];
    }
    if (!migrated["openContextMenu"]?.includes("MouseRight")) {
      migrated["openContextMenu"] = [...(migrated["openContextMenu"] || []), "MouseRight"];
    }
  }

  try {
    localStorage.setItem(
      "l-mpv-custom-hotkeys",
      JSON.stringify(migrated)
    );
    localStorage.setItem(HOTKEYS_MIGRATION_V2_KEY, "true");
  } catch {
    // Игнорируем ограничения доступа к хранилищу
  }

  return migrated;
}

export function getCustomHotkeys(): Record<string, string[]> {
  try {
    const saved = localStorage.getItem("l-mpv-custom-hotkeys");
    if (saved) {
      const parsed = JSON.parse(saved);
      const migrated: Record<string, string[]> = {};
      
      // Считываем сохранённые пользователем настройки горячих клавиш.
      // Для существующих действий строго сохраняем выбор пользователя (включая пустые списки).
      for (const key of Object.keys(DEFAULT_HOTKEYS)) {
        if (parsed[key] !== undefined) {
          if (typeof parsed[key] === "string") {
            migrated[key] = [parsed[key]];
          } else if (Array.isArray(parsed[key])) {
            migrated[key] = parsed[key];
          } else {
            migrated[key] = [...DEFAULT_HOTKEYS[key]];
          }
        }
      }

      // Сохраняем пользовательские действия, если они выходят за рамки базового DEFAULT_HOTKEYS
      for (const key of Object.keys(parsed)) {
        if (migrated[key] === undefined && Array.isArray(parsed[key])) {
          migrated[key] = parsed[key];
        }
      }

      // Для новых действий, добавленных в обновлениях (отсутствующих в сохранённом конфиге пользователя):
      // берём дефолтные клавиши, НО ИСКЛЮЧАЕМ те, которые пользователь уже назначил другим действиям!
      for (const key of Object.keys(DEFAULT_HOTKEYS)) {
        if (migrated[key] === undefined) {
          const rawDefaults = DEFAULT_HOTKEYS[key] || [];
          const safeDefaults = rawDefaults.filter((code) => {
            const isMouse = code.startsWith("Mouse");
            // Проверяем, не занята ли эта клавиша пользователем в другом действии
            for (const [otherAction, otherCodes] of Object.entries(migrated)) {
              if (otherAction === key) continue;
              if (isMouse && isMouseScopeCompatible(key, otherAction)) continue;
              if (otherCodes.includes(code)) {
                return false; // Клавиша занята пользователем — не перезаписываем!
              }
            }
            return true;
          });
          migrated[key] = safeDefaults;
        }
      }

      // Гарантируем наличие мышиных биндов по умолчанию для видео-полотна,
      // если пользователь явно не переназначил кнопку мыши на другое действие видео.
      const hasAnyVideoMouseLeft = Array.from(VIDEO_MOUSE_ACTIONS).some(
        (act) => act !== "togglePause" && (migrated[act] || []).includes("MouseLeft")
      );
      if (!hasAnyVideoMouseLeft && !(migrated["togglePause"] || []).includes("MouseLeft")) {
        migrated["togglePause"] = [...(migrated["togglePause"] || ["Space"]), "MouseLeft"];
      }

      const hasAnyVideoMouseDoubleClick = Array.from(VIDEO_MOUSE_ACTIONS).some(
        (act) => act !== "fullscreen" && (migrated[act] || []).includes("MouseLeftDoubleClick")
      );
      if (!hasAnyVideoMouseDoubleClick && !(migrated["fullscreen"] || []).includes("MouseLeftDoubleClick")) {
        migrated["fullscreen"] = [...(migrated["fullscreen"] || ["KeyF", "F11"]), "MouseLeftDoubleClick"];
      }

      const hasAnyVideoMouseRight = Array.from(VIDEO_MOUSE_ACTIONS).some(
        (act) => act !== "openContextMenu" && (migrated[act] || []).includes("MouseRight")
      );
      if (!hasAnyVideoMouseRight && !(migrated["openContextMenu"] || []).includes("MouseRight")) {
        migrated["openContextMenu"] = [...(migrated["openContextMenu"] || []), "MouseRight"];
      }

      // Устраняем случайные дубликаты клавиш внутри каждого действия
      for (const key of Object.keys(migrated)) {
        migrated[key] = Array.from(new Set(migrated[key]));
      }

      return migrateLegacyHotkeys(migrated);
    }
  } catch (e) {
    console.error("Ошибка чтения горячих клавиш:", e);
  }
  
  // Возвращаем копию дефолтных
  const copy: Record<string, string[]> = {};
  for (const key in DEFAULT_HOTKEYS) {
    copy[key] = [...DEFAULT_HOTKEYS[key]];
  }
  return copy;
}

export function saveCustomHotkeys(hotkeys: Record<string, string[]>) {
  try {
    localStorage.setItem("l-mpv-custom-hotkeys", JSON.stringify(hotkeys));
    localStorage.setItem(HOTKEYS_MIGRATION_V2_KEY, "true");
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
  } catch (e) {
    console.error("Ошибка сохранения горячих клавиш:", e);
  }
}

export function resetCustomHotkeys() {
  try {
    localStorage.removeItem("l-mpv-custom-hotkeys");
    localStorage.setItem(HOTKEYS_MIGRATION_V2_KEY, "true");
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
  } catch (e) {
    console.error("Ошибка сброса горячих клавиш:", e);
  }
}

export function resetSingleHotkey(actionId: string, currentHotkeys: Record<string, string[]>): Record<string, string[]> {
  const updated = { ...currentHotkeys };
  const defaultCodes = DEFAULT_HOTKEYS[actionId] || [];

  // Удаляем восстанавливаемые дефолтные клавиши из других действий, чтобы не создавать конфликтов
  const isMouse = (code: string) => code.startsWith("Mouse");
  for (const otherId of Object.keys(updated)) {
    if (otherId === actionId) continue;
    updated[otherId] = (updated[otherId] || []).filter((code) => {
      if (!defaultCodes.includes(code)) return true;
      if (isMouse(code) && isMouseScopeCompatible(actionId, otherId)) return true;
      return false; // Дефолтный код возвращён владельцу
    });
  }

  updated[actionId] = [...defaultCodes];
  saveCustomHotkeys(updated);
  return updated;
}

/**
 * Shift+1 зарезервировано за выключением апскейлинга (upscaleOff).
 * AI-моделям (upscaleNet*) и остальным действиям его назначать нельзя.
 */
export const RESERVED_UPSCALE_OFF_CODE = "Shift+Digit1";
export const UPSCALE_OFF_ACTION_ID = "upscaleOff";

export function isCodeReservedForUpscaleOff(code: string, actionId: string): boolean {
  return code === RESERVED_UPSCALE_OFF_CODE && actionId !== UPSCALE_OFF_ACTION_ID;
}

function formatSingleKey(part: string, locale?: string): string {
  if (!part) return "";
  const isEn = locale === "en";
  if (part === "MouseLeft") return isEn ? "LMB" : "ЛКМ";
  if (part === "MouseRight") return isEn ? "RMB" : "ПКМ";
  if (part === "MouseMiddle") return isEn ? "MMB" : "СКМ";
  if (part === "MouseLeftDoubleClick") return isEn ? "2x LMB" : "ЛКМ 2x";
  
  if (part.startsWith("MouseButton")) {
    return (isEn ? "Mouse " : "Мышь ") + part.replace("MouseButton", "");
  }
  if (part.startsWith("Key")) {
    return part.replace("Key", "");
  }
  if (part.startsWith("Digit")) {
    return part.replace("Digit", "");
  }
  if (part === "Space") return isEn ? "Space" : "Пробел";
  if (part === "ArrowLeft") return "←";
  if (part === "ArrowRight") return "→";
  if (part === "ArrowUp") return "↑";
  if (part === "ArrowDown") return "↓";
  if (part === "Comma") return ",";
  if (part === "Period") return ".";
  if (part === "BracketLeft") return "[";
  if (part === "BracketRight") return "]";
  if (part === "Semicolon") return ";";
  if (part === "Quote") return "'";
  if (part === "Backquote") return "`";
  if (part === "Minus") return "-";
  if (part === "Equal") return "=";
  if (part === "Slash") return "/";
  if (part === "Backslash") return "\\";
  if (part === "Backspace") return "Backspace";
  if (part === "Tab") return "Tab";
  if (part === "Enter") return "Enter";
  if (part === "Escape") return "Esc";
  if (part === "Delete") return "Del";
  if (part === "Insert") return "Ins";
  if (part === "Home") return "Home";
  if (part === "End") return "End";
  if (part === "PageUp") return "Page Up";
  if (part === "PageDown") return "Page Down";
  if (part === "CapsLock") return "Caps";
  if (part.startsWith("Numpad")) {
    if (part === "NumpadAdd") return "Num +";
    if (part === "NumpadSubtract") return "Num -";
    if (part === "NumpadMultiply") return "Num *";
    if (part === "NumpadDivide") return "Num /";
    if (part === "NumpadDecimal") return "Num .";
    if (part === "NumpadEnter") return "Num Enter";
    return part.replace("Numpad", "Num ");
  }
  if (part === "ControlLeft" || part === "ControlRight" || part === "Ctrl") return "Ctrl";
  if (part === "ShiftLeft" || part === "ShiftRight" || part === "Shift") return "Shift";
  if (part === "AltLeft" || part === "AltRight" || part === "Alt") return "Alt";
  if (part === "MetaLeft" || part === "MetaRight" || part === "Win") return "Win";
  
  return part;
}

export function parseBindCode(bindCode: string): {
  reqCtrl: boolean;
  reqShift: boolean;
  reqAlt: boolean;
  mainKey: string;
} {
  const parts = bindCode.split("+");
  const reqCtrl = parts.includes("Ctrl");
  const reqShift = parts.includes("Shift");
  const reqAlt = parts.includes("Alt");
  const nonModifiers = parts.filter((p) => p !== "Ctrl" && p !== "Shift" && p !== "Alt");
  const mainKey = nonModifiers.join("+") || (bindCode.endsWith("+") ? "+" : parts[parts.length - 1]);
  return { reqCtrl, reqShift, reqAlt, mainKey };
}

export function getKeyDisplay(currentCode: string, locale?: string): string {
  if (!currentCode) return "—";
  const { reqCtrl, reqShift, reqAlt, mainKey } = parseBindCode(currentCode);
  const formatted: string[] = [];
  if (reqCtrl) formatted.push("Ctrl");
  if (reqShift) formatted.push("Shift");
  if (reqAlt) formatted.push("Alt");
  if (mainKey) formatted.push(formatSingleKey(mainKey, locale));
  return formatted.length ? formatted.join(" + ") : currentCode;
}

const QWERTY_TO_CYRILLIC: Record<string, string> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з",
  a: "ф", s: "ы", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л", l: "д",
  z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь",
};

/**
 * Проверка нажатия события клавиши на соответствие строке бинда (с учетом Ctrl, Shift, Alt).
 */
export function isKeyboardEventMatch(e: KeyboardEvent, bindCode: string): boolean {
  if (bindCode.startsWith("Mouse")) return false;

  const { reqCtrl, reqShift, reqAlt, mainKey } = parseBindCode(bindCode);

  const ctrlPressed = Boolean(e.ctrlKey || e.metaKey);
  if (reqCtrl !== ctrlPressed) return false;
  if (reqShift !== Boolean(e.shiftKey)) return false;
  if (reqAlt !== Boolean(e.altKey)) return false;

  // 1. Прямое соответствие физического кода клавиши (не зависит от раскладки RU/EN/...)
  if (e.code && e.code === mainKey) return true;

  // 2. Соответствие значения символа клавиши без учёта регистра
  const keyVal = e.key ? e.key.toLowerCase() : "";
  const mainKeyLower = mainKey.toLowerCase();
  if (keyVal && keyVal === mainKeyLower) return true;

  // 3. Латинские клавиши KeyA-KeyZ (с поддержкой русской раскладки в Chromium)
  if (mainKey.startsWith("Key")) {
    const letter = mainKey.replace(/^Key/, "").toLowerCase();
    if (keyVal === letter) return true;
    if (QWERTY_TO_CYRILLIC[letter] && keyVal === QWERTY_TO_CYRILLIC[letter]) return true;
  }

  // 4. Цифры Digit0-Digit9 и Numpad0-Numpad9
  if (mainKey.startsWith("Digit") && keyVal === mainKey.replace(/^Digit/, "")) return true;
  if (mainKey.startsWith("Numpad") && keyVal === mainKey.replace(/^Numpad/, "")) return true;

  // 5. Специальные знаки препинания на русской и английской раскладках
  if (mainKey === "Comma" && (keyVal === "б" || keyVal === ",")) return true;
  if (mainKey === "Period" && (keyVal === "ю" || keyVal === ".")) return true;
  if (mainKey === "BracketLeft" && (keyVal === "х" || keyVal === "[")) return true;
  if (mainKey === "BracketRight" && (keyVal === "ъ" || keyVal === "]")) return true;
  if (mainKey === "Semicolon" && (keyVal === "ж" || keyVal === ";")) return true;
  if (mainKey === "Quote" && (keyVal === "э" || keyVal === "'")) return true;
  if (mainKey === "Backquote" && (keyVal === "ё" || keyVal === "`")) return true;
  if (mainKey === "Minus" && keyVal === "-") return true;
  if (mainKey === "Equal" && (keyVal === "=" || keyVal === "+")) return true;
  if (mainKey === "Slash" && (keyVal === "/" || keyVal === ".")) return true;
  if (mainKey === "Backslash" && (keyVal === "\\" || keyVal === "/")) return true;

  return false;
}
