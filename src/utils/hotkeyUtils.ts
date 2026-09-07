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
  playlist: ["KeyL"],
  fullscreen: ["KeyF", "F11", "MouseLeftDoubleClick"],
  openFile: ["Ctrl+KeyO", "KeyO"],
  resetZoom: ["Digit0"],
  openContextMenu: ["MouseRight"],
  cycleAudioTrack: ["KeyA", "MouseLeft"],
  toggleAudioMenu: ["MouseRight"],
  cycleSubTrack: ["KeyV", "MouseLeft"],
  toggleSubMenu: ["MouseRight"],
  playlistPrev: ["PageUp"],
  playlistNext: ["PageDown"],
  seekBack10: [],
  seekForward10: [],
  toggleRepeat: ["KeyR"],
  toggleShuffle: [],
  alwaysOnTop: ["KeyT"],
  speedUp: ["BracketRight"],
  speedDown: ["BracketLeft"],
  speedReset: ["Backspace"],
};

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  // Воспроизведение
  { id: "togglePause", label: "Воспроизведение / Пауза", defaultKeys: DEFAULT_HOTKEYS["togglePause"], category: "Воспроизведение" },
  { id: "toggleRepeat", label: "Режим повтора", defaultKeys: DEFAULT_HOTKEYS["toggleRepeat"], category: "Воспроизведение" },
  { id: "toggleShuffle", label: "Случайный порядок", defaultKeys: DEFAULT_HOTKEYS["toggleShuffle"], category: "Воспроизведение" },

  // Перемотка
  { id: "seekBack", label: "Перемотка назад (-5 сек)", defaultKeys: DEFAULT_HOTKEYS["seekBack"], category: "Перемотка" },
  { id: "seekForward", label: "Перемотка вперед (+5 сек)", defaultKeys: DEFAULT_HOTKEYS["seekForward"], category: "Перемотка" },
  { id: "seekBack10", label: "Перемотка назад (-10 сек)", defaultKeys: DEFAULT_HOTKEYS["seekBack10"], category: "Перемотка" },
  { id: "seekForward10", label: "Перемотка вперед (+10 сек)", defaultKeys: DEFAULT_HOTKEYS["seekForward10"], category: "Перемотка" },
  { id: "frameBack", label: "Кадр назад", defaultKeys: DEFAULT_HOTKEYS["frameBack"], category: "Перемотка" },
  { id: "frameForward", label: "Кадр вперед", defaultKeys: DEFAULT_HOTKEYS["frameForward"], category: "Перемотка" },

  // Аудио
  { id: "volumeUp", label: "Громкость +5%", defaultKeys: DEFAULT_HOTKEYS["volumeUp"], category: "Аудио" },
  { id: "volumeDown", label: "Громкость -5%", defaultKeys: DEFAULT_HOTKEYS["volumeDown"], category: "Аудио" },
  { id: "toggleMute", label: "Включить / отключить звук", defaultKeys: DEFAULT_HOTKEYS["toggleMute"], category: "Аудио" },
  { id: "cycleAudioTrack", label: "Смена аудиодорожки", defaultKeys: DEFAULT_HOTKEYS["cycleAudioTrack"], category: "Аудио" },
  { id: "toggleAudioMenu", label: "Меню аудиодорожек", defaultKeys: DEFAULT_HOTKEYS["toggleAudioMenu"], category: "Аудио" },

  // Субтитры
  { id: "cycleSubTrack", label: "Смена субтитров", defaultKeys: DEFAULT_HOTKEYS["cycleSubTrack"], category: "Субтитры" },
  { id: "toggleSubMenu", label: "Меню субтитров", defaultKeys: DEFAULT_HOTKEYS["toggleSubMenu"], category: "Субтитры" },

  // Скорость
  { id: "speedUp", label: "Увеличить скорость", defaultKeys: DEFAULT_HOTKEYS["speedUp"], category: "Скорость" },
  { id: "speedDown", label: "Уменьшить скорость", defaultKeys: DEFAULT_HOTKEYS["speedDown"], category: "Скорость" },
  { id: "speedReset", label: "Сбросить скорость (1.0x)", defaultKeys: DEFAULT_HOTKEYS["speedReset"], category: "Скорость" },

  // Интерфейс и Окно
  { id: "fullscreen", label: "Полноэкранный режим", defaultKeys: DEFAULT_HOTKEYS["fullscreen"], category: "Интерфейс" },
  { id: "alwaysOnTop", label: "Поверх всех окон", defaultKeys: DEFAULT_HOTKEYS["alwaysOnTop"], category: "Интерфейс" },
  { id: "openContextMenu", label: "Открыть контекстное меню", defaultKeys: DEFAULT_HOTKEYS["openContextMenu"], category: "Интерфейс" },
  { id: "fileInfo", label: "Информация о файле", defaultKeys: DEFAULT_HOTKEYS["fileInfo"], category: "Интерфейс" },
  { id: "resetZoom", label: "Сброс масштаба видео (100%)", defaultKeys: DEFAULT_HOTKEYS["resetZoom"], category: "Интерфейс" },
  { id: "screenshot", label: "Сохранить кадр", defaultKeys: DEFAULT_HOTKEYS["screenshot"], category: "Интерфейс" },
  { id: "copyFrame", label: "Копировать кадр в буфер", defaultKeys: DEFAULT_HOTKEYS["copyFrame"], category: "Интерфейс" },

  // Плейлист
  { id: "playlist", label: "Боковая панель плейлиста", defaultKeys: DEFAULT_HOTKEYS["playlist"], category: "Плейлист" },
  { id: "playlistPrev", label: "Предыдущий файл в плейлисте", defaultKeys: DEFAULT_HOTKEYS["playlistPrev"], category: "Плейлист" },
  { id: "playlistNext", label: "Следующий файл в плейлисте", defaultKeys: DEFAULT_HOTKEYS["playlistNext"], category: "Плейлист" },
  { id: "openFile", label: "Открыть файл", defaultKeys: DEFAULT_HOTKEYS["openFile"], category: "Плейлист" },
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

function formatSingleKey(part: string): string {
  if (!part) return "";
  if (part === "MouseLeft") return "ЛКМ";
  if (part === "MouseRight") return "ПКМ";
  if (part === "MouseMiddle") return "СКМ";
  if (part === "MouseLeftDoubleClick") return "ЛКМ 2x";
  
  if (part.startsWith("MouseButton")) {
    return "Мышь " + part.replace("MouseButton", "");
  }
  if (part.startsWith("Key")) {
    return part.replace("Key", "");
  }
  if (part.startsWith("Digit")) {
    return part.replace("Digit", "");
  }
  if (part === "Space") return "Пробел";
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

export function getKeyDisplay(currentCode: string): string {
  if (!currentCode) return "—";
  const parts = currentCode.split("+");
  return parts.map(formatSingleKey).join(" + ");
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
    (mainKey === "BracketRight" && (e.key === "ъ" || e.key === "Ъ" || e.key === "]"))
  );
}
