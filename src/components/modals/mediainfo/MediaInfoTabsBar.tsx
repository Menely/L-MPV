import React from "react";
import { ChevronsUpDown } from "lucide-react";
import { CategoryKey, MediaInfoCategoryTab } from "./mediaInfoTypes";

interface MediaInfoTabsBarProps {
  tabs: MediaInfoCategoryTab[];
  activeCategory: CategoryKey;
  onSelectCategory: (category: CategoryKey) => void;
  areAllCollapsed: boolean;
  onToggleCollapseAll: () => void;
  useRussian: boolean;
  style?: React.CSSProperties;
}

export const MediaInfoTabsBar: React.FC<MediaInfoTabsBarProps> = React.memo(({
  tabs,
  activeCategory,
  onSelectCategory,
  areAllCollapsed,
  onToggleCollapseAll,
  useRussian,
  style,
}) => {
  if (tabs.length <= 1) return null;

  return (
    <div className="mediainfo-standalone__tabs-bar" style={style}>
      <div className="mediainfo-standalone__tabs-list">
        {tabs.map((tab) => {
          const isActive = activeCategory === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`mediainfo-tab-chip ${isActive ? "mediainfo-tab-chip--active" : ""}`}
              onClick={() => onSelectCategory(isActive && tab.key !== "all" ? "all" : tab.key)}
            >
              <span>{tab.label}</span>
              {tab.count > 1 && (
                <span className="mediainfo-tab-chip__badge">{tab.count}</span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="mediainfo-tab-action-btn"
        title={
          areAllCollapsed
            ? useRussian ? "Развернуть все секции" : "Expand all"
            : useRussian ? "Свернуть все секции" : "Collapse all"
        }
        onClick={onToggleCollapseAll}
      >
        <ChevronsUpDown size={12} />
        <span>
          {areAllCollapsed
            ? useRussian ? "Развернуть" : "Expand"
            : useRussian ? "Свернуть" : "Collapse"}
        </span>
      </button>
    </div>
  );
});

MediaInfoTabsBar.displayName = "MediaInfoTabsBar";
