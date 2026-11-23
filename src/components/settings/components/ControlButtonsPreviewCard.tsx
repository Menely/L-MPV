import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  closestCenter,
  getClientRect,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDndContext,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Pin,
  Info,
  FileText,
  AudioWaveform,
  Camera,
  ListVideo,
  Maximize,
  FastForward,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";
import { SpeedIcon } from "../../player/controls/SpeedIcon";
import { toLocalDragTransform } from "../../../utils/dndCoordinates";
import { getActiveUiScale } from "../../../utils/uiThemeUtils";
import {
  type ControlBarStyle,
  getSavedControlBarStyle,
} from "../../../utils/controlBarStyleUtils";
import {
  ALL_UTILITY_BUTTON_IDS,
  type UtilityButtonId,
  getSavedUtilityCards,
  saveUtilityCards,
  resetUtilityCards,
  isDefaultUtilityCards,
  isUtilityButtonId,
  UTILITY_CARDS_CHANGED_EVENT,
} from "../../../utils/controlBarUtilityLayout";

interface ControlButtonsPreviewCardProps {
  visibleButtons: Record<string, boolean>;
  skipOpeningSeconds: number;
  seekStepSeconds?: number;
}

interface KeyedUtilityCard {
  key: string;
  items: UtilityButtonId[];
}

interface ButtonVisual {
  title: string;
  isBadge: boolean;
  content: React.ReactNode;
}

let cardKeyCounter = 0;

function nextCardKey(): string {
  cardKeyCounter += 1;
  return `utility-card-${Date.now()}-${cardKeyCounter}`;
}

function attachCardKeys(cards: UtilityButtonId[][]): KeyedUtilityCard[] {
  return cards.map((items) => ({
    key: nextCardKey(),
    items: [...items],
  }));
}

const DEFAULT_VISIBILITY: Record<UtilityButtonId, boolean> = {
  speed: false,
  skipOpening: false,
  alwaysOnTop: true,
  info: true,
  mediaInfo: true,
  visualizer: true,
  playlist: true,
  screenshot: true,
  fullscreen: true,
};

interface SortableUtilityChipProps {
  id: UtilityButtonId;
  visual: ButtonVisual;
}

const SortableUtilityChip = memo(function SortableUtilityChip({
  id,
  visual,
}: SortableUtilityChipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const localTransform = isDragging
    ? null
    : toLocalDragTransform(transform, getActiveUiScale());

  const buttonStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(localTransform),
    transition: isDragging ? undefined : transition,
  };

  return (
    <div ref={setNodeRef} className="control-buttons-builder__slot">
      <button
        type="button"
        style={buttonStyle}
        title={visual.title}
        aria-label={visual.title}
        className={`control-buttons-builder__chip ${
          visual.isBadge ? "control-buttons-builder__chip--badge" : ""
        } ${isDragging ? "control-buttons-builder__chip--placeholder" : ""}`}
        {...attributes}
        {...listeners}
      >
        {visual.content}
      </button>
    </div>
  );
});

function UtilityDragOverlayPreview({
  visual,
  scale,
}: {
  visual: ButtonVisual;
  scale: number;
}) {
  const { activeNodeRect } = useDndContext();
  if (!activeNodeRect) return null;

  return (
    <div
      className={`control-buttons-builder__chip control-buttons-builder__chip--dragging ${
        visual.isBadge ? "control-buttons-builder__chip--badge" : ""
      }`}
      style={{
        pointerEvents: "none",
        cursor: "grabbing",
        zoom: scale,
        width: activeNodeRect.width / scale,
        height: activeNodeRect.height / scale,
        boxSizing: "border-box",
      }}
    >
      {visual.content}
    </div>
  );
}

interface DroppableUtilityCardProps {
  card: KeyedUtilityCard;
  visibleIds: UtilityButtonId[];
  canRemove: boolean;
  isDropTarget: boolean;
  emptyHint: string;
  removeTitle: string;
  onRemove: (cardKey: string) => void;
  getVisual: (id: UtilityButtonId) => ButtonVisual;
}

