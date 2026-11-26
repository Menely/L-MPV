import { Check, Loader2, RefreshCw, ArrowUpCircle } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";

interface SettingsUpdateActionProps {
  checking: boolean;
  status: string | null;
  hasUpdate: boolean;
  onCheck: () => void;
  onShowUpdate?: () => void;
  isCapsule?: boolean;
}

/** One footer slot: check → progress → temporary result or available update. */
export function SettingsUpdateAction({
  checking,
  status,
  hasUpdate,
  onCheck,
  onShowUpdate,
  isCapsule,
}: SettingsUpdateActionProps) {
  const { dict } = useTranslation();
  if (!checking && status) {
    if (hasUpdate && onShowUpdate) {
      return (
        <button
          type="button"
          onClick={onShowUpdate}
          className={`settings-footer__btn settings-footer__btn--update ${
            isCapsule ? "settings-card-btn--update" : ""
          }`}
        >
          <ArrowUpCircle size={16} />
          <span>{status}</span>
        </button>
      );
    }
    return (
      <span
        role="status"
        className={`settings-footer__btn settings-footer__status ${
          isCapsule ? "settings-card-btn--status" : ""
        }`}
      >
        {status === dict.settings.integration.upToDate && <Check size={16} aria-hidden="true" />}
        <span>{status}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onCheck}
      disabled={checking}
      className={`settings-footer__btn settings-footer__btn--check ${
        isCapsule ? "settings-card-btn--check-capsule" : ""
      }`}
      aria-label={dict.settings.integration.checkUpdates}
    >
      {checking ? (
        <Loader2 size={16} className="animate-spin settings-card-btn__icon" />
      ) : (
        <RefreshCw size={16} className="settings-card-btn__icon" />
      )}
      <span className="settings-card-btn__text">
        {checking ? dict.settings.integration.checking : dict.settings.integration.checkUpdates}
      </span>
    </button>
  );
}
