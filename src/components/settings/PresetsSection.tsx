import { useTranslation } from "../../i18n/LanguageContext";
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
  const { dict, locale } = useTranslation();
  // Синхронное чтение предзагруженного кэша: первый paint уже полный,
  // окно настроек не прыгает после прилёта данных.
  const [userPresets, setUserPresets] = useState<SettingsPreset[]>(() => getPreloadedUserPresets() ?? []);
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
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
      const savedId = getSavedActivePresetId();
      // Если пресет не был сохранён или применён — активного пресета нет
      if (!savedId) {
        if (isMountedRef.current) {
          setActivePresetId(null);
        }
        return;
      }

      const presetsToCheck = availablePresets || [...userPresetsRef.current, ...BUILT_IN_PRESETS];
      const target = presetsToCheck.find((p) => p.id === savedId);
      if (!target) {
        saveActivePresetId(null);
        if (isMountedRef.current) {
          setActivePresetId(null);
        }
        return;
      }

      const currentSnapshot = await captureCurrentSettings("");
      const currentSettings = currentSnapshot.data;

      // Проверяем сохранённый активный пресет: если он полностью совпадает с текущими настройками
      if (isSettingsMatchingPreset(currentSettings, target.data)) {
        if (isMountedRef.current) {
          setActivePresetId(savedId);
        }
      } else {
        // Настройки разошлись с сохранённым пресетом — сбрасываем активность
        saveActivePresetId(null);
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
      showToast(dict.settings.presets.toastUpdatedList);
    } catch (err) {
      console.error("Ошибка перезагрузки пресетов:", err);
      showToast(dict.settings.presets.toastReloadFail);
    }
  };

  // Сохранение текущих настроек под новым именем
  const handleSaveCurrent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newPresetName.trim();
    if (!name) {
      showToast(dict.settings.presets.toastEnterName);
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
        showToast(dict.settings.presets.toastUpdatedPreset(name));
      } else {
        updated = [newPreset, ...userPresets];
        showToast(dict.settings.presets.toastSavedPreset(newPreset.name));
      }
      setUserPresets(updated);
      await saveUserPresets(updated);
      storeUserPresets(updated);
      setNewPresetName("");
      saveActivePresetId(targetId);
      setActivePresetId(targetId);
    } catch (err) {
      console.error("Ошибка сохранения пресета:", err);
      showToast(dict.settings.presets.toastSaveFail);
    }
  };

  // Применение пресета
  const handleApply = async (preset: SettingsPreset) => {
    try {
      await applySettingsPreset(preset);
      saveActivePresetId(preset.id);
      setActivePresetId(preset.id);
      showToast(dict.settings.presets.toastApplied(preset.name));
      if (onPresetApplied) {
        onPresetApplied(preset);
      }
    } catch (err) {
      console.error("Ошибка применения пресета:", err);
      showToast(dict.settings.presets.toastApplyFail);
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
      showToast(dict.settings.presets.toastPresetUpdated(preset.name));
    } catch (err) {
      console.error("Ошибка обновления пресета:", err);
      showToast(dict.settings.presets.toastUpdateFail);
    }
  };

  // Удаление пользовательского пресета
  const handleDelete = async (preset: SettingsPreset) => {
    if (!window.confirm(dict.settings.presets.confirmDelete(preset.name))) {
      return;
    }
    const updated = userPresets.filter((p) => p.id !== preset.id);
    setUserPresets(updated);
    await saveUserPresets(updated);
    if (activePresetId === preset.id) {
      saveActivePresetId(null);
      setActivePresetId(null);
    }
    showToast(dict.settings.presets.toastDeleted(preset.name));
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
    showToast(dict.settings.presets.toastRenamed(trimmed));
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
      showToast(dict.settings.presets.toastImported(imported.length));
    } catch (err) {
      console.error("Ошибка импорта:", err);
      showToast(dict.settings.presets.toastImportFail);
    }
  };

  // Экспорт отдельного пресета через диалог проводника
  const handleExportSingle = async (preset: SettingsPreset) => {
    try {
      const savedPath = await exportPresetToFile(preset);
      if (savedPath) {
        const fileName = savedPath.split(/[/\\]/).pop() || preset.name;
        showToast(dict.settings.presets.toastExported(fileName));
      }
    } catch (err) {
      console.error("Ошибка экспорта пресета:", err);
      showToast(dict.settings.presets.toastExportFail);
    }
  };

  // Экспорт всех пресетов через диалог проводника
  const handleExportAll = async () => {
    try {
      const savedPath = await exportAllPresetsToFile(userPresets);
      if (savedPath) {
        const fileName = savedPath.split(/[/\\]/).pop() || "all presets";
        showToast(dict.settings.presets.toastExportAll(fileName));
      }
    } catch (err) {
      console.error("Ошибка экспорта всех пресетов:", err);
      showToast(dict.settings.presets.toastExportAllFail);
    }
  };

  // Открытие папки config/presets в Проводнике Windows
  const handleOpenFolder = async () => {
    try {
      await openPresetsFolder();
    } catch (err) {
      console.error("Ошибка открытия папки:", err);
      showToast(dict.settings.presets.toastOpenFolderFail);
    }
  };

  // Форматирование даты
  const formatDate = (timestamp: number): string => {
    try {
      const dateLocale = locale === "en" ? "en-US" : "ru-RU";
      return new Date(timestamp).toLocaleDateString(dateLocale, {
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
        const valMap: Record<string, string> = { none: "0px", minimal: "4px", default: "10px", smooth: "16px", pill: "24px" };
        radiusText = dict.settings.presets.radiusLabel(valMap[rStr] || rStr);
      } else {
        radiusText = dict.settings.presets.radiusLabel(`${data.uiRadius.value ?? 10}px`);
      }
    }

    // Определение масштаба
    const scaleValue = data.uiScale?.value ?? 1.0;
    const scaleText = Math.round(scaleValue * 100) !== 100 ? `${dict.settings.appearance.scale}: ${Math.round(scaleValue * 100)}%` : null;

    // Количество хоткеев
    const hotkeyCount = data.customHotkeys ? Object.keys(data.customHotkeys).length : 0;

    return (
      <div className="preset-card__tags">
        {/* 1. Тема плеера (расцветка фона) */}
        {themeConfig && (() => {
          const themeName = data.playerTheme ? (dict.settings.appearance.colorScheme.playerThemes[data.playerTheme] || themeConfig.name) : themeConfig.name;
          return (
            <div className="preset-tag" title={dict.settings.presets.themeTitle(themeName)}>
              <span
                className="preset-tag__color-dot"
                style={{
                  backgroundColor: themeConfig.dotColor,
                  border: "1.5px solid rgba(255, 255, 255, 0.35)",
                }}
              />
              <span>{dict.settings.presets.themeLabel(themeName)}</span>
            </div>
          );
        })()}

        {/* 2. Акцентный цвет */}
        {data.accentColor && (
          <div className="preset-tag" title={dict.settings.presets.accentTitle(data.accentColor)}>
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
          <div className="preset-tag" title={dict.settings.presets.neonTitle}>
            <Sparkles size={11} color="var(--accent)" />
            <span>
              {data.glowIntensity === "soft"
                ? dict.settings.presets.neonSoft
                : data.glowIntensity === "medium"
                ? dict.settings.presets.neonBalance
                : "High"}
            </span>
          </div>
        )}

        {/* 4. Ambient Light */}
        {data.ambient && (
          <div className="preset-tag" title={dict.settings.presets.ambientTitle}>
            <Sun size={11} />
            <span>
              {data.ambient.mode === "off"
                ? dict.settings.presets.ambientOff
                : data.ambient.mode === "blur"
                ? dict.settings.presets.ambientBlur
                : data.ambient.mode === "ambilight"
                ? dict.settings.presets.ambientAmbilight
                : dict.settings.presets.ambientColor}
            </span>

          </div>
        )}

        {/* 5. Аудио-визуалайзер */}
        {data.visualizer && (
          <div className="preset-tag" title={dict.settings.presets.visualizerTitle}>
            <AudioWaveform size={11} />
            <span>
              {data.visualizer.enabled && data.visualizer.placement !== "off"
                ? dict.settings.presets.visualizerMode(data.visualizer.mode)
                : dict.settings.presets.visualizerOff}
            </span>
          </div>
        )}

        {/* 6. Прозрачность UI */}
        {typeof data.uiOpacity === "number" && data.uiOpacity < 1 && (
          <div className="preset-tag" title={dict.settings.presets.opacityTitle}>
            <Eye size={11} />
            <span>{Math.round(data.uiOpacity * 100)}%</span>
          </div>
        )}

        {/* 7. Скругление углов */}
        {radiusText && (
          <div className="preset-tag" title={dict.settings.presets.radiusTitleTooltip}>
            <SlidersHorizontal size={11} />
            <span>{radiusText}</span>
          </div>
        )}

        {/* 8. Масштаб интерфейса (если не 100%) */}
        {scaleText && (
          <div className="preset-tag" title={dict.settings.presets.scaleTitle}>
            <Layers size={11} />
            <span>{scaleText}</span>
          </div>
        )}

        {/* 9. Кастомные бинды (если есть) */}
        {hotkeyCount > 0 && (
          <div className="preset-tag" title={dict.settings.presets.hotkeysTitle}>
            <Keyboard size={11} />
            <span>{dict.settings.presets.hotkeysLabel(hotkeyCount)}</span>
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
                <span className="preset-card__name" title={isBuiltIn && dict.settings.presets.builtinPresets[preset.id]?.name ? dict.settings.presets.builtinPresets[preset.id].name : preset.name}>
                  {isBuiltIn && dict.settings.presets.builtinPresets[preset.id]?.name ? dict.settings.presets.builtinPresets[preset.id].name : preset.name}
                </span>
              )}
              {isBuiltIn ? (
                <span className="preset-card__badge-builtin">{dict.settings.presets.badgeBuiltin}</span>
              ) : (
                <span className="preset-card__meta">
                  {formatDate(preset.updatedAt || preset.createdAt)}
                </span>
              )}
            </div>

            {isBuiltIn && (preset.description || dict.settings.presets.builtinPresets[preset.id]?.description) && (
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {dict.settings.presets.builtinPresets[preset.id]?.description || preset.description}
              </span>
            )}

            {renderPresetBadges(preset)}
          </div>

          <div className="preset-card__actions-col">
            <button
              type="button"
              className={`preset-action-btn ${isApplied ? "preset-action-btn--applied" : "preset-action-btn--apply"}`}
              onClick={() => handleApply(preset)}
              title={isBuiltIn ? dict.settings.presets.btnApplyBuiltinTitle : dict.settings.presets.btnApplyUserTitle}
            >
              {isApplied ? (
                <Check size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
              ) : (
                <Play size={13} style={{ flexShrink: 0 }} />
              )}
              <span>{isApplied ? dict.settings.presets.btnActive : dict.settings.presets.btnApply}</span>
            </button>

            {!isBuiltIn ? (
              <div className="preset-card__actions-grid">
                <button
                  type="button"
                  className="preset-action-btn preset-action-btn--icon"
                  onClick={() => handleOverwrite(preset)}
                  title={dict.settings.presets.btnUpdateTitle}
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
                  title={dict.settings.presets.btnRenameTitle}
                >
                  <Edit2 size={13} />
                </button>

                <button
                  type="button"
                  className="preset-action-btn preset-action-btn--icon"
                  onClick={() => handleExportSingle(preset)}
                  title={dict.settings.presets.btnExportTitle}
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
                title={dict.settings.presets.btnExportTitle}
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
            <span>{dict.settings.presets.saveCurrentTitle}</span>
          </div>
          <button
            type="button"
            className="presets-btn-text"
            onClick={handleNativeImport}
            title={dict.settings.presets.importTitle}
          >
            <Upload size={13} />
            <span>{dict.settings.presets.btnImport}</span>
          </button>
        </div>
        <div className="presets-creator__subtitle">
          {dict.settings.presets.saveDesc}
        </div>
        <form onSubmit={handleSaveCurrent} className="presets-creator__form">
          <input
            type="text"
            className="presets-creator__input"
            placeholder={dict.settings.presets.savePlaceholder}
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
          />
          <button type="submit" className="presets-creator__btn-save">
            <Plus size={15} />
            <span>{dict.settings.presets.btnSave}</span>
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
            <span>{dict.settings.presets.myPresetsLabel(userPresets.length)}</span>
          </button>

          <div className="presets-section-heading__actions">
            <button
              type="button"
              className="presets-btn-text"
              onClick={handleReload}
              title={dict.settings.presets.refreshTitle}
            >
              <RotateCw size={13} />
              <span>{dict.settings.presets.btnRefresh}</span>
            </button>
            <button
              type="button"
              className="presets-btn-text"
              onClick={handleNativeImport}
              title={dict.settings.presets.importTitle}
            >
              <Upload size={13} />
              <span>{dict.settings.presets.btnImport}</span>
            </button>
            {userPresets.length > 0 && (
              <>
                <button
                  type="button"
                  className="presets-btn-text"
                  onClick={handleExportAll}
                  title={dict.settings.presets.exportAllTitle}
                >
                  <Download size={13} />
                  <span>{dict.settings.presets.btnExportAll}</span>
                </button>
                <button
                  type="button"
                  className="presets-btn-text"
                  onClick={handleOpenFolder}
                  title={dict.settings.presets.folderTitle}
                >
                  <FolderOpen size={13} />
                  <span>{dict.settings.presets.btnFolder}</span>
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
                  title={dict.settings.presets.noPresetsTitle}
                  desc={dict.settings.presets.noPresetsDesc}
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
            <span>{dict.settings.presets.builtinLabel(BUILT_IN_PRESETS.length)}</span>
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
