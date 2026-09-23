import React, { memo, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  X,
  Minus,
  ChevronRight,
  FolderOpen,
  AudioLines,
  Subtitles,
  BookOpen,
  Monitor,
  RotateCw,
  Sparkles,
  Zap,
  Repeat,
  Shuffle,
  Pin,
  Camera,
  Info,
  FileText,
  Clock,
  Timer,
  LayoutTemplate,
  Settings,
  SlidersHorizontal,
  Cpu,
  Eye,
} from "lucide-react";
import type { LayoutEntry } from "../../utils/contextMenuLayout";
import {
  type MenuItemDescriptor,
  getLocalizedMenuItem,
} from "../../utils/contextMenuRegistry";
import { useTranslation } from "../../i18n/LanguageContext";

/** Статичный маппинг имени иконки в React-элемент превью. */
export const MENU_ICON_MAP: Record<string, React.ReactNode> = {
  FolderOpen: <FolderOpen size={14} />,
  AudioLines: <AudioLines size={14} />,
  Subtitles: <Subtitles size={14} />,
  BookOpen: <BookOpen size={14} />,
  Monitor: <Monitor size={14} />,
  RotateCw: <RotateCw size={14} />,
  Sparkles: <Sparkles size={14} />,
  Zap: <Zap size={14} />,
  Cpu: <Cpu size={14} />,
  Repeat: <Repeat size={14} />,
  Shuffle: <Shuffle size={14} />,
  Pin: <Pin size={14} />,
  Camera: <Camera size={14} />,
  Info: <Info size={14} />,
  FileText: <FileText size={14} />,
  SlidersHorizontal: <SlidersHorizontal size={14} />,
  Clock: <Clock size={14} />,
  Timer: <Timer size={14} />,
  LayoutTemplate: <LayoutTemplate size={14} />,
  Eye: <Eye size={14} />,
  Settings: <Settings size={14} />,
};

export interface SortableCardProps {
  id: string;
  entry: LayoutEntry;
  descriptor?: MenuItemDescriptor;
  onRemove: (key: string) => void;
  onAddDividerBefore: (key: string) => void;
}

/**
 * Мемоизированная интерактивная карточка пункта или разделителя меню.
 * Поддерживает перетаскивание как за ручку Grip, так и за всю плоскость строки.
 */
export const SortableCard = memo(function SortableCard({
  id,
  entry,
  descriptor,
  onRemove,
  onAddDividerBefore,
}: SortableCardProps) {
  const { dict } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(id);
  }, [onRemove, id]);

  const handleAddDivider = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onAddDividerBefore(id);
  }, [onAddDividerBefore, id]);

  if (entry.type === "divider") {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`cmenu-entry cmenu-entry--divider ${isDragging ? "cmenu-entry--dragging" : ""}`}
        {...attributes}
        {...listeners}
      >
        <span className="cmenu-entry__grip" title={dict.settings.contextMenuConfig.dragTooltip}>
          <GripVertical size={14} style={{ pointerEvents: "none" }} />
        </span>
        <div className="cmenu-entry__divider-line">
          <span className="cmenu-entry__divider-label">{dict.settings.contextMenuConfig.dividerLabel}</span>
        </div>
        <button
          type="button"
          className="cmenu-entry__remove"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={handleRemove}
          title={dict.settings.contextMenuConfig.btnRemoveDivider}
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`cmenu-entry ${isDragging ? "cmenu-entry--dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        className="cmenu-entry__add-divider"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={handleAddDivider}
        title={dict.settings.contextMenuConfig.btnAddDividerBefore}
      >
        <Minus size={11} />
      </button>
      <span
        className="cmenu-entry__grip"
        title={dict.settings.contextMenuConfig.dragOrderTooltip}
      >
        <GripVertical size={14} style={{ pointerEvents: "none" }} />
      </span>
      <span className="cmenu-entry__icon" style={{ pointerEvents: "none" }}>
        {descriptor ? MENU_ICON_MAP[descriptor.iconName] : null}
      </span>
      <div className="cmenu-entry__info" style={{ pointerEvents: "none" }}>
        <span className="cmenu-entry__label">
          {descriptor ? getLocalizedMenuItem(dict, descriptor).label : entry.id}
        </span>
        {descriptor?.hasSubmenu && (
          <ChevronRight size={11} className="cmenu-entry__submenu-hint" />
        )}
      </div>
      <button
        type="button"
        className="cmenu-entry__remove"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={handleRemove}
        title={dict.settings.contextMenuConfig.btnRemoveItem}
      >
        <X size={12} />
      </button>
    </div>
  );
});

/**
 * Статичная карточка для отображения в DragOverlay во время перетаскивания.
 * Оптимизирована для плавной отрисовки с отключенным перехватом событий указателя.
 */
export function OverlayCard({
  entry,
  descriptor,
}: {
  entry: LayoutEntry;
  descriptor?: MenuItemDescriptor;
}) {
  const { dict } = useTranslation();
  if (entry.type === "divider") {
    return (
      <div className="cmenu-entry cmenu-entry--divider cmenu-entry--overlay">
        <span className="cmenu-entry__grip"><GripVertical size={14} /></span>
        <div className="cmenu-entry__divider-line">
          <span className="cmenu-entry__divider-label">{dict.settings.contextMenuConfig.dividerLabel}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="cmenu-entry cmenu-entry--overlay">
      <span className="cmenu-entry__grip"><GripVertical size={14} /></span>
      <span className="cmenu-entry__icon">
        {descriptor ? MENU_ICON_MAP[descriptor.iconName] : null}
      </span>
      <div className="cmenu-entry__info">
        <span className="cmenu-entry__label">
          {descriptor ? getLocalizedMenuItem(dict, descriptor).label : entry.id}
        </span>
        {descriptor?.hasSubmenu && (
          <ChevronRight size={11} className="cmenu-entry__submenu-hint" />
        )}
      </div>
    </div>
  );
}