const DroppableUtilityCard = memo(function DroppableUtilityCard({
  card,
  visibleIds,
  canRemove,
  isDropTarget,
  emptyHint,
  removeTitle,
  onRemove,
  getVisual,
}: DroppableUtilityCardProps) {
  const { setNodeRef, isOver } = useDroppable({ id: card.key });
  const isEmpty = visibleIds.length === 0;
  const highlighted = isOver || isDropTarget;

  return (
    <div
      ref={setNodeRef}
      className={`control-buttons-builder__card ${
        isEmpty ? "control-buttons-builder__card--empty" : ""
      } ${highlighted ? "control-buttons-builder__card--over" : ""}`}
    >
      <SortableContext items={visibleIds} strategy={horizontalListSortingStrategy}>
        <div className="control-buttons-builder__card-items">
          {isEmpty ? (
            <span className="control-buttons-builder__empty-text">{emptyHint}</span>
          ) : (
            visibleIds.map((id) => (
              <SortableUtilityChip key={id} id={id} visual={getVisual(id)} />
            ))
          )}
        </div>
      </SortableContext>

      {canRemove && (
        <button
          type="button"
          className="control-buttons-builder__card-remove"
          title={removeTitle}
          aria-label={removeTitle}
          onClick={() => onRemove(card.key)}
        >
          <X size={11} strokeWidth={2.3} />
        </button>
      )}
    </div>
  );
});

/**
 * Интерактивный конструктор порядка и карточек иконок правого блока панели управления.
 * В стиле «Капсула» позволяет группировать иконки в отдельные карточки-островки,
 * в стилях «Модерн» и «Классический» отображает единую ленту иконок, как в интерфейсе плеера.
 */
