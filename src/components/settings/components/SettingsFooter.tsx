import React from "react";
import { Loader2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "../../../i18n/LanguageContext";
import type { UpdateInfo } from "../../modals/UpdateModal";
import { SettingsUpdateAction } from "./SettingsUpdateAction";

/**
 * Векторная иконка GitHub для ссылки на репозиторий.
 */
const GithubIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 20,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`${className || ""} block`}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

/**
 * Векторная иконка Telegram для ссылки на сообщество.
 */
const TelegramIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 20,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`${className || ""} block`}
  >
    <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l-.313 4.67c.458 0 .66-.21.916-.457l2.199-2.138 4.574 3.379c.843.464 1.45.225 1.66-.78l3.003-14.152c.307-1.233-.472-1.792-1.215-1.487z" />
  </svg>
);

interface SettingsFooterProps {
  isCapsule: boolean;
  appVersion: string;
  isLoadingVersionInfo: boolean;
  isCheckingUpdate: boolean;
  updateStatus: string | null;
  foundUpdate: UpdateInfo | null;
  onShowVersionInfo: () => void;
  onCheckForUpdates: () => void;
  onShowUpdate?: (update: UpdateInfo) => void;
}

/**
 * Единый нижний футер настроек для стилей «Капсула» и «Классический / Модерн».
 */
export function SettingsFooter({
  isCapsule,
  appVersion,
  isLoadingVersionInfo,
  isCheckingUpdate,
  updateStatus,
  foundUpdate,
  onShowVersionInfo,
  onCheckForUpdates,
  onShowUpdate,
}: SettingsFooterProps) {
  const { dict } = useTranslation();

  const brandNode = (
    <span className="settings-footer__title">
      L<span className="settings-footer__title-hyphen">-</span>MPV
    </span>
  );

  const socialButtonsNode = (
    <>
      <button
        type="button"
        onClick={() => openUrl("https://github.com/Menely/L-MPV")}
        className="settings-footer__icon-btn"
        title={dict.settings.integration.githubTooltip}
        aria-label={dict.settings.integration.githubTooltip}
      >
        <GithubIcon size={20} />
      </button>

      <button
        type="button"
        onClick={() => openUrl("https://t.me/+pI8qa9mSkINkYmFi")}
        className="settings-footer__icon-btn"
        title={dict.settings.integration.telegramTooltip}
        aria-label={dict.settings.integration.telegramTooltip}
      >
        <TelegramIcon size={20} />
      </button>
    </>
  );

  const versionButtonNode = (
    <button
      type="button"
      onClick={onShowVersionInfo}
      disabled={isLoadingVersionInfo || isCheckingUpdate}
      className="settings-card-btn--version"
    >
      {isLoadingVersionInfo ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <>
          <span className="settings-card-btn__label">
            {dict.settings.integration.versionLabel}
          </span>
          <span className="settings-card-btn__dot" aria-hidden="true" />
          <span className="settings-card-btn__val">v{appVersion}</span>
        </>
      )}
    </button>
  );

  const updateActionNode = (
    <SettingsUpdateAction
      checking={isCheckingUpdate || isLoadingVersionInfo}
      status={updateStatus}
      hasUpdate={foundUpdate?.has_update === true}
      onCheck={onCheckForUpdates}
      onShowUpdate={
        foundUpdate && onShowUpdate ? () => onShowUpdate(foundUpdate) : undefined
      }
      isCapsule={isCapsule}
    />
  );

  const editionNode = (
    <span className="settings-footer__edition">
      {dict.settings.integration.portableEdition}
    </span>
  );

  if (isCapsule) {
    return (
      <div className="settings-capsule-footer">
        {/* Карточка 1: Название плеера */}
        <div className="settings-card settings-card--footer-brand">
          {brandNode}
        </div>

        {/* Карточка 2: Иконки социальных сетей */}
        <div className="settings-card settings-card--footer-socials">
          {socialButtonsNode}
        </div>

        {/* Карточка 3: Версия, разделитель и кнопка проверки обновлений */}
        <div className="settings-card settings-card--footer-version">
          {versionButtonNode}
          <span className="settings-footer__divider" aria-hidden="true" />
          {updateActionNode}
        </div>

        {/* Карточка 4: Портативная редакция */}
        <div className="settings-card settings-card--footer-edition">
          {editionNode}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-footer">
      <div className="settings-footer__left">
        {brandNode}
        <div className="settings-footer__icons">{socialButtonsNode}</div>
        {versionButtonNode}
        <span className="settings-footer__divider" aria-hidden="true" />
        {updateActionNode}
      </div>
      {editionNode}
    </div>
  );
}
