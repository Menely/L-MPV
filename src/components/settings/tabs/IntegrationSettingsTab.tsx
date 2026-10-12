import React, { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Link,
  Link2,
  Loader2,
  ExternalLink,
  Trash2,
  FileText,
} from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";

/**
 * Вкладка интеграции с Windows: ассоциации файлов и контекстное меню Проводника.
 * Управляет своими состояниями самостоятельно.
 */
export function IntegrationSettingsTab(): React.ReactElement {
  const { dict } = useTranslation();
  const [integrationLogs, setIntegrationLogs] = useState<string[]>([]);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isUnregistering, setIsUnregistering] = useState<boolean>(false);
  const [isContextMenuRegistered, setIsContextMenuRegistered] = useState<boolean | null>(null);
  const [isContextMenuLoading, setIsContextMenuLoading] = useState<boolean>(false);

  const checkContextMenuStatus = useCallback(async () => {
    try {
      const reg = await invoke<boolean>("is_explorer_context_menu_registered");
      setIsContextMenuRegistered(reg);
    } catch {
      setIsContextMenuRegistered(false);
    }
  }, []);

  useEffect(() => {
    checkContextMenuStatus();
  }, [checkContextMenuStatus]);

  return (
    <div className="modal__section">
      <div
        className="modal__section-title"
        style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", fontSize: "var(--fs-md)", color: "var(--accent)", fontWeight: 600, textTransform: "none", letterSpacing: "normal" }}
        >
        <Link size={16} /> {dict.settings.integrationFields.fileAssocTitle}
      </div>
      <div style={{ fontSize: "var(--fs-base)", color: "var(--text-secondary)", marginTop: "var(--space-4)", marginBottom: "var(--space-7)", lineHeight: 1.5 }}>
        {dict.settings.integrationFields.fileAssocDesc}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginBottom: "var(--space-7)" }}>
        <button
          disabled={isRegistering || isUnregistering}
          onClick={async () => {
            setIsRegistering(true);
            try {
              const logs = await invoke<string[]>("register_file_associations");
              setIntegrationLogs(logs);
              await checkContextMenuStatus();
            } catch (e) {
              setIntegrationLogs([`[ERROR] ${dict.settings.integrationFields.errReg(String(e))}`]);
            } finally {
              setIsRegistering(false);
            }
          }}
          className="settings-action-btn settings-action-btn--primary"
          style={{ width: "100%" }}
          >
          {isRegistering ? (
            <>
              <Loader2 size={16} className="spin-animation" />
              {dict.settings.integrationFields.statusLinking}
            </>
          ) : (
            <>
              <Link2 size={16} />
              {dict.settings.integrationFields.btnLink}
            </>
          )}
        </button>

        <div style={{ display: "flex", gap: "var(--space-5)" }}>
          <button
            onClick={async () => {
              try {
                await invoke("open_default_apps_settings");
                setIntegrationLogs((prev) => [
                  ...prev,
                  "[INFO] Windows 'Default Apps' settings opened",
                ]);
              } catch (e) {
                setIntegrationLogs((prev) => [
                  ...prev,
                  `[ERROR] ${dict.settings.integrationFields.errOpenSettings(String(e))}`,
                ]);
              }
            }}
            className="settings-action-btn settings-action-btn--secondary flex-1"
            
>
            <ExternalLink size={15} /> {dict.settings.integrationFields.btnWindowsSettings}
          </button>

          <button
            disabled={isRegistering || isUnregistering}
            onClick={async () => {
              setIsUnregistering(true);
              try {
                const logs = await invoke<string[]>("unregister_file_associations");
                setIntegrationLogs(logs);
                await checkContextMenuStatus();
              } catch (e) {
                setIntegrationLogs([`[ERROR] ${dict.settings.integrationFields.errUnreg(String(e))}`]);
              } finally {
                setIsUnregistering(false);
              }
            }}
            className="settings-action-btn settings-action-btn--danger flex-1"
            
