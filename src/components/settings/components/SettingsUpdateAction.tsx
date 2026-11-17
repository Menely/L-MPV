import { Check, Loader2, RefreshCw, ArrowUpCircle } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";

interface SettingsUpdateActionProps {
  checking: boolean;
  status: string | null;
  hasUpdate: boolean;
  onCheck: () => void;
  onShowUpdate?: () => void;
}

/** One footer slot: check → progress → temporary result or available update. */
export function SettingsUpdateAction({ checking, status, hasUpdate, onCheck, onShowUpdate }: SettingsUpdateActionProps) {
  const { dict } = useTranslation();
  if (!checking && status) {
    if (hasUpdate && onShowUpdate) {
      return <button type="button" onClick={onShowUpdate} className="settings-footer__btn settings-footer__btn--update">
        <ArrowUpCircle size={12} /><span>{status}</span>
      </button>;
    }
    return <span role="status" className="settings-footer__btn settings-footer__status">
      {status === dict.settings.integration.upToDate && <Check size={12} aria-hidden="true" />}
      <span>{status}</span>
    </span>;
  }
  return <button type="button" onClick={onCheck} disabled={checking} className="settings-footer__btn settings-footer__btn--check">
    {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
    <span>{checking ? dict.settings.integration.checking : dict.settings.integration.checkUpdates}</span>
  </button>;
}
