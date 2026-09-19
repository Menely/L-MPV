import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles,
  Plus,
  Play,
  Check,
  RotateCw,
  Edit2,
  Trash2,
  Download,
  Upload,
  Layers,
  Palette,
  Eye,
  AudioWaveform,
  SlidersHorizontal,
  Sun,
  ChevronDown,
  FolderOpen,
  Keyboard,
} from "lucide-react";
import {
  SettingsPreset,
  BUILT_IN_PRESETS,
  captureCurrentSettings,
  applySettingsPreset,
  loadUserPresets,
  saveUserPresets,
  exportPresetToFile,
  exportAllPresetsToFile,
  importPresetsFromNativeDialog,
  openPresetsFolder,
  getSavedActivePresetId,
  saveActivePresetId,
  isSettingsMatchingPreset,
} from "../../utils/presetsUtils";
import { PLAYER_THEMES, PlayerThemeId } from "../../utils/colorUtils";
import { getPreloadedUserPresets, storeUserPresets } from "./settingsTabPreload";
import { EmptyState } from "./SettingBlocks";

const PRESETS_USER_OPEN_KEY = "l-mpv-presets-user-open";
const PRESETS_BUILTIN_OPEN_KEY = "l-mpv-presets-builtin-open";

function readGroupOpen(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === "true";
  } catch {
    return def;
  }
}

function writeGroupOpen(key: string, val: boolean): void {
  try {
    localStorage.setItem(key, val ? "true" : "false");
  } catch {
    /* ignore — портативность не страдает, просто не запомнится */
  }
}

interface PresetsSectionProps {
  /** Опциональный callback при применении пресета для внешних обработчиков */
  onPresetApplied?: (preset: SettingsPreset) => void;
}

/**
 * Интерактивная секция управления пресетами настроек в L-MPV.
 *
 * Позволяет мгновенно сохранять текущую визуальную и функциональную конфигурацию
 * плеера, переключаться между ними в один клик, переименовывать, удалять,
 * а также экспортировать и импортировать пресеты.
 */