>
            {isUnregistering ? (
              <>
                <Loader2 size={15} className="spin-animation" />
                {dict.settings.integrationFields.statusUnlinking}
              </>
            ) : (
              <>
                <Trash2 size={15} /> {dict.settings.integrationFields.btnUnlink}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Контекстное меню Windows Explorer (MediaInfo) */}
      <div style={{ marginTop: "var(--space-9)", marginBottom: "var(--space-7)" }}>
        <div
          className="modal__section-title"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "var(--fs-md)",
            color: "var(--accent)",
            fontWeight: 600,
            textTransform: "none",
            letterSpacing: "normal",
          }}
          >
          <div className="row-center row-gap-4">
            <FileText size={16} /> {dict.settings.integrationFields.cmenuTitle}
          </div>
          {isContextMenuRegistered !== null && (
            <span
              style={{
                fontSize: "var(--fs-xs)",
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
                background: isContextMenuRegistered ? "rgba(34, 197, 94, 0.15)" : "rgba(148, 163, 184, 0.15)",
                color: isContextMenuRegistered ? "#4ade80" : "var(--text-muted)",
                fontWeight: 500,
              }}
              >
              {isContextMenuRegistered ? dict.settings.integrationFields.cmenuActive : dict.settings.integrationFields.cmenuInactive}
            </span>
          )}
        </div>
        <div style={{ fontSize: "var(--fs-base)", color: "var(--text-secondary)", marginTop: "var(--space-4)", marginBottom: "var(--space-7)", lineHeight: 1.5 }}>
          {dict.settings.integrationFields.cmenuDesc}
        </div>

        <div style={{ display: "flex", gap: "var(--space-5)" }}>
          <button
            disabled={isContextMenuLoading || isRegistering || isUnregistering}
            onClick={async () => {
              setIsContextMenuLoading(true);
              try {
                const logs = await invoke<string[]>("register_explorer_context_menu");
                setIntegrationLogs(logs);
                await checkContextMenuStatus();
              } catch (e) {
                setIntegrationLogs([`[ERROR] ${dict.settings.integrationFields.errCmenuReg(String(e))}`]);
              } finally {
                setIsContextMenuLoading(false);
              }
            }}
            className="settings-action-btn settings-action-btn--primary flex-1"
            
>
            {isContextMenuLoading ? (
              <>
                <Loader2 size={15} className="spin-animation" />
                {dict.settings.integrationFields.statusApplying}
              </>
            ) : (
              <>
                <FileText size={15} />
                {dict.settings.integrationFields.btnAddCmenu}
              </>
            )}
          </button>

          <button
            disabled={isContextMenuLoading || isRegistering || isUnregistering}
            onClick={async () => {
              setIsContextMenuLoading(true);
              try {
                const logs = await invoke<string[]>("unregister_explorer_context_menu");
                setIntegrationLogs(logs);
                await checkContextMenuStatus();
              } catch (e) {
                setIntegrationLogs([`[ERROR] ${dict.settings.integrationFields.errCmenuUnreg(String(e))}`]);
              } finally {
                setIsContextMenuLoading(false);
              }
            }}
            className="settings-action-btn settings-action-btn--danger flex-1"
            
>
            <Trash2 size={15} />
            {dict.settings.integrationFields.btnRemoveCmenu}
          </button>
        </div>
      </div>

      <div
        role="log"
        aria-live="polite"
        tabIndex={0}
        style={{
          background: "#0c0c0c",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "var(--space-6)",
          height: "200px",
          overflowY: "auto",
          overflowX: "auto",
          overflowWrap: "anywhere",
          fontFamily: "monospace",
          fontSize: "var(--fs-sm)",
          color: "#d4d4d4",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
        >
        {integrationLogs.length === 0 ? (
          <span style={{ color: "#808080" }}>{dict.settings.integrationFields.logPlaceholder}</span>
        ) : (
          integrationLogs.map((log, i) => {
            let color = "#d4d4d4";
            if (log.startsWith("[OK]") || log.startsWith("[DONE]")) color = "#4caf50";
            if (log.startsWith("[ERROR]")) color = "#f44336";
            if (log.startsWith("[WARN]")) color = "#ff9800";
            if (log.startsWith("[INFO]")) color = "#2196f3";
            return (
              <div key={i} style={{ color }}>{log}</div>
            );
          })
        )}
      </div>
    </div>
  );
}
