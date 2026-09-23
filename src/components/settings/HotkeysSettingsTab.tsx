import React, { useState, useRef, useEffect } from "react";
import {
  Keyboard,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  HOTKEY_ACTIONS,
  getCustomHotkeys,
  saveCustomHotkeys,
  resetCustomHotkeys,
  resetSingleHotkey,
  getKeyDisplay,
  isCodeReservedForUpscaleOff,
  UPSCALE_OFF_ACTION_ID,
} from "../../utils/hotkeyUtils";
import { AccordionSection } from "../SettingsModal";
import { useTranslation } from "../../i18n/LanguageContext";

export interface HotkeysSettingsTabProps {
  /** Внешние состояния accordion-секций */
  openSections: Record<string, boolean>;
  onToggleSection: (id: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
}

/** Код комбинации из клавиатурного события. null — чистый модификатор. */
function buildKeyCode(e: React.KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  parts.push(e.code || e.key);
  return parts.join("+");
}

/** Код комбинации из события мыши. */
function buildMouseCode(e: React.MouseEvent): string {
  const btnMap: Record<number, string> = { 0: "MouseLeft", 1: "MouseMiddle", 2: "MouseRight" };
  return btnMap[e.button] || `MouseButton${e.button}`;
}

/** Владелец комбинации среди ДРУГИХ действий (для диалога конфликта). */
function findConflictOwner(
  code: string,
  hotkeys: Record<string, string[]>,
  excludeActionId: string
): { id: string; label: string } | null {
  const owner = HOTKEY_ACTIONS.find(
    (a) => a.id !== excludeActionId && (hotkeys[a.id] || []).includes(code)
  );
  return owner ? { id: owner.id, label: owner.label } : null;
}

interface HotkeyConflict {
  code: string;
  targetId: string;
  targetIndex: number;
  ownerId: string;
  ownerLabel: string;
  /** Зарезервированная комбинация: перезапись запрещена, только отмена */
  reserved?: boolean;
}

/** Группировка статична — считаем один раз на модуль, а не на каждый рендер. */
const CATEGORIZED_HOTKEYS: Record<string, typeof HOTKEY_ACTIONS> = HOTKEY_ACTIONS.reduce(
  (acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  },
  {} as Record<string, typeof HOTKEY_ACTIONS>
);

/**
 * Вкладка настроек горячих клавиш.
 * Управляет своими состояниями самостоятельно.
 */
export function HotkeysSettingsTab({
  openSections,
  onToggleSection,
  onRecordingChange,
}: HotkeysSettingsTabProps): React.ReactElement {
  const { dict, locale } = useTranslation();
  const [customHotkeys, setCustomHotkeys] = useState<Record<string, string[]>>(
    getCustomHotkeys()
  );
  const [recordingAction, setRecordingAction] = useState<{
    id: string;
    index: number;
  } | null>(null);
  // Конфликт: комбинация уже занята другим действием, ждём решения юзера
  const [conflict, setConflict] = useState<HotkeyConflict | null>(null);
  const ignoreClickUntilRef = useRef<number>(0);

  const cancelRecording = () => {
    setRecordingAction(null);
    setConflict(null);
  };

  // Финальная запись бинда. stealFrom — забрать комбинацию у другого действия.
  // Без сайд-эффектов внутри апдейтера: считаем от свежего стейта замыкания.
  const applyBinding = (targetId: string, index: number, code: string, stealFrom: string | null) => {
    const next: Record<string, string[]> = { ...customHotkeys };
    if (stealFrom) {
      next[stealFrom] = (next[stealFrom] || []).filter((c) => c !== code);
    }
    const arr = [...(next[targetId] || [])];
    if (index < arr.length) arr[index] = code;
    else arr.push(code);
    next[targetId] = arr;
    setCustomHotkeys(next);
    saveCustomHotkeys(next);
    setRecordingAction(null);
    setConflict(null);
  };

  // Запись с проверкой конфликта: чужой владелец -> диалог, свой -> тихо
  const tryCommitBinding = (
    targetId: string,
    index: number,
    code: string,
    hotkeys: Record<string, string[]>
  ) => {
    const current = hotkeys[targetId] || [];
    if (current[index] === code) {
      cancelRecording();
      return;
    }
    // Shift+1 зарезервировано за выключением апскейлинга — диалог без перезаписи
    if (isCodeReservedForUpscaleOff(code, targetId)) {
      const offAction = HOTKEY_ACTIONS.find((a) => a.id === UPSCALE_OFF_ACTION_ID);
      setConflict({
        code,
        targetId,
        targetIndex: index,
        ownerId: UPSCALE_OFF_ACTION_ID,
        ownerLabel: offAction?.label || dict.settings.hotkeys.fallbackOwner,
        reserved: true,
      });
      return;
    }
    const owner = findConflictOwner(code, hotkeys, targetId);
    if (!owner) {
      applyBinding(targetId, index, code, null);
    } else {
      setConflict({ code, targetId, targetIndex: index, ownerId: owner.id, ownerLabel: owner.label });
    }
  };

  useEffect(() => {
    if (onRecordingChange) {
      onRecordingChange(recordingAction !== null);
    }
  }, [recordingAction, onRecordingChange]);

  return (
    <div className="modal__section">
      <div
        style={{
          padding: "12px 16px",
          borderRadius: "var(--radius-md)",
          background: "var(--accent-glass)",
          border: "1px solid var(--border-pill)",
          color: "var(--accent)",
          fontSize: "0.86rem",
          lineHeight: "1.4",
          marginBottom: 16,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>{dict.settings.hotkeys.helpText}</span>
        <button
          onClick={() => {
            resetCustomHotkeys();
            setCustomHotkeys(getCustomHotkeys());
          }}
          style={{
            background: "rgba(255, 255, 255, 0.1)",
            border: "1px solid var(--border)",
            color: "white",
            borderRadius: "var(--radius-sm)",
            padding: "4px 8px",
            fontSize: "0.78rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
          }}
        >
          <RotateCcw size={12} /> {dict.settings.hotkeys.btnReset}
        </button>
      </div>

      <div
        className="modal__section-title"
        style={{ fontSize: "0.92rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "none", letterSpacing: "normal", marginBottom: 10 }}
      >
        {dict.settings.hotkeys.sectionTitle}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(CATEGORIZED_HOTKEYS).map(([category, items]) => {
          const secKey = `hk_${category}`;
          const isOpen = !!openSections[secKey];
          const categoryTitle = dict.settings.hotkeys.categories[category] || category;

          return (
            <AccordionSection
              key={category}
              isOpen={isOpen}
              onToggle={() => onToggleSection(secKey)}
              icon={<Keyboard size={16} />}
              title={categoryTitle}
              badge={
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 500, marginLeft: 4 }}>
                  ({items.length})
                </span>
              }
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 }}>
                {items.map((item) => {
                  const currentCodes = customHotkeys[item.id] || [];
                  const itemConflict = conflict?.targetId === item.id ? conflict : null;
                  const itemLabel = dict.settings.hotkeys.actions[item.id] || item.label;

                  return (
                    <React.Fragment key={item.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        className="modal__row"
                        style={{
                          flex: 1,
                          padding: "10px 14px",
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid rgba(255, 255, 255, 0.04)",
                          borderRadius: "var(--radius-md)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: 10,
                        }}
                      >
                        <span style={{ color: "var(--text-primary)", fontSize: "0.9rem", fontWeight: 500, flex: 1, minWidth: 200 }}>
                          {itemLabel}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {currentCodes.map((code, idx) => {
                            const isRecording = recordingAction?.id === item.id && recordingAction.index === idx;
                            const isConflicted =
                              conflict?.targetId === item.id && conflict.targetIndex === idx;
                            return (
                              <div key={idx} style={{ display: "flex", alignItems: "center" }}>
                                <button
                                  onClick={(e) => {
                                    if (Date.now() < ignoreClickUntilRef.current) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      return;
                                    }
                                    if (!isRecording) {
                                      setRecordingAction({ id: item.id, index: idx });
                                    } else {
                                      e.preventDefault();
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (isRecording) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      // Esc — отмена записи (глобальный хендлер модалки
                                      // при записи отключён через onRecordingChange)
                                      if (e.key === "Escape") {
                                        cancelRecording();
                                        return;
                                      }
                                      if (conflict) return;
                                      const newCode = buildKeyCode(e);
                                      if (!newCode) return;
                                      tryCommitBinding(item.id, idx, newCode, customHotkeys);
                                    }
                                  }}
                                  onMouseDown={(e) => {
                                    if (isRecording) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      ignoreClickUntilRef.current = Date.now() + 400;
                                      if (conflict) return;
                                      tryCommitBinding(item.id, idx, buildMouseCode(e), customHotkeys);
                                    }
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  style={{
                                    padding: "4px 10px",
                                    background: isConflicted
                                      ? "rgba(244, 67, 54, 0.14)"
                                      : isRecording
                                      ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)"
                                      : "rgba(127, 199, 255, 0.08)",
                                    border: isConflicted
                                      ? "1.5px solid #f44336"
                                      : isRecording
                                      ? "1.5px solid var(--accent)"
                                      : "1px solid rgba(127, 199, 255, 0.2)",
                                    boxShadow: isConflicted
                                      ? "0 0 8px rgba(244, 67, 54, 0.35), inset 0 0 0 1.5px #f44336"
                                      : isRecording
                                      ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px var(--accent)"
                                      : "none",
                                    borderRadius: "var(--radius-sm)",
                                    fontFamily: "monospace",
                                    fontSize: "0.84rem",
                                    fontWeight: 600,
                                    color: isConflicted
                                      ? "#fca5a5"
                                      : isRecording
                                      ? "var(--text-primary)"
                                      : "var(--accent)",
                                    cursor: "pointer",
                                    outline: "none",
                                    borderTopRightRadius: 0,
                                    borderBottomRightRadius: 0,
                                    transition: "background-color var(--t-fast) var(--ease-smooth), border-color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth), color var(--t-fast) var(--ease-smooth)",
                                  }}
                                >
                                  {isRecording ? dict.settings.hotkeys.pressKey : getKeyDisplay(code, locale)}
                                </button>
                                <button
                                  onClick={() => {
                                    const newCodes = currentCodes.filter((_, i) => i !== idx);
                                    const updated = { ...customHotkeys, [item.id]: newCodes };
                                    setCustomHotkeys(updated);
                                    saveCustomHotkeys(updated);
                                  }}
                                  title={dict.settings.hotkeys.btnRemove}
                                  style={{
                                    padding: "4px 6px",
                                    background: "rgba(255, 50, 50, 0.15)",
                                    border: "1px solid rgba(255, 50, 50, 0.3)",
                                    borderLeft: "none",
                                    borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                                    color: "#ff8888",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            );
                          })}

                          {/* Кнопка добавления нового бинда */}
                          {(() => {
                            const isRecordingNew = recordingAction?.id === item.id && recordingAction.index === currentCodes.length;
                            if (isRecordingNew) {
                              return (
                                <button
                                  onKeyDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (e.key === "Escape") {
                                      cancelRecording();
                                      return;
                                    }
                                    if (conflict) return;
                                    const newCode = buildKeyCode(e);
                                    if (!newCode) return;
                                    tryCommitBinding(item.id, currentCodes.length, newCode, customHotkeys);
                                  }}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    ignoreClickUntilRef.current = Date.now() + 400;
                                    if (conflict) return;
                                    tryCommitBinding(item.id, currentCodes.length, buildMouseCode(e), customHotkeys);
                                  }}
                                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  style={{
                                    padding: "4px 10px",
                                    background: "rgba(var(--accent-rgb, 127, 199, 255), 0.16)",
                                    border: "1.5px solid var(--accent)",
                                    boxShadow: "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px var(--accent)",
                                    borderRadius: "var(--radius-sm)",
                                    fontFamily: "monospace",
                                    fontSize: "0.84rem",
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                    cursor: "pointer",
                                    outline: "none",
                                  }}
                                >
                                  {dict.settings.hotkeys.pressKey}
                                </button>
                              );
                            }
                            return (
                              <button
                                onClick={(e) => {
                                  if (Date.now() < ignoreClickUntilRef.current) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    return;
                                  }
                                  // Новая запись отменяет висящий конфликт
                                  setConflict(null);
                                  setRecordingAction({ id: item.id, index: currentCodes.length });
                                }}
                                title={dict.settings.hotkeys.btnAddTitle}
                                style={{
                                  padding: "4px 8px",
                                  background: "rgba(255, 255, 255, 0.05)",
                                  border: "1px dashed rgba(255, 255, 255, 0.2)",
                                  borderRadius: "var(--radius-sm)",
                                  color: "var(--text-secondary)",
                                  cursor: "pointer",
                                  fontSize: "1rem",
                                  lineHeight: 1,
                                }}
                              >
                                +
                              </button>
                            );
                          })()}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const updated = resetSingleHotkey(item.id, customHotkeys);
                          setCustomHotkeys(updated);
                        }}
                        style={{
                          padding: "10px",
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid rgba(255, 255, 255, 0.04)",
                          borderRadius: "var(--radius-md)",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          transition: "background-color 0.15s ease, color 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--text-primary)";
                          e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--text-muted)";
                          e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                        }}
                      >
                        <RotateCcw size={16} />
                      </button>
                    </div>

                    {/* Баннер конфликта: комбинация уже занята другим действием */}
                    {itemConflict && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: 8,
                          marginTop: 6,
                          marginBottom: 2,
                          padding: "8px 12px",
                          background: "rgba(244, 67, 54, 0.08)",
                          border: "1px solid rgba(244, 67, 54, 0.35)",
                          borderRadius: "var(--radius-md)",
                          boxShadow: "0 0 12px rgba(244, 67, 54, 0.15)",
                        }}
                      >
                        <span style={{ fontSize: "0.80rem", color: "var(--text-primary)", lineHeight: 1.4 }}>
                          {(() => {
                            const ownerTitle = dict.settings.hotkeys.actions[itemConflict.ownerId] || itemConflict.ownerLabel;
                            const keyName = getKeyDisplay(itemConflict.code, locale);
                            return itemConflict.reserved ? (
                              <>
                                <span style={{ color: "#f87171", fontWeight: 700 }}>{dict.settings.hotkeys.conflictReserved} </span>
                                {dict.settings.hotkeys.conflictOnly(keyName || "", ownerTitle)}
                              </>
                            ) : (
                              <>
                                <span style={{ color: "#f87171", fontWeight: 700 }}>{dict.settings.hotkeys.conflictTaken} </span>
                                {keyName} — «{ownerTitle}»
                              </>
                            );
                          })()}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {!itemConflict.reserved && (
                            <button
                              type="button"
                              onClick={() => applyBinding(
                                itemConflict.targetId,
                                itemConflict.targetIndex,
                                itemConflict.code,
                                itemConflict.ownerId
                              )}
                              className="btn btn--danger btn--sm"
                              title={dict.settings.hotkeys.btnStealTitle}
                            >
                              {dict.settings.hotkeys.btnOverwrite}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={cancelRecording}
                            className="btn btn--secondary btn--sm"
                          >
                            {dict.settings.hotkeys.btnCancel}
                          </button>
                        </div>
                      </div>
                    )}
                    </React.Fragment>
                  );
                })}
              </div>
            </AccordionSection>
          );
        })}
      </div>
    </div>
  );
}