export const PresetsSection: React.FC<PresetsSectionProps> = ({ onPresetApplied }) => {
  // Синхронное чтение предзагруженного кэша: первый paint уже полный,
  // окно настроек не прыгает после прилёта данных.
  const [userPresets, setUserPresets] = useState<SettingsPreset[]>(() => getPreloadedUserPresets() ?? []);
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(() => getSavedActivePresetId());
  // Группы по умолчанию свёрнуты: высота вкладки стабильна с первого paint,
  // выбор запоминается и переживает перезапуски.
  const [isUserPresetsOpen, setIsUserPresetsOpen] = useState<boolean>(() => readGroupOpen(PRESETS_USER_OPEN_KEY, false));
  const [isBuiltInPresetsOpen, setIsBuiltInPresetsOpen] = useState<boolean>(() => readGroupOpen(PRESETS_BUILTIN_OPEN_KEY, false));

  const isMountedRef = useRef<boolean>(true);
  const toastTimerRef = useRef<number | null>(null);
  const userPresetsRef = useRef<SettingsPreset[]>([]);
  userPresetsRef.current = userPresets;

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = window.setTimeout(() => {
      if (isMountedRef.current) {
        setToastMessage(null);
      }
      toastTimerRef.current = null;
    }, 2800);
  }, []);

  // Определение пресета, соответствующего текущим настройкам плеера
  const detectActivePreset = useCallback(async (availablePresets?: SettingsPreset[]) => {
    try {
      const currentSnapshot = await captureCurrentSettings("");
      const currentSettings = currentSnapshot.data;
      const presetsToCheck = availablePresets || [...userPresetsRef.current, ...BUILT_IN_PRESETS];
      const savedId = getSavedActivePresetId();

      // 1. Проверяем сохранённый активный пресет: если он полностью совпадает с текущими настройками
      if (savedId) {
        const target = presetsToCheck.find((p) => p.id === savedId);
        if (target && isSettingsMatchingPreset(currentSettings, target.data)) {
          if (isMountedRef.current) {
            setActivePresetId(savedId);
          }
          return;
        }
      }

      // 2. Если сохранённого нет или настройки разошлись, ищем совпадение среди всех доступных пресетов
      const matching = presetsToCheck.find((p) => isSettingsMatchingPreset(currentSettings, p.data));
      if (matching) {
        saveActivePresetId(matching.id);
        if (isMountedRef.current) {
          setActivePresetId(matching.id);
        }
      } else {
        // Текущие настройки были изменены пользователем и не совпадают ни с одним пресетом
        if (isMountedRef.current) {
          setActivePresetId(null);
        }
      }
    } catch (e) {
      console.error("Ошибка проверки активного пресета:", e);
    }
  }, []);

  // Первоначальная загрузка пользовательских пресетов
  useEffect(() => {
    isMountedRef.current = true;
    loadUserPresets()
      .then((presets) => {
        if (isMountedRef.current) {
          storeUserPresets(presets);
          setUserPresets(presets);
          detectActivePreset([...presets, ...BUILT_IN_PRESETS]);
        }
      })
      .catch((err) => {
        console.error("Ошибка загрузки пресетов:", err);
      });

    // Автоматическая синхронизация при возврате фокуса в окно L-MPV
    const handleFocus = () => {
      loadUserPresets()
        .then((presets) => {
          if (isMountedRef.current) {
            storeUserPresets(presets);
            setUserPresets(presets);
            detectActivePreset([...presets, ...BUILT_IN_PRESETS]);
          }
        })
        .catch(() => {});
    };

    const handleSettingsChanged = () => {
      detectActivePreset();
    };

    const handlePresetAppliedEvent = (e: Event) => {
      const customEvent = e as CustomEvent<SettingsPreset>;
      if (customEvent.detail?.id && isMountedRef.current) {
        setActivePresetId(customEvent.detail.id);
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("l-mpv-settings-changed", handleSettingsChanged);
    window.addEventListener("l-mpv-preset-applied", handlePresetAppliedEvent);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("l-mpv-settings-changed", handleSettingsChanged);
      window.removeEventListener("l-mpv-preset-applied", handlePresetAppliedEvent);
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [detectActivePreset]);

  // Ручное обновление списка пресетов
  const handleReload = async () => {
    try {
      const presets = await loadUserPresets();
      storeUserPresets(presets);
      setUserPresets(presets);
      detectActivePreset([...presets, ...BUILT_IN_PRESETS]);
      showToast("Список пресетов обновлён");
    } catch (err) {
      console.error("Ошибка перезагрузки пресетов:", err);
      showToast("Не удалось обновить список пресетов");
    }
  };

  // Сохранение текущих настроек под новым именем
  const handleSaveCurrent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newPresetName.trim();
    if (!name) {
      showToast("Введите название для пресета");
      return;
    }

    try {
      const newPreset = await captureCurrentSettings(name);
      const existingIdx = userPresets.findIndex(
        (p) => p.name.trim().toLowerCase() === name.toLowerCase()
      );
      let updated: SettingsPreset[];
      let targetId = newPreset.id;

      if (existingIdx !== -1) {
        targetId = userPresets[existingIdx].id;
        updated = [...userPresets];
        updated[existingIdx] = {
          ...newPreset,
          id: targetId,
          createdAt: userPresets[existingIdx].createdAt,
          updatedAt: Date.now(),
        };
        showToast(`Пресет «${name}» обновлён текущими настройками!`);
      } else {
        updated = [newPreset, ...userPresets];
        showToast(`Пресет «${newPreset.name}» успешно сохранён!`);
      }
      setUserPresets(updated);
      await saveUserPresets(updated);
      storeUserPresets(updated);
      setNewPresetName("");
      saveActivePresetId(targetId);
      setActivePresetId(targetId);
    } catch (err) {
      console.error("Ошибка сохранения пресета:", err);
      showToast("Не удалось сохранить пресет");
    }
  };

  // Применение пресета
  const handleApply = async (preset: SettingsPreset) => {
    try {
      await applySettingsPreset(preset);
      saveActivePresetId(preset.id);
      setActivePresetId(preset.id);
      showToast(`Пресет «${preset.name}» применён`);
      if (onPresetApplied) {
        onPresetApplied(preset);
      }
    } catch (err) {
      console.error("Ошибка применения пресета:", err);
      showToast("Ошибка применения пресета");
    }
  };

  // Перезапись пресета текущими настройками плеера
  const handleOverwrite = async (preset: SettingsPreset) => {
    try {
      const fresh = await captureCurrentSettings(preset.name);
      const updated = userPresets.map((p) =>
        p.id === preset.id ? { ...p, data: fresh.data, updatedAt: Date.now() } : p
      );
      setUserPresets(updated);
      await saveUserPresets(updated);
      storeUserPresets(updated);
      saveActivePresetId(preset.id);
      setActivePresetId(preset.id);
      showToast(`Пресет «${preset.name}» обновлён текущими настройками!`);
    } catch (err) {
      console.error("Ошибка обновления пресета:", err);
      showToast("Не удалось обновить пресет");
    }
  };

  // Удаление пользовательского пресета
  const handleDelete = async (preset: SettingsPreset) => {
    if (!window.confirm(`Вы уверены, что хотите удалить пресет «${preset.name}»?`)) {
      return;
    }
    const updated = userPresets.filter((p) => p.id !== preset.id);
    setUserPresets(updated);
    await saveUserPresets(updated);
    if (activePresetId === preset.id) {
      saveActivePresetId(null);
      setActivePresetId(null);
    }
    showToast(`Пресет «${preset.name}» удалён`);
  };

  // Сохранение нового имени пресета
  const handleSaveRename = async (presetId: string) => {
    const trimmed = editingName.trim();
    setEditingId(null);
    if (!trimmed) return;
    const current = userPresets.find((p) => p.id === presetId);
    if (!current || current.name === trimmed) return;
    const updated = userPresets.map((p) =>
      p.id === presetId ? { ...p, name: trimmed, updatedAt: Date.now() } : p
    );
    setUserPresets(updated);
    await saveUserPresets(updated);
    showToast(`Пресет переименован в «${trimmed}»`);
  };

  // Нативный импорт пресета через проводник Windows
  const handleNativeImport = async () => {
    try {
      const imported = await importPresetsFromNativeDialog();
      if (!isMountedRef.current || imported.length === 0) return;
      const updated = [...imported, ...userPresets];
      setUserPresets(updated);
      await saveUserPresets(updated);
      storeUserPresets(updated);
      showToast(`Импортировано пресетов: ${imported.length}`);
    } catch (err) {
      console.error("Ошибка импорта:", err);
      showToast("Не удалось импортировать пресет");
    }
  };

  // Экспорт отдельного пресета через диалог проводника
  const handleExportSingle = async (preset: SettingsPreset) => {
    try {
      const savedPath = await exportPresetToFile(preset);
      if (savedPath) {
        const fileName = savedPath.split(/[/\\]/).pop() || preset.name;
        showToast(`Пресет сохранён: ${fileName}`);
      }
    } catch (err) {
      console.error("Ошибка экспорта пресета:", err);
      showToast("Не удалось экспортировать пресет");
    }
  };

  // Экспорт всех пресетов через диалог проводника
  const handleExportAll = async () => {
    try {
      const savedPath = await exportAllPresetsToFile(userPresets);
      if (savedPath) {
        const fileName = savedPath.split(/[/\\]/).pop() || "все пресеты";
        showToast(`Все пресеты сохранены: ${fileName}`);
      }
    } catch (err) {
      console.error("Ошибка экспорта всех пресетов:", err);
      showToast("Не удалось экспортировать пресеты");
    }
  };

  // Открытие папки config/presets в Проводнике Windows
  const handleOpenFolder = async () => {
    try {
      await openPresetsFolder();
    } catch (err) {
      console.error("Ошибка открытия папки:", err);
      showToast("Не удалось открыть папку пресетов");
    }
  };

  // Форматирование даты
  const formatDate = (timestamp: number): string => {
    try {
      return new Date(timestamp).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  // Рендер бейджей параметров пресета
  const renderPresetBadges = (preset: SettingsPreset) => {
    const { data } = preset;
    const isWindows = data.accentColor === "windows";
    const colorHex = isWindows ? "#7fc7ff" : data.accentColor;
    const themeConfig = data.playerTheme ? PLAYER_THEMES[data.playerTheme as PlayerThemeId] : null;

    // Определение описания скругления
    let radiusText = "";
    if (data.uiRadius) {
      if (typeof data.uiRadius === "string") {
        const rStr = data.uiRadius as string;
        radiusText =
          rStr === "none"
            ? "Скругление: 0px"
            : rStr === "minimal"
            ? "Скругление: 4px"
            : rStr === "default"
            ? "Скругление: 10px"
            : rStr === "smooth"
            ? "Скругление: 16px"
            : rStr === "pill"
            ? "Скругление: 24px"
            : `Скругление: ${rStr}`;
      } else {
        radiusText = `Скругление: ${data.uiRadius.value ?? 10}px`;
      }
    }

    // Определение масштаба
    const scaleValue = data.uiScale?.value ?? 1.0;
    const scaleText = Math.round(scaleValue * 100) !== 100 ? `Масштаб: ${Math.round(scaleValue * 100)}%` : null;

    // Количество хоткеев
    const hotkeyCount = data.customHotkeys ? Object.keys(data.customHotkeys).length : 0;

    return (
      <div className="preset-card__tags">
        {/* 1. Тема плеера (расцветка фона) */}
        {themeConfig && (
          <div className="preset-tag" title={`Тема плеера: ${themeConfig.name}`}>
            <span
              className="preset-tag__color-dot"
              style={{
                backgroundColor: themeConfig.dotColor,
                border: "1.5px solid rgba(255, 255, 255, 0.35)",
              }}
            />
            <span>Тема: {themeConfig.name}</span>
          </div>
        )}

        {/* 2. Акцентный цвет */}
        {data.accentColor && (
          <div className="preset-tag" title={`Акцентный цвет: ${data.accentColor}`}>
            <span
              className="preset-tag__color-dot"
              style={{
                backgroundColor: colorHex,
                boxShadow: data.glowIntensity && data.glowIntensity !== "off" ? `0 0 6px ${colorHex}` : "none",
              }}
            />
            <span>{isWindows ? "Windows" : data.accentColor.toUpperCase()}</span>
          </div>
        )}

        {/* 3. Интенсивность неонового свечения */}
        {data.glowIntensity && data.glowIntensity !== "off" && (
          <div className="preset-tag" title="Интенсивность неонового свечения">
            <Sparkles size={11} color="var(--accent)" />
            <span>
              {data.glowIntensity === "soft"
                ? "Мягкое свечение"
                : data.glowIntensity === "medium"
                ? "Баланс"
                : "High"}
            </span>
          </div>
        )}

        {/* 4. Ambient Light */}
        {data.ambient && (
          <div className="preset-tag" title="Подсветка полос (Ambient Light)">
            <Sun size={11} />
            <span>
              {data.ambient.mode === "off"
                ? "Ambient: Выкл"
                : data.ambient.mode === "blur"
                ? "Ambient: Размытие"
                : "Ambient: Цвет"}
            </span>
          </div>
        )}

        {/* 5. Аудио-визуалайзер */}
        {data.visualizer && (
          <div className="preset-tag" title="Аудио-визуалайзер">
            <AudioWaveform size={11} />
            <span>
              {data.visualizer.enabled && data.visualizer.placement !== "off"
                ? `Спектр: ${data.visualizer.mode}`
                : "Спектр: Выкл"}
            </span>
          </div>
        )}

        {/* 6. Прозрачность UI */}
        {typeof data.uiOpacity === "number" && data.uiOpacity < 1 && (
          <div className="preset-tag" title="Прозрачность интерфейса">
            <Eye size={11} />
            <span>{Math.round(data.uiOpacity * 100)}%</span>
          </div>
        )}

        {/* 7. Скругление углов */}
        {radiusText && (
          <div className="preset-tag" title="Скругление углов элементов">
            <SlidersHorizontal size={11} />
            <span>{radiusText}</span>
          </div>
        )}

        {/* 8. Масштаб интерфейса (если не 100%) */}
        {scaleText && (
          <div className="preset-tag" title="Масштаб интерфейса">
            <Layers size={11} />
            <span>{scaleText}</span>
          </div>
        )}

        {/* 9. Кастомные бинды (если есть) */}
        {hotkeyCount > 0 && (
          <div className="preset-tag" title="Пользовательские горячие клавиши">
            <Keyboard size={11} />
            <span>Хоткеи ({hotkeyCount})</span>
          </div>
        )}
      </div>
    );
  };

  // Единый рендер карточки пресета (как пользовательского, так и встроенного)
  const renderPresetCard = (preset: SettingsPreset) => {
    const isBuiltIn = !!preset.isBuiltIn;
    const isEditing = editingId === preset.id;
    const isApplied = activePresetId === preset.id;

    return (
      <div key={preset.id} className={`preset-card ${isBuiltIn ? "preset-card--builtin" : ""} ${isApplied ? "preset-card--active" : ""}`}>
        <div className="preset-card__top">
          <div className="preset-card__info">
            <div className="preset-card__name-row">
              {isEditing ? (
                <input
                  type="text"
                  className="preset-card__rename-input"
                  value={editingName}
                  autoFocus
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename(preset.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => handleSaveRename(preset.id)}
                />
              ) : (
                <span className="preset-card__name" title={preset.name}>
                  {preset.name}
                </span>
              )}
              {isBuiltIn ? (
                <span className="preset-card__badge-builtin">Встроенный</span>
              ) : (
                <span className="preset-card__meta">
                  {formatDate(preset.updatedAt || preset.createdAt)}
                </span>
              )}
            </div>

            {isBuiltIn && preset.description && (
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {preset.description}
              </span>
            )}

            {renderPresetBadges(preset)}
          </div>

          <div className="preset-card__actions-col">
            <button
              type="button"
              className={`preset-action-btn ${isApplied ? "preset-action-btn--applied" : "preset-action-btn--apply"}`}
              onClick={() => handleApply(preset)}
              title={isBuiltIn ? "Применить данный встроенный пресет" : "Применить данный пресет к плееру"}
            >
              {isApplied ? (
                <Check size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
              ) : (
                <Play size={13} style={{ flexShrink: 0 }} />
              )}
              <span>{isApplied ? "Активен" : "Применить"}</span>
            </button>

            {!isBuiltIn ? (
              <div className="preset-card__actions-grid">
                <button
                  type="button"
                  className="preset-action-btn preset-action-btn--icon"
                  onClick={() => handleOverwrite(preset)}
                  title="Перезаписать этот пресет текущими настройками плеера"
                >
                  <RotateCw size={13} />
                </button>

                <button
                  type="button"
                  className="preset-action-btn preset-action-btn--icon"
                  onClick={() => {
                    setEditingId(preset.id);
                    setEditingName(preset.name);
                  }}
                  title="Переименовать пресет"
                >
                  <Edit2 size={13} />
                </button>

                <button
                  type="button"
                  className="preset-action-btn preset-action-btn--icon"
                  onClick={() => handleExportSingle(preset)}
                  title="Экспортировать этот пресет через Проводник Windows"
                >
                  <Download size={13} />
                </button>

                <button
                  type="button"
                  className="preset-action-btn preset-action-btn--icon preset-action-btn--danger"
                  onClick={() => handleDelete(preset)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="preset-action-btn preset-action-btn--icon"
                onClick={() => handleExportSingle(preset)}
                title="Экспортировать этот пресет через Проводник Windows"
              >
                <Download size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="presets-container">
      {/* ── Блок создания нового пресета ── */}
      <div className="presets-creator">
        <div className="presets-creator__header">
          <div className="presets-creator__title">
            <Sparkles size={16} color="var(--accent)" />
            <span>Сохранить текущие настройки</span>
          </div>
          <button
            type="button"
            className="presets-btn-text"
            onClick={handleNativeImport}
            title="Импортировать файлы пресетов .json"
          >
            <Upload size={13} />
            <span>Импорт</span>
          </button>
        </div>
        <div className="presets-creator__subtitle">
          Мгновенный снимок темы плеера, акцентного цвета, прозрачности, неонового свечения, визуалайзера и горячих клавиш.
        </div>
        <form onSubmit={handleSaveCurrent} className="presets-creator__form">
          <input
            type="text"
            className="presets-creator__input"
            placeholder="Название пресета (например: Ночной кинозал)"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
          />
          <button type="submit" className="presets-creator__btn-save">
            <Plus size={15} />
            <span>Сохранить пресет</span>
          </button>
        </form>
      </div>

      {/* Тост с уведомлением */}
      {toastMessage && (
        <div
          style={{
            padding: "8px 14px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(var(--accent-rgb, 127, 199, 255), 0.18)",
            border: "1px solid var(--accent)",
            color: "var(--text-primary)",
            fontSize: "0.82rem",
            fontWeight: 500,
            animation: "presetsFadeIn 0.2s ease",
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* ── Список 1: Мои сохраненные пресеты ── */}
      <div>
        <div className="presets-section-heading">
          <button
            type="button"
            className="presets-section-heading__title"
            onClick={() => setIsUserPresetsOpen((prev) => {
              const next = !prev;
              writeGroupOpen(PRESETS_USER_OPEN_KEY, next);
              return next;
            })}
          >
            <ChevronDown
              size={15}
              className={`presets-section-heading__chevron ${
                !isUserPresetsOpen ? "presets-section-heading__chevron--collapsed" : ""
              }`}
            />
            <Layers size={15} />
            <span>Мои пресеты ({userPresets.length})</span>
          </button>

          <div className="presets-section-heading__actions">
            <button
              type="button"
              className="presets-btn-text"
              onClick={handleReload}
              title="Обновить список пресетов"
            >
              <RotateCw size={13} />
              <span>Обновить</span>
            </button>
            <button
              type="button"
              className="presets-btn-text"
              onClick={handleNativeImport}
              title="Импортировать пресет из файла .json"
            >
              <Upload size={13} />
              <span>Импорт</span>
            </button>
            {userPresets.length > 0 && (
              <>
                <button
                  type="button"
                  className="presets-btn-text"
                  onClick={handleExportAll}
                  title="Экспортировать все пользовательские пресеты в один файл"
                >
                  <Download size={13} />
                  <span>Экспорт всех</span>
                </button>
                <button
                  type="button"
                  className="presets-btn-text"
                  onClick={handleOpenFolder}
                  title="Открыть портативную папку config/presets в Проводнике"
                >
                  <FolderOpen size={13} />
                  <span>Папка</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/*
          Группа всегда смонтирована: раскрытие идёт плавной складкой
          collapse-fold (как аккордеон), высота вкладки не прыгает.
        */}
        <div className={`collapse-fold ${isUserPresetsOpen ? "collapse-fold--open" : ""}`}>
          <div className="collapse-fold__inner">
            <div className="collapse-fold__body" style={{ marginTop: 8 }}>
              {userPresets.length === 0 ? (
                <EmptyState
                  icon={<Palette size={24} />}
                  title="Нет сохранённых пресетов"
                  desc="Настройте желаемый визуальный стиль плеера и сохраните его с помощью формы выше."
                />
              ) : (
                <div className="presets-list">
                  {userPresets.map((preset) => renderPresetCard(preset))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Список 2: Готовые встроенные стили ── */}
      <div>
        <div className="presets-section-heading">
          <button
            type="button"
            className="presets-section-heading__title"
            onClick={() => setIsBuiltInPresetsOpen((prev) => {
              const next = !prev;
              writeGroupOpen(PRESETS_BUILTIN_OPEN_KEY, next);
              return next;
            })}
          >
            <ChevronDown
              size={15}
              className={`presets-section-heading__chevron ${
                !isBuiltInPresetsOpen ? "presets-section-heading__chevron--collapsed" : ""
              }`}
            />
            <Sparkles size={15} />
            <span>Готовые стили ({BUILT_IN_PRESETS.length})</span>
          </button>
        </div>

        <div className={`collapse-fold ${isBuiltInPresetsOpen ? "collapse-fold--open" : ""}`}>
          <div className="collapse-fold__inner">
            <div className="collapse-fold__body presets-list" style={{ marginTop: 8 }}>
              {BUILT_IN_PRESETS.map((preset) => renderPresetCard(preset))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
