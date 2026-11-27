import React from "react";
import { ArrowRight, ChevronDown, Check } from "lucide-react";
import { UpdateInfo, normalizeVersion } from "./updateTypes";
import type { Locale, TranslationDict } from "../../../i18n/types";
import { getIntlLocale } from "../../../i18n";

interface VersionPickerProps {
  currentVersion: string;
  targetVersion: string;
  isUpgrade: boolean;
  isDowngrade: boolean;
  isLoadingReleases: boolean;
  isPickerOpen: boolean;
  disabled?: boolean;
  onTogglePicker: () => void;
  releases: UpdateInfo[];
  locale: string;
  onSelectRelease: (rel: UpdateInfo) => void;
  pickerRef: React.RefObject<HTMLDivElement | null>;
  dict: TranslationDict;
}

/**
 * Выпадающий список выбора целевой версии релиза (Upgrade / Downgrade).
 */
export const VersionPicker: React.FC<VersionPickerProps> = React.memo(({
  currentVersion,
  targetVersion,
  isUpgrade,
  isDowngrade,
  isLoadingReleases,
  isPickerOpen,
  disabled = false,
  onTogglePicker,
  releases,
  locale,
  onSelectRelease,
  pickerRef,
  dict,
}) => (
  <div className="version-picker-wrap" ref={pickerRef}>
    <button
      type="button"
      onClick={disabled ? undefined : onTogglePicker}
      disabled={disabled}
      className={`version-picker-trigger ${isDowngrade ? "version-picker-trigger--downgrade" : ""}`}
      style={disabled ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
    >
      {isDowngrade || isUpgrade ? (
        <>
          <span>{currentVersion}</span>
          <ArrowRight size={12} style={{ opacity: 0.8 }} />
          <span>{targetVersion}</span>
        </>
      ) : (
        <span>v{currentVersion}</span>
      )}
      <ChevronDown
        size={13}
        style={{
          transform: isPickerOpen ? "rotate(180deg)" : "none",
          transition: "transform 0.15s ease",
          opacity: 0.85,
        }}
      />
    </button>

    {isPickerOpen && !disabled && (
      <div className="version-picker-popover" role="menu">
        <div className="version-picker-header">
          {isLoadingReleases
            ? dict.updateModal.loadingReleases
            : dict.updateModal.availableReleases(releases.length)}
        </div>
        <div className="version-picker-list custom-scrollbar">
          {releases.length === 0 && !isLoadingReleases ? (
            <div style={{ padding: "8px 10px", fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontStyle: "italic" }}>
              {dict.updateModal.releasesUnavailable}
            </div>
          ) : (
            releases.map((rel) => {
              const cleanRelVer = normalizeVersion(rel.latest_version);
              const isRelCurrent = cleanRelVer === currentVersion;
              const isRelSelected = cleanRelVer === targetVersion;
              return (
                <div
                  key={rel.latest_version}
                  onClick={() => onSelectRelease(rel)}
                  className={`version-picker-item ${isRelSelected ? "version-picker-item--active" : ""}`}
                  role="menuitem"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectRelease(rel);
                    }
                  }}
                >
                  <div className="row-center row-gap-3">
                    <span className="version-picker-item__tag">v{cleanRelVer}</span>
                    {isRelCurrent && (
                      <span className="version-picker-badge version-picker-badge--current">
                        {dict.updateModal.currentBadge}
                      </span>
                    )}
                  </div>
                  <div className="version-picker-item__meta">
                    {rel.published_at && (
                      <span>{new Date(rel.published_at).toLocaleDateString(getIntlLocale(locale as Locale))}</span>
                    )}
                    {isRelSelected && <Check size={13} color="var(--accent-text, var(--accent))" />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    )}
  </div>
));

VersionPicker.displayName = "VersionPicker";