export const ControlButtonsPreviewCard: React.FC<ControlButtonsPreviewCardProps> = ({
  visibleButtons,
  skipOpeningSeconds,
}) => {
  const { dict } = useTranslation();
  const cbText = dict.settings.appearance.controlButtons;

  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() =>
    getSavedControlBarStyle(),
  );
  const isCapsule = controlBarStyle === "capsule";

  const [cards, setCards] = useState<KeyedUtilityCard[]>(() =>
    attachCardKeys(getSavedUtilityCards(true)),
  );
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const isSelfUpdateRef = useRef(false);
  const dragScaleRef = useRef(1);
  const [activeDragId, setActiveDragId] = useState<UtilityButtonId | null>(null);
  const [overCardKey, setOverCardKey] = useState<string | null>(null);

  const commitCards = useCallback((next: KeyedUtilityCard[]) => {
    cardsRef.current = next;
    setCards(next);
    isSelfUpdateRef.current = true;
    saveUtilityCards(
      next.map((c) => c.items),
      { allowEmptyCards: true },
    );
  }, []);

  useEffect(() => {
    const syncStyle = () => {
      setControlBarStyle(getSavedControlBarStyle());
    };
    const syncCards = () => {
      if (isSelfUpdateRef.current) {
        isSelfUpdateRef.current = false;
        return;
      }
      const saved = getSavedUtilityCards(true);
      const currentRaw = cardsRef.current.map((c) => c.items);
      if (JSON.stringify(saved) !== JSON.stringify(currentRaw)) {
        const next = attachCardKeys(saved);
        cardsRef.current = next;
        setCards(next);
      }
    };
    const syncAll = () => {
      syncStyle();
      syncCards();
    };
    window.addEventListener("l-mpv-control-bar-style-changed", syncStyle);
    window.addEventListener("ui-settings-changed", syncStyle);
    window.addEventListener(UTILITY_CARDS_CHANGED_EVENT, syncCards);
    window.addEventListener("l-mpv-settings-changed", syncAll);
    return () => {
      window.removeEventListener("l-mpv-control-bar-style-changed", syncStyle);
      window.removeEventListener("ui-settings-changed", syncStyle);
      window.removeEventListener(UTILITY_CARDS_CHANGED_EVENT, syncCards);
      window.removeEventListener("l-mpv-settings-changed", syncAll);
    };
  }, []);

  const isBtnVisible = useCallback(
    (id: UtilityButtonId): boolean => {
      return visibleButtons[id] !== undefined
        ? visibleButtons[id]
        : DEFAULT_VISIBILITY[id];
    },
    [visibleButtons],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const findCardIndexByItemOrKey = useCallback(
    (id: string, list: KeyedUtilityCard[]): number => {
      const byKey = list.findIndex((c) => c.key === id);
      if (byKey >= 0) return byKey;
      if (isUtilityButtonId(id)) {
        return list.findIndex((c) => c.items.includes(id));
      }
      return -1;
    },
    [],
  );

  const capsuleCollisionDetection: CollisionDetection = useCallback((args) => {
    const { droppableContainers, droppableRects, pointerCoordinates } = args;
    if (!pointerCoordinates) {
      return closestCenter(args);
    }

    const { x, y } = pointerCoordinates;
    const cardKeySet = new Set(cardsRef.current.map((c) => c.key));

    let hitCardKey: string | null = null;
    for (const container of droppableContainers) {
      if (container.disabled) continue;
      const cid = String(container.id);
      if (!cardKeySet.has(cid)) continue;
      const rect = droppableRects.get(container.id) ?? (container.node.current ? getClientRect(container.node.current) : null);
      if (!rect) continue;
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        hitCardKey = cid;
        break;
      }
    }

    if (hitCardKey) {
      const targetCard = cardsRef.current.find((c) => c.key === hitCardKey);
      if (targetCard) {
        let bestItem: { id: UtilityButtonId; distance: number } | null = null;
        for (const container of droppableContainers) {
          if (container.disabled) continue;
          const id = String(container.id);
          if (!isUtilityButtonId(id) || !targetCard.items.includes(id)) continue;
          const rect = droppableRects.get(container.id) ?? (container.node.current ? getClientRect(container.node.current) : null);
          if (!rect) continue;
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return [{ id }];
          }
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dist = Math.hypot(cx - x, cy - y);
          if (!bestItem || dist < bestItem.distance) {
            bestItem = { id, distance: dist };
          }
        }
        return [{ id: bestItem ? bestItem.id : hitCardKey }];
      }
    }

    // Вне границ карточек ищем ближайший слот среди иконок (не контейнеров)
    let closestItem: { id: string; distance: number } | null = null;
    for (const container of droppableContainers) {
      if (container.disabled) continue;
      const id = String(container.id);
      if (cardKeySet.has(id)) continue;
      const rect = droppableRects.get(container.id);
      if (!rect) continue;
      const dist = Math.hypot(rect.left + rect.width / 2 - x, rect.top + rect.height / 2 - y);
      if (!closestItem || dist < closestItem.distance) {
        closestItem = { id, distance: dist };
      }
    }
    if (closestItem) {
      return [{ id: closestItem.id }];
    }

    return closestCenter(args);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    dragScaleRef.current = getActiveUiScale();
    const id = String(event.active.id);
    if (isUtilityButtonId(id)) {
      setActiveDragId(id);
    }
    setOverCardKey(null);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!isCapsule) return;
      const { active, over } = event;
      if (!over) {
        setOverCardKey(null);
        return;
      }
      const activeId = String(active.id);
      const overId = String(over.id);
      const current = cardsRef.current;
      const sourceIdx = findCardIndexByItemOrKey(activeId, current);
      const targetIdx = findCardIndexByItemOrKey(overId, current);
      if (sourceIdx >= 0 && targetIdx >= 0 && sourceIdx !== targetIdx) {
        const nextKey = current[targetIdx].key;
        setOverCardKey((prev) => (prev === nextKey ? prev : nextKey));
      } else {
        setOverCardKey((prev) => (prev === null ? prev : null));
      }
    },
    [isCapsule, findCardIndexByItemOrKey],
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
    setOverCardKey(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      setOverCardKey(null);
      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);
      if (!isUtilityButtonId(activeId) || activeId === overId) return;

      const current = cardsRef.current;
      const sourceCardIndex = findCardIndexByItemOrKey(activeId, current);
      const targetCardIndex = findCardIndexByItemOrKey(overId, current);
      if (sourceCardIndex < 0 || targetCardIndex < 0) return;

      if (!isCapsule) {
        // В режимах Модерн / Классический перемещение по плоской ленте без отдельных карточек
        if (!isUtilityButtonId(overId)) return;
        const flatVisible = current.flatMap((c) => c.items).filter((id) => isBtnVisible(id));
        const oldFlatIndex = flatVisible.indexOf(activeId);
        const newFlatIndex = flatVisible.indexOf(overId);
        if (oldFlatIndex < 0 || newFlatIndex < 0 || oldFlatIndex === newFlatIndex) return;

        if (sourceCardIndex === targetCardIndex) {
          const items = current[sourceCardIndex].items;
          const oldIdx = items.indexOf(activeId);
          const newIdx = items.indexOf(overId);
          if (oldIdx < 0 || newIdx < 0) return;
          const next = current.map((c, idx) =>
            idx === sourceCardIndex ? { ...c, items: arrayMove(c.items, oldIdx, newIdx) } : c,
          );
          commitCards(next);
          return;
        }

        const movingRight = oldFlatIndex < newFlatIndex;
        const next = current.map((c) => ({
          ...c,
          items: c.items.filter((item) => item !== activeId),
        }));
        const targetItems = [...next[targetCardIndex].items];
        const anchorIdx = targetItems.indexOf(overId);
        const insertAt = anchorIdx >= 0 ? (movingRight ? anchorIdx + 1 : anchorIdx) : targetItems.length;
        targetItems.splice(insertAt, 0, activeId);
        next[targetCardIndex] = { ...next[targetCardIndex], items: targetItems };
        commitCards(next);
        return;
      }

      // В режиме «Капсула»: внутри одной карточки или перенос в другую карточку
      if (sourceCardIndex === targetCardIndex) {
        if (!isUtilityButtonId(overId)) return;
        const card = current[sourceCardIndex];
        const oldIndex = card.items.indexOf(activeId);
        const newIndex = card.items.indexOf(overId);
        if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
          const reordered = current.map((c, idx) =>
            idx === sourceCardIndex
              ? { ...c, items: arrayMove(c.items, oldIndex, newIndex) }
              : c,
          );
          commitCards(reordered);
        }
        return;
      }

      const nextSourceItems = current[sourceCardIndex].items.filter((item) => item !== activeId);
      const nextTargetItems = [...current[targetCardIndex].items.filter((item) => item !== activeId)];
      if (isUtilityButtonId(overId)) {
        const overIndex = nextTargetItems.indexOf(overId);
        if (overIndex >= 0) {
          nextTargetItems.splice(overIndex, 0, activeId);
        } else {
          nextTargetItems.push(activeId);
        }
      } else {
        nextTargetItems.push(activeId);
      }

      const moved = current.map((card, idx) => {
        if (idx === sourceCardIndex) return { ...card, items: nextSourceItems };
        if (idx === targetCardIndex) return { ...card, items: nextTargetItems };
        return card;
      });
      commitCards(moved);
    },
    [isCapsule, isBtnVisible, commitCards, findCardIndexByItemOrKey],
  );

  const handleAddCard = useCallback(() => {
    const current = cardsRef.current;
    if (current.length >= ALL_UTILITY_BUTTON_IDS.length) return;
    commitCards([...current, { key: nextCardKey(), items: [] }]);
  }, [commitCards]);

  const handleRemoveCard = useCallback(
    (cardKey: string) => {
      const current = cardsRef.current;
      if (current.length <= 1) return;
      const removeIdx = current.findIndex((c) => c.key === cardKey);
      if (removeIdx < 0) return;

      const orphanItems = current[removeIdx].items;
      const remaining = current.filter((_, idx) => idx !== removeIdx);

      if (orphanItems.length > 0 && remaining.length > 0) {
        const fallbackIdx = Math.max(0, removeIdx - 1);
        remaining[fallbackIdx] = {
          ...remaining[fallbackIdx],
          items: [...remaining[fallbackIdx].items, ...orphanItems],
        };
      }
      commitCards(remaining);
    },
    [commitCards],
  );

  const handleReset = useCallback(() => {
    const defaults = resetUtilityCards();
    const next = attachCardKeys(defaults);
    cardsRef.current = next;
    setCards(next);
  }, []);

  const isDefault = useMemo(
    () => isDefaultUtilityCards(cards.map((c) => c.items)),
    [cards],
  );

  const visualsMap = useMemo<Record<UtilityButtonId, ButtonVisual>>(
    () => ({
      speed: {
        title: dict.settings.appearance.visSpeed,
        isBadge: true,
        content: (
          <>
            <SpeedIcon size={13} />
            <span>1.0x</span>
          </>
        ),
      },
      skipOpening: {
        title: cbText.openingSkip(skipOpeningSeconds),
        isBadge: true,
        content: (
          <>
            <FastForward size={12} />
            <span>+{skipOpeningSeconds}s</span>
          </>
        ),
      },
      alwaysOnTop: { title: cbText.alwaysOnTop, isBadge: false, content: <Pin size={15} /> },
      info: { title: cbText.fileInfo, isBadge: false, content: <Info size={15} /> },
      mediaInfo: { title: cbText.mediaInfo, isBadge: false, content: <FileText size={15} /> },
      visualizer: { title: cbText.visualizer, isBadge: false, content: <AudioWaveform size={15} /> },
      playlist: { title: cbText.playlist, isBadge: false, content: <ListVideo size={15} /> },
      screenshot: { title: cbText.screenshot, isBadge: false, content: <Camera size={15} /> },
      fullscreen: { title: cbText.fullscreen, isBadge: false, content: <Maximize size={15} /> },
    }),
    [cbText, dict.settings.appearance.visSpeed, skipOpeningSeconds],
  );

  const getVisual = useCallback((id: UtilityButtonId) => visualsMap[id], [visualsMap]);

  const flatVisibleIds = useMemo(
    () => cards.flatMap((card) => card.items).filter((id) => isBtnVisible(id)),
    [cards, isBtnVisible],
  );

  const headerTitle = isCapsule ? cbText.builderTitle : cbText.builderOrderTitle;
  const headerHint = isCapsule ? cbText.builderHint : cbText.builderOrderHint;

  const canvasStyleClass = isCapsule
    ? "control-buttons-builder__canvas--capsule"
    : controlBarStyle === "docked"
      ? "control-buttons-builder__canvas--docked"
      : "control-buttons-builder__canvas--modern";

  return (
    <div className="control-buttons-preview">
      <div className="control-buttons-builder__header">
        <div className="control-buttons-builder__title-col">
          <span className="control-buttons-builder__title">{headerTitle}</span>
          <span className="t-hint">{headerHint}</span>
        </div>

        <div className="control-buttons-builder__actions">
          {isCapsule && (
            <button
              type="button"
              className="btn btn--secondary btn--sm control-buttons-builder__action-btn"
              onClick={handleAddCard}
              disabled={cards.length >= ALL_UTILITY_BUTTON_IDS.length}
              title={cbText.addCard}
            >
              <Plus size={13} />
              <span>{cbText.addCard}</span>
            </button>
          )}

          {!isDefault && (
            <button
              type="button"
              className="btn btn--secondary btn--sm control-buttons-builder__action-btn"
              onClick={handleReset}
              title={cbText.resetOrder}
              aria-label={cbText.resetOrder}
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={isCapsule ? capsuleCollisionDetection : closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
        autoScroll={false}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={`control-buttons-builder__canvas ${canvasStyleClass}`}>
          {isCapsule ? (
            flatVisibleIds.length === 0 && cards.length === 1 ? (
              <div className="control-buttons-builder__all-hidden">
                {cbText.allHiddenHint}
              </div>
            ) : (
              cards.map((card) => {
                const visibleIds = card.items.filter((id) => isBtnVisible(id));
                return (
                  <DroppableUtilityCard
                    key={card.key}
                    card={card}
                    visibleIds={visibleIds}
                    canRemove={cards.length > 1}
                    isDropTarget={overCardKey === card.key}
                    emptyHint={cbText.emptyCardHint}
                    removeTitle={cbText.removeCard}
                    onRemove={handleRemoveCard}
                    getVisual={getVisual}
                  />
                );
              })
            )
          ) : flatVisibleIds.length === 0 ? (
            <div className="control-buttons-builder__all-hidden">
              {cbText.allHiddenHint}
            </div>
          ) : (
            <SortableContext items={flatVisibleIds} strategy={horizontalListSortingStrategy}>
              <div className="control-buttons-builder__flat-row">
                {flatVisibleIds.map((id) => (
                  <SortableUtilityChip key={id} id={id} visual={getVisual(id)} />
                ))}
              </div>
            </SortableContext>
          )}
        </div>

        {createPortal(
          <DragOverlay dropAnimation={null} zIndex={10001}>
            {activeDragId ? (
              <UtilityDragOverlayPreview
                visual={getVisual(activeDragId)}
                scale={dragScaleRef.current}
              />
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </div>
  );
};
