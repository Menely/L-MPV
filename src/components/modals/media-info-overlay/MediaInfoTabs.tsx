import React, { useRef } from "react";
import type { MediaInfoOverlayTab } from "./mediaInfoOverlayUtils";
import { useTranslation } from "../../../i18n/LanguageContext";

/**
 * Пропсы панели переключения вкладок всплывающего окна MediaInfo.
 */
export interface MediaInfoTabsProps {
  /** Активная вкладка. */
  activeTab: MediaInfoOverlayTab;
  /** Обработчик переключения вкладки. */
  onTabChange: (tab: MediaInfoOverlayTab) => void;
}

/**
 * Модульный компонент навигации по вкладкам окна медиаинформации (клавиша I).
 * В стиле «Капсула» оформляется как самостоятельный парящий островок с чипами.
 * В стилях «Модерн» и «Классика» располагается монолитной полосой под шапкой.
 */
export const MediaInfoTabs: React.FC<MediaInfoTabsProps> = ({
  activeTab,
  onTabChange,
}) => {
  const { dict } = useTranslation();
  const lastWheelTimeRef = useRef<number>(0);

  const tabs: Array<{ id: MediaInfoOverlayTab; label: string }> = [
    { id: "summary", label: dict.mediaInfoModal.tabSummary },
    { id: "rendering", label: dict.mediaInfoModal.tabRendering },
    { id: "tracks", label: dict.mediaInfoModal.tabTracks },
  ];

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const now = Date.now();
    // Порог 180мс исключает хаотичный перескок вкладок при непрерывной прокрутке колеса
    if (now - lastWheelTimeRef.current < 180) {
      return;
    }
    lastWheelTimeRef.current = now;

    const order: MediaInfoOverlayTab[] = ["summary", "rendering", "tracks"];
    const currentIndex = order.indexOf(activeTab);
    if (e.deltaY > 0) {
      const nextIndex = (currentIndex + 1) % order.length;
      onTabChange(order[nextIndex]);
    } else if (e.deltaY < 0) {
      const prevIndex = (currentIndex - 1 + order.length) % order.length;
      onTabChange(order[prevIndex]);
    }
  };

  return (
    <div
      className="media-info__tabs"
      role="tablist"
      aria-label="Вкладки медиаинформации"
      onWheel={handleWheel}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`media-info__tab-btn ${
              isActive ? "media-info__tab-btn--active" : ""
            }`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="media-info__tab-text">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

