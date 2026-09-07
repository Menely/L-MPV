export interface HotkeyAction {
  id: string;
  label: string;
  defaultKeys: string[]; 
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
};

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  { id: "togglePause", label: "Воспроизведение / Пауза", defaultKeys: DEFAULT_HOTKEYS["togglePause"] },
  { id: "fullscreen", label: "Полноэкранный режим", defaultKeys: DEFAULT_HOTKEYS["fullscreen"] },
  { id: "openContextMenu", label: "Открыть контекстное меню", defaultKeys: DEFAULT_HOTKEYS["openContextMenu"] },
  { id: "seekBack", label: "Перемотка назад (-5 сек)", defaultKeys: DEFAULT_HOTKEYS["seekBack"] },
  { id: "seekForward", label: "Перемотка вперед (+5 сек)", defaultKeys: DEFAULT_HOTKEYS["seekForward"] },
  { id: "seekBack10", label: "Перемотка назад (-10 сек)", defaultKeys: DEFAULT_HOTKEYS["seekBack10"] },
  { id: "seekForward10", label: "Перемотка вперед (+10 сек)", defaultKeys: DEFAULT_HOTKEYS["seekForward10"] },
  { id: "volumeUp", label: "Громкость +5%", defaultKeys: DEFAULT_HOTKEYS["volumeUp"] },
  { id: "volumeDown", label: "Громкость -5%", defaultKeys: DEFAULT_HOTKEYS["volumeDown"] },
  { id: "toggleMute", label: "Включить / отключить звук", defaultKeys: DEFAULT_HOTKEYS["toggleMute"] },
  { id: "cycleAudioTrack", label: "Смена аудиодорожки", defaultKeys: DEFAULT_HOTKEYS["cycleAudioTrack"] },
  { id: "cycleSubTrack", label: "Смена субтитров", defaultKeys: DEFAULT_HOTKEYS["cycleSubTrack"] },
  { id: "speedUp", label: "Увеличить скорость", defaultKeys: DEFAULT_HOTKEYS["speedUp"] },
  { id: "speedDown", label: "Уменьшить скорость", defaultKeys: DEFAULT_HOTKEYS["speedDown"] },
  { id: "speedReset", label: "Сбросить скорость (1.0x)", defaultKeys: DEFAULT_HOTKEYS["speedReset"] },
  { id: "frameBack", label: "Кадр назад", defaultKeys: DEFAULT_HOTKEYS["frameBack"] },
  { id: "frameForward", label: "Кадр вперед", defaultKeys: DEFAULT_HOTKEYS["frameForward"] },
  { id: "screenshot", label: "Сохранить кадр", defaultKeys: DEFAULT_HOTKEYS["screenshot"] },
  { id: "copyFrame", label: "Копировать кадр в буфер", defaultKeys: DEFAULT_HOTKEYS["copyFrame"] },
  { id: "fileInfo", label: "Информация о файле", defaultKeys: DEFAULT_HOTKEYS["fileInfo"] },
  { id: "playlist", label: "Боковая панель плейлиста", defaultKeys: DEFAULT_HOTKEYS["playlist"] },
  { id: "playlistPrev", label: "Предыдущий файл в плейлисте", defaultKeys: DEFAULT_HOTKEYS["playlistPrev"] },
  { id: "playlistNext", label: "Следующий файл в плейлисте", defaultKeys: DEFAULT_HOTKEYS["playlistNext"] },
  { id: "openFile", label: "Открыть файл", defaultKeys: DEFAULT_HOTKEYS["openFile"] },
  { id: "resetZoom", label: "Сброс масштаба видео (100%)", defaultKeys: DEFAULT_HOTKEYS["resetZoom"] },
  { id: "toggleRepeat", label: "Режим повтора", defaultKeys: DEFAULT_HOTKEYS["toggleRepeat"] },
  { id: "toggleShuffle", label: "Случайный порядок", defaultKeys: DEFAULT_HOTKEYS["toggleShuffle"] },
  { id: "alwaysOnTop", label: "Поверх всех окон", defaultKeys: DEFAULT_HOTKEYS["alwaysOnTop"] },
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
