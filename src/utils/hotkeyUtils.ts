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
  playlist: ["KeyL"],
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
  { id: "toggleAmbient", label: "Подсветка полос (Ambient Light: off / blur / color / ambilight)", defaultKeys: DEFAULT_HOTKEYS["toggleAmbient"], category: "interface" },
  { id: "toggleLanguage", label: "Переключить язык интерфейса", defaultKeys: DEFAULT_HOTKEYS["toggleLanguage"], category: "interface" },

  // Плейлист
  { id: "playlist", label: "Боковая панель плейлиста", defaultKeys: DEFAULT_HOTKEYS["playlist"], category: "playlist" },
  { id: "playlistPrev", label: "Предыдущий файл в плейлисте", defaultKeys: DEFAULT_HOTKEYS["playlistPrev"], category: "playlist" },
  { id: "playlistNext", label: "Следующий файл в плейлисте", defaultKeys: DEFAULT_HOTKEYS["playlistNext"], category: "playlist" },
  { id: "openFile", label: "Открыть файл", defaultKeys: DEFAULT_HOTKEYS["openFile"], category: "playlist" },

  // Апскейлинг 4K
  { id: "upscaleStats", label: "Статус и статистика 4K AI", defaultKeys: DEFAULT_HOTKEYS["upscaleStats"], category: "upscaling" },
  { id: "upscaleOff", label: "Апскейлинг: Выключить", defaultKeys: DEFAULT_HOTKEYS["upscaleOff"], category: "upscaling" },
  { id: "upscaleNet1", label: "Апскейлинг: Нейросеть #1", defaultKeys: DEFAULT_HOTKEYS["upscaleNet1"], category: "upscaling" },
  { id: "upscaleNet2", label: "Апскейлинг: Нейросеть #2", defaultKeys: DEFAULT_HOTKEYS["upscaleNet2"], category: "upscaling" },
  { id: "upscaleNet3", label: "Апскейлинг: Нейросеть #3", defaultKeys: DEFAULT_HOTKEYS["upscaleNet3"], category: "upscaling" },
  { id: "upscaleNet4", label: "Апскейлинг: Нейросеть #4", defaultKeys: DEFAULT_HOTKEYS["upscaleNet4"], category: "upscaling" },
  { id: "upscaleNet5", label: "Апскейлинг: Нейросеть #5", defaultKeys: DEFAULT_HOTKEYS["upscaleNet5"], category: "upscaling" },
  { id: "upscaleNet6", label: "Апскейлинг: Нейросеть #6", defaultKeys: DEFAULT_HOTKEYS["upscaleNet6"], category: "upscaling" },
];

export function getCustomHotkeys(): Record<string, string[]> {
  try {
    const saved = localStorage.getItem("l-mpv-custom-hotkeys");
    if (saved) {
      const parsed = JSON.parse(saved);
      const migrated: Record<string, string[]> = {};
      
      // Миграция старых строковых форматов
      for (const key of Object.keys(DEFAULT_HOTKEYS)) {
        if (parsed[key] !== undefined) {
          if (typeof parsed[key] === "string") {
            migrated[key] = [parsed[key]];
          } else if (Array.isArray(parsed[key])) {
            migrated[key] = parsed[key];
          } else {
            migrated[key] = [...DEFAULT_HOTKEYS[key]];
          }
        } else {
          migrated[key] = [...DEFAULT_HOTKEYS[key]];
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

      // Инициализация мышиных биндов для аудио и субтитров, если они были пустыми
      if (!migrated["toggleAudioMenu"] || migrated["toggleAudioMenu"].length === 0) {
        migrated["toggleAudioMenu"] = ["MouseRight"];
      }
      if (!migrated["toggleSubMenu"] || migrated["toggleSubMenu"].length === 0) {
        migrated["toggleSubMenu"] = ["MouseRight"];
      }
      if (migrated["cycleAudioTrack"] && !migrated["cycleAudioTrack"].includes("MouseLeft")) {
        migrated["cycleAudioTrack"] = [...migrated["cycleAudioTrack"], "MouseLeft"];
      }
      if (migrated["cycleSubTrack"] && !migrated["cycleSubTrack"].includes("MouseLeft")) {
        migrated["cycleSubTrack"] = [...migrated["cycleSubTrack"], "MouseLeft"];
      }

      // Гарантируем наличие базовых мышиных действий, если конфиг был сохранен
      // в старой версии, где привязки мыши еще не сохранялись в localStorage
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

      return migrated;
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
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
  } catch (e) {
    console.error("Ошибка сохранения горячих клавиш:", e);
  }
}

export function resetCustomHotkeys() {
  try {
    localStorage.removeItem("l-mpv-custom-hotkeys");
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
  } catch (e) {
    console.error("Ошибка сброса горячих клавиш:", e);
  }
}

export function resetSingleHotkey(actionId: string, currentHotkeys: Record<string, string[]>): Record<string, string[]> {
  const updated = { ...currentHotkeys };
  updated[actionId] = [...(DEFAULT_HOTKEYS[actionId] || [])];
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
  if (part === "Backspace") return "Backspace";
  if (part === "PageUp") return "Page Up";
  if (part === "PageDown") return "Page Down";
  if (part === "ControlLeft" || part === "ControlRight" || part === "Ctrl") return "Ctrl";
  if (part === "ShiftLeft" || part === "ShiftRight" || part === "Shift") return "Shift";
  if (part === "AltLeft" || part === "AltRight" || part === "Alt") return "Alt";
  if (part === "MetaLeft" || part === "MetaRight" || part === "Win") return "Win";
  
  return part;
}

export function getKeyDisplay(currentCode: string, locale?: string): string {
  if (!currentCode) return "—";
  const parts = currentCode.split("+");
  return parts.map((p) => formatSingleKey(p, locale)).join(" + ");
}

/**
 * Проверка нажатия события клавиши на соответствие строке бинда (с учетом Ctrl, Shift, Alt).
 */
export function isKeyboardEventMatch(e: KeyboardEvent, bindCode: string): boolean {
  if (bindCode.startsWith("Mouse")) return false;

  const parts = bindCode.split("+");
  const mainKey = parts[parts.length - 1];
  const reqCtrl = parts.includes("Ctrl");
  const reqShift = parts.includes("Shift");
  const reqAlt = parts.includes("Alt");

  const ctrlPressed = e.ctrlKey || e.metaKey;
  if (reqCtrl !== ctrlPressed) return false;
  if (reqShift !== e.shiftKey) return false;
  if (reqAlt !== e.altKey) return false;

  return (
    e.code === mainKey ||
    (Boolean(e.key) && e.key.toLowerCase() === mainKey.toLowerCase()) ||
    (mainKey === "Comma" && (e.key === "б" || e.key === "Б" || e.key === ",")) ||
    (mainKey === "Period" && (e.key === "ю" || e.key === "Ю" || e.key === ".")) ||
    (mainKey === "BracketLeft" && (e.key === "х" || e.key === "Х" || e.key === "[")) ||
    (mainKey === "BracketRight" && (e.key === "ъ" || e.key === "Ъ" || e.key === "]")) ||
    (mainKey === "KeyJ" && (e.key === "о" || e.key === "О" || e.key.toLowerCase() === "j"))
  );
}
