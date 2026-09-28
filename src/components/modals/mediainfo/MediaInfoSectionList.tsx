import React from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { MediaInfoProcessedSection } from "./mediaInfoTypes";

interface MediaInfoSectionItemProps {
  section: MediaInfoProcessedSection;
  isCollapsed: boolean;
  onToggleCollapse: (sectionId: string) => void;
  onCopySection: (sectionTitle: string, sectionCleanText: string) => void;
  isCopied: boolean;
  useRussian: boolean;
}

export const MediaInfoSectionItem: React.FC<MediaInfoSectionItemProps> = React.memo(({
  section,
  isCollapsed,
  onToggleCollapse,
  onCopySection,
  isCopied,
  useRussian,
}) => {
  // Если в секции найдены совпадения поиска, принудительно держим её развернутой
  const effectiveCollapsed = isCollapsed && !section.hasMatches;

  return (
    <div className="mediainfo-section">
      <div className="mediainfo-section__header">
        <button
          type="button"
          className="mediainfo-section__collapse-trigger"
          onClick={() => onToggleCollapse(section.id)}
          title={
            effectiveCollapsed
              ? useRussian ? "Развернуть категорию" : "Expand"
              : useRussian ? "Свернуть категорию" : "Collapse"
          }
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

        <button
          type="button"
          className={`mediainfo-section__copy-btn ${
            isCopied ? "mediainfo-section__copy-btn--copied" : ""
          }`}
          title={useRussian ? `Скопировать категорию «${section.title}»` : `Copy "${section.title}"`}
          onClick={() => onCopySection(section.title, section.cleanText)}
        >
          {isCopied ? (
            <>
              <Check size={12} color="#4ade80" />
              <span>{useRussian ? "Скопировано" : "Copied"}</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>{useRussian ? "Копировать" : "Copy"}</span>
            </>
          )}
        </button>
      </div>

      {!effectiveCollapsed && (
        <div className="mediainfo-section__rows">
          {section.rows.map((row) => (
            <div
              key={row.id}
              className={`mediainfo-row ${row.isMatch ? "mediainfo-row--match" : ""}`}
            >
              <span className="mediainfo-row__key">{row.key}</span>
              <span className="mediainfo-row__colon">:</span>
              <span className="mediainfo-row__val">{row.value}</span>
            </div>
          ))}
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
          useRussian={useRussian}
        />
      ))}
    </div>
  );
});

MediaInfoSectionList.displayName = "MediaInfoSectionList";
