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
} from "../../utils/hotkeyUtils";
import { AccordionSection } from "../SettingsModal";

export interface HotkeysSettingsTabProps {
  /** Внешние состояния accordion-секций */
  openSections: Record<string, boolean>;
  onToggleSection: (id: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
}

/**
 * Вкладка настроек горячих клавиш.
 * Управляет своими состояниями самостоятельно.
 */
export function HotkeysSettingsTab({
  openSections,
  onToggleSection,
  onRecordingChange,
}: HotkeysSettingsTabProps): React.ReactElement {
  const [customHotkeys, setCustomHotkeys] = useState<Record<string, string[]>>(
    getCustomHotkeys()
  );
  const [recordingAction, setRecordingAction] = useState<{
    id: string;
    index: number;
  } | null>(null);
  const ignoreClickUntilRef = useRef<number>(0);

  useEffect(() => {
    if (onRecordingChange) {
      onRecordingChange(recordingAction !== null);
    }
  }, [recordingAction, onRecordingChange]);

  const categorizedHotkeys = HOTKEY_ACTIONS.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, typeof HOTKEY_ACTIONS>
  );

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
        <span>💡 Нажмите на любую клавишу в списке ниже, чтобы назначить свою комбинацию!</span>
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
          <RotateCcw size={12} /> Сбросить
        </button>
      </div>

      <div
        className="modal__section-title"
        style={{ fontSize: "0.92rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "none", letterSpacing: "normal", marginBottom: 10 }}
      >
        Назначения горячих клавиш
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(categorizedHotkeys).map(([category, items]) => {
          const secKey = `hk_${category}`;
          const isOpen = !!openSections[secKey];

          return (
            <AccordionSection
              key={category}
              isOpen={isOpen}
              onToggle={() => onToggleSection(secKey)}
              icon={<Keyboard size={16} />}
              title={category}
              badge={
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 500, marginLeft: 4 }}>
                  ({items.length})
                </span>
              }
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 }}>
                {items.map((item) => {
                  const currentCodes = customHotkeys[item.id] || [];

                  return (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                          {item.label}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {currentCodes.map((code, idx) => {
                            const isRecording = recordingAction?.id === item.id && recordingAction.index === idx;
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
                                      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
                                      const parts: string[] = [];
                                      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
                                      if (e.shiftKey) parts.push("Shift");
                                      if (e.altKey) parts.push("Alt");
                                      parts.push(e.code || e.key);
                                      const newCode = parts.join("+");
                                      const newCodes = [...currentCodes];
                                      newCodes[idx] = newCode;
                                      const updated = { ...customHotkeys, [item.id]: newCodes };
                                      setCustomHotkeys(updated);
                                      saveCustomHotkeys(updated);
                                      setRecordingAction(null);
                                    }
                                  }}
                                  onMouseDown={(e) => {
                                    if (isRecording) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      ignoreClickUntilRef.current = Date.now() + 400;
                                      const btnMap: Record<number, string> = { 0: "MouseLeft", 1: "MouseMiddle", 2: "MouseRight" };
                                      const newCode = btnMap[e.button] || `MouseButton${e.button}`;
                                      const newCodes = [...currentCodes];
                                      newCodes[idx] = newCode;
                                      const updated = { ...customHotkeys, [item.id]: newCodes };
                                      setCustomHotkeys(updated);
                                      saveCustomHotkeys(updated);
                                      setRecordingAction(null);
                                    }
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  style={{
                                    padding: "4px 10px",
                                    background: isRecording
                                      ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)"
                                      : "rgba(127, 199, 255, 0.08)",
                                    border: isRecording
                                      ? "1.5px solid var(--accent)"
                                      : "1px solid rgba(127, 199, 255, 0.2)",
                                    boxShadow: isRecording
                                      ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px var(--accent)"
                                      : "none",
                                    borderRadius: "var(--radius-sm)",
                                    fontFamily: "monospace",
                                    fontSize: "0.84rem",
                                    fontWeight: 600,
                                    color: isRecording ? "var(--text-primary)" : "var(--accent)",
                                    cursor: "pointer",
                                    outline: "none",
                                    borderTopRightRadius: 0,
                                    borderBottomRightRadius: 0,
                                  }}
                                >
                                  {isRecording ? "Нажмите..." : getKeyDisplay(code)}
                                </button>
                                <button
                                  onClick={() => {
                                    const newCodes = currentCodes.filter((_, i) => i !== idx);
                                    const updated = { ...customHotkeys, [item.id]: newCodes };
                                    setCustomHotkeys(updated);
                                    saveCustomHotkeys(updated);
                                  }}
                                  title="Удалить"
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
                                    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
                                    const parts: string[] = [];
                                    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
                                    if (e.shiftKey) parts.push("Shift");
                                    if (e.altKey) parts.push("Alt");
                                    parts.push(e.code || e.key);
                                    const newCode = parts.join("+");
                                    const updatedCodes = [...currentCodes, newCode];
                                    const updated = { ...customHotkeys, [item.id]: updatedCodes };
                                    setCustomHotkeys(updated);
                                    saveCustomHotkeys(updated);
                                    setRecordingAction(null);
                                  }}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    ignoreClickUntilRef.current = Date.now() + 400;
                                    const btnMap: Record<number, string> = { 0: "MouseLeft", 1: "MouseMiddle", 2: "MouseRight" };
                                    const newCode = btnMap[e.button] || `MouseButton${e.button}`;
                                    const updatedCodes = [...currentCodes, newCode];
                                    const updated = { ...customHotkeys, [item.id]: updatedCodes };
                                    setCustomHotkeys(updated);
                                    saveCustomHotkeys(updated);
                                    setRecordingAction(null);
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
                                  Нажмите...
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
                                  setRecordingAction({ id: item.id, index: currentCodes.length });
                                }}
                                title="Добавить клавишу"
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
                          transition: "all 0.15s ease",
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
