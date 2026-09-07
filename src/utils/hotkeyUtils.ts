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
  copyFrame: ["KeyC"],
  fileInfo: ["KeyI"],
  playlist: ["KeyL"],
  fullscreen: ["KeyF", "F11", "MouseLeftDoubleClick"],
  openFile: ["KeyO"],
  resetZoom: ["Digit0"],
  openContextMenu: ["MouseRight"],
  cycleAudioTrack: ["KeyA"],
  cycleSubTrack: ["KeyV"],
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
  toggleAudioMenu: [],
  toggleSubMenu: [],
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

  // Аудио и Субтитры
  { id: "volumeUp", label: "Громкость +5%", defaultKeys: DEFAULT_HOTKEYS["volumeUp"], category: "Аудио и Субтитры" },
  { id: "volumeDown", label: "Громкость -5%", defaultKeys: DEFAULT_HOTKEYS["volumeDown"], category: "Аудио и Субтитры" },
  { id: "toggleMute", label: "Включить / отключить звук", defaultKeys: DEFAULT_HOTKEYS["toggleMute"], category: "Аудио и Субтитры" },
  { id: "cycleAudioTrack", label: "Смена аудиодорожки", defaultKeys: DEFAULT_HOTKEYS["cycleAudioTrack"], category: "Аудио и Субтитры" },
  { id: "cycleSubTrack", label: "Смена субтитров", defaultKeys: DEFAULT_HOTKEYS["cycleSubTrack"], category: "Аудио и Субтитры" },

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

export function getKeyDisplay(currentCode: string): string {
  if (!currentCode) return "—";
  if (currentCode === "MouseLeft") return "ЛКМ";
  if (currentCode === "MouseRight") return "ПКМ";
  if (currentCode === "MouseMiddle") return "СКМ (Колесо)";
  if (currentCode === "MouseLeftDoubleClick") return "Двойной клик ЛКМ";
  
  if (currentCode.startsWith("MouseButton")) {
    return "Кнопка мыши " + currentCode.replace("MouseButton", "");
  }
  if (currentCode.startsWith("Key")) {
    return currentCode.replace("Key", "");
  }
  if (currentCode.startsWith("Digit")) {
    return currentCode.replace("Digit", "");
  }
  if (currentCode === "Space") return "Пробел";
  if (currentCode === "ArrowLeft") return "←";
  if (currentCode === "ArrowRight") return "→";
  if (currentCode === "ArrowUp") return "↑";
  if (currentCode === "ArrowDown") return "↓";
  if (currentCode === "Comma") return "Запятая (,)";
  if (currentCode === "Period") return "Точка (.)";
  if (currentCode === "BracketLeft") return "[";
  if (currentCode === "BracketRight") return "]";
  if (currentCode === "Backspace") return "Backspace";
  if (currentCode === "PageUp") return "Page Up";
  if (currentCode === "PageDown") return "Page Down";
  
  return currentCode;
}
