import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CopyCheckMorphIcon } from "../../common/CopyCheckMorphIcon";
import { MediaInfoProcessedSection, getSectionCategoryKey } from "./mediaInfoTypes";

interface MediaInfoSectionItemProps {
  section: MediaInfoProcessedSection;
  isCollapsed: boolean;
  onToggleCollapse: (sectionId: string) => void;
  onCopySection: (sectionTitle: string, sectionCleanText: string) => void;
  isCopied: boolean;
  copiedRowId: string | number | null;
  onCopyRow: (rowId: string | number, value: string) => void;
  useRussian: boolean;
}

/** Определение флага дорожки по умолчанию / принудительной по строкам MediaInfo. */
function getTrackFlagBadge(
  section: MediaInfoProcessedSection,
  useRussian: boolean
): string | null {
  const cat = getSectionCategoryKey(section.title);
  if (cat !== "audio" && cat !== "text") return null;

  let isDefault = false;
  let isForced = false;
  for (const r of section.rows) {
    const k = r.key.trim().toLowerCase();
    const v = r.value.trim().toLowerCase();
    const truthy = v === "yes" || v === "да";
    if (!truthy) continue;
    if (k === "default" || k === "по умолчанию") isDefault = true;
    if (k === "forced" || k === "принудительно") isForced = true;
  }
  if (isForced) return useRussian ? "Принуд." : "Forced";
  if (isDefault) return useRussian ? "По умолч." : "Default";
  return null;
}

export const MediaInfoSectionItem: React.FC<MediaInfoSectionItemProps> = React.memo(({
  section,
  isCollapsed,
  onToggleCollapse,
  onCopySection,
  isCopied,
  copiedRowId,
  onCopyRow,
  useRussian,
}) => {
  // Если в секции найдены совпадения поиска, принудительно держим её развернутой
  const effectiveCollapsed = isCollapsed && !section.hasMatches;
  const flagBadge = getTrackFlagBadge(section, useRussian);

  return (
    <div className="mediainfo-section">
      <div className="mediainfo-section__header">
        <div className="mediainfo-section__header-left">
          <button
            type="button"
            className="mediainfo-section__collapse-trigger"
            onClick={() => onToggleCollapse(section.id)}
          >
            <span className="mediainfo-section__chevron">
              {effectiveCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </span>
            <span className="mediainfo-section__title">{section.title}</span>
            <span className="mediainfo-section__count-badge">
              {section.rows.length} {useRussian ? "свойств" : "props"}
            </span>
            {section.matchesCount > 0 && (
              <span className="mediainfo-section__match-badge">
                {section.matchesCount} {useRussian ? "совп." : "match"}
              </span>
            )}
          </button>

          {flagBadge && (
            <span className="mediainfo-section__flag-badge">{flagBadge}</span>
          )}

          {section.streamTitle && (
            <span
              className="mediainfo-section__stream-title"
              title={section.streamTitle}
            >
              {section.streamTitle}
            </span>
          )}
        </div>

        <button
          type="button"
          className={`mediainfo-section__copy-btn ${
            isCopied ? "mediainfo-section__copy-btn--copied" : ""
          }`}
          title={
            useRussian
              ? `Скопировать категорию «${section.title}${section.streamTitle ? ` — ${section.streamTitle}` : ""}»`
              : `Copy "${section.title}${section.streamTitle ? ` — ${section.streamTitle}` : ""}"`
          }
          onClick={() => onCopySection(section.title, section.cleanText)}
        >
          <CopyCheckMorphIcon copied={isCopied} size={14} />
        </button>
      </div>

      {!effectiveCollapsed && (
        <div className="mediainfo-section__rows">
          {section.rows.map((row) => {
            const isRowCopied = copiedRowId === row.id;
            return (
              <div
                key={row.id}
                className={`mediainfo-row ${row.isMatch ? "mediainfo-row--match" : ""}`}
              >
                <span className="mediainfo-row__key">{row.key}</span>
                <span className="mediainfo-row__colon">:</span>
                <span className="mediainfo-row__val">{row.value}</span>
                {row.value && (
                  <button
                    type="button"
                    className={`mediainfo-row__copy-btn ${
                      isRowCopied ? "mediainfo-row__copy-btn--copied" : ""
                    }`}
                    title={
                      useRussian
                        ? (isRowCopied ? "Скопировано!" : "Скопировать значение")
                        : (isRowCopied ? "Copied!" : "Copy value")
                    }
                    aria-label={
                      useRussian ? `Скопировать ${row.key}` : `Copy ${row.key}`
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopyRow(row.id, row.value);
                    }}
                  >
                    <CopyCheckMorphIcon copied={isRowCopied} size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

MediaInfoSectionItem.displayName = "MediaInfoSectionItem";

interface MediaInfoSectionListProps {
  sections: MediaInfoProcessedSection[];
  collapsedSections: Set<string>;
  onToggleSection: (sectionId: string) => void;
  onCopySection: (sectionTitle: string, sectionCleanText: string) => void;
  copiedSectionId: string | null;
  useRussian: boolean;
}

export const MediaInfoSectionList: React.FC<MediaInfoSectionListProps> = React.memo(({
  sections,
  collapsedSections,
  onToggleSection,
  onCopySection,
  copiedSectionId,
  useRussian,
}) => {
  const [copiedRowId, setCopiedRowId] = useState<string | number | null>(null);
  const copyRowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyRowTimerRef.current) clearTimeout(copyRowTimerRef.current);
    };
  }, []);

  const handleCopyRow = useCallback(async (rowId: string | number, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedRowId(rowId);
      if (copyRowTimerRef.current) clearTimeout(copyRowTimerRef.current);
      copyRowTimerRef.current = setTimeout(() => setCopiedRowId(null), 2000);
    } catch (e) {
      console.error("Ошибка копирования значения свойства:", e);
    }
  }, []);

  return (
    <div className="mediainfo-standalone__content">
      {sections.map((section) => (
        <MediaInfoSectionItem
          key={section.id}
          section={section}
          isCollapsed={collapsedSections.has(section.id)}
          onToggleCollapse={onToggleSection}
          onCopySection={onCopySection}
          isCopied={copiedSectionId === section.title}
          copiedRowId={copiedRowId}
          onCopyRow={handleCopyRow}
          useRussian={useRussian}
        />
      ))}
    </div>
  );
});

MediaInfoSectionList.displayName = "MediaInfoSectionList";
