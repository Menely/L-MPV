import { useTranslation } from "../../i18n/LanguageContext";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  DndContext,
  closestCenter,
  MeasuringStrategy,
  type CollisionDetection,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  UniqueIdentifier,
  getClientRect,
  useDndContext,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Plus,
  RotateCcw,
  MousePointerClick,
  ChevronRight,
  Check,
  SlidersHorizontal,
  FolderOpen,
} from "lucide-react";
import {
  type LayoutEntry,
  getSavedLayout,
  saveLayout,
  resetLayout,
  LAYOUT_CHANGED_EVENT,
} from "../../utils/contextMenuLayout";
import {
  MENU_ITEM_REGISTRY,
  MENU_ITEM_MAP,
  type MenuItemDescriptor,
  getLocalizedMenuItem,
} from "../../utils/contextMenuRegistry";
import {
  SortableCard,
  OverlayCard,
  MENU_ICON_MAP,
} from "./ContextMenuEntryCard";

let uniqueKeyCounter = 0;

/** Генерирует стабильный уникальный ключ для записи раскладки. */
function generateStableKey(entry: LayoutEntry): string {
  if (entry.type === "item") {
    return `item-${entry.id}`;
  }
  uniqueKeyCounter += 1;
  return `divider-${Date.now()}-${uniqueKeyCounter}`;
}

interface KeyedEntry {
  key: string;
  entry: LayoutEntry;
}

function attachKeys(layout: LayoutEntry[]): KeyedEntry[] {
  return layout.map((entry) => ({
    key: generateStableKey(entry),
    entry,
  }));
}

/**
 * Вспомогательный компонент синхронизации скролла с @dnd-kit.
 * Подключает слушатель scroll ТОЛЬКО во время активного перетаскивания (isDragging).
 * Вызывает measureDroppableContainers([]) на каждом кадре скролла (через requestAnimationFrame),
 * благодаря чему внутренние кэши dnd-kit мгновенно обновляются во время авто-скролла.
 */
function ScrollSync({
  containerRef,
  isDragging,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
}) {
  const { measureDroppableContainers } = useDndContext();

  useEffect(() => {
    if (!isDragging) return;
    const el = containerRef.current;
    if (!el) return;
    const outer = el.closest(".settings-side-panel__scroll, .modal__body");
    const scrollContainers = outer && outer !== el ? [el, outer] : [el];

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        measureDroppableContainers([]);
      });
    };

    scrollContainers.forEach((container) => {
      container.addEventListener("scroll", handleScroll, { passive: true });
    });
    return () => {
      scrollContainers.forEach((container) => {
        container.removeEventListener("scroll", handleScroll);
      });
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [containerRef, isDragging, measureDroppableContainers]);

  return null;
}

// ─── Основной компонент конфигуратора ───────────────────────────────────────

export function ContextMenuSettingsTab() {
  const { dict } = useTranslation();
  const [entries, setEntries] = useState<KeyedEntry[]>(() =>
    attachKeys(getSavedLayout()),
  );
  const [saved, setSaved] = useState(true);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [activeOverlaySize, setActiveOverlaySize] = useState<{ width: number; height: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isSelfUpdateRef = useRef(false);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const commitEntries = useCallback((next: KeyedEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
    isSelfUpdateRef.current = true;
    saveLayout(next.map((entry) => entry.entry));
    setSaved(true);
  }, []);

  // Синхронизация раскладки при фоновой загрузке из файла config/context_menu.json
  useEffect(() => {
    const handleLayoutChanged = () => {
      // Игнорируем события, инициированные действиями самой этой вкладки
      if (isSelfUpdateRef.current) {
        isSelfUpdateRef.current = false;
        return;
      }
      const currentEntriesJson = JSON.stringify(entries.map((e) => e.entry));
      const saved = getSavedLayout();
      if (JSON.stringify(saved) !== currentEntriesJson) {
        setEntries(attachKeys(saved));
      }
    };
    window.addEventListener(LAYOUT_CHANGED_EVENT, handleLayoutChanged);
    return () => {
      window.removeEventListener(LAYOUT_CHANGED_EVENT, handleLayoutChanged);
    };
  }, [entries]);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  /**
   * Прецизионный 1D-алгоритм определения коллизий для вертикального списка меню.
   * Читает реальные физические границы DOM-узлов (с учетом текущего скролла контейнера
   * и без артефактов временных CSS transform анимаций).
   * Исключает рассинхронизацию между курсором мыши и местом раздвигания пунктов (gap)
   * даже при непрерывном авто-скроллинге контейнера вверх или вниз.
   */
  const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
    const { droppableContainers, droppableRects, pointerCoordinates } = args;

    // При перетаскивании с клавиатуры координат курсора нет — используем closestCenter
    if (!pointerCoordinates) {
      return closestCenter(args);
    }

    const { y: pointerY } = pointerCoordinates;
    let exactMatchId: UniqueIdentifier | null = null;
    let closestContainer: { id: UniqueIdentifier; distance: number } | null = null;

    interface ItemBound {
      id: UniqueIdentifier;
      top: number;
      bottom: number;
      centerY: number;
    }

    const bounds: ItemBound[] = [];

    for (const container of droppableContainers) {
      if (container.disabled) continue;
      const node = container.node.current;
      let top: number;
      let bottom: number;
      let centerY: number;

      if (node) {
        // Получаем реальные экранные координаты DOM-узла карточки,
        // игнорируя временный смещающий transform анимации раздвигания
        const rect = getClientRect(node, { ignoreTransform: true });
        top = rect.top;
        bottom = rect.bottom;
        centerY = rect.top + rect.height / 2;
      } else {
        const cached = droppableRects.get(container.id);
        if (!cached) continue;
        top = cached.top;
        bottom = cached.bottom;
        centerY = cached.top + cached.height / 2;
      }

      bounds.push({ id: container.id, top, bottom, centerY });

      // Прямое попадание по вертикали курсора внутрь карточки
      if (pointerY >= top && pointerY <= bottom) {
        exactMatchId = container.id;
      }

      // Если курсор окажется в межэлементном зазоре — расстояние до центра карточки
      const distance = Math.abs(centerY - pointerY);
      if (!closestContainer || distance < closestContainer.distance) {
        closestContainer = { id: container.id, distance };
      }
    }

    // 1. Если курсор строго внутри карточки — мгновенное точное попадание
    if (exactMatchId) {
      return [{ id: exactMatchId }];
    }

    if (bounds.length > 0) {
      // Сортируем по реальной вертикальной координате на экране
      bounds.sort((a, b) => a.top - b.top);

      // 2. Если курсор выше верхней границы самого верхнего элемента списка
      // (например, пользователь поднял курсор к заголовку или краю для автоскролла)
      if (pointerY < bounds[0].top) {
        return [{ id: bounds[0].id }];
      }

      // 3. Если курсор ниже нижней границы самого последнего элемента списка
      if (pointerY > bounds[bounds.length - 1].bottom) {
        return [{ id: bounds[bounds.length - 1].id }];
      }
    }

    // 4. Если курсор между элементами — выбираем ближайший по вертикали
    if (closestContainer) {
      return [{ id: closestContainer.id }];
    }

    return closestCenter(args);
  }, []);

  /** Набор уже добавленных идентификаторов (вычисление за O(N)). */
  const addedIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of entries) {
      if (item.entry.type === "item") {
        set.add(item.entry.id);
      }
    }
    return set;
  }, [entries]);

  /** Список пунктов, доступных для добавления (правая колонка). */
  const availableItems = useMemo(
    () => MENU_ITEM_REGISTRY.filter((d) => !addedIds.has(d.id)),
    [addedIds],
  );

  // ── Обработчики перетаскивания ──────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const initialRect = event.active.rect.current.initial;
    const width = initialRect?.width || 0;
    const height = initialRect?.height || 0;
    setActiveOverlaySize(width > 0 && height > 0 ? { width, height } : null);
    setActiveId(event.active.id);
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveOverlaySize(null);
    setActiveId(null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveOverlaySize(null);
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const current = entriesRef.current;
    const oldIndex = current.findIndex((entry) => String(entry.key) === String(active.id));
    const newIndex = current.findIndex((entry) => String(entry.key) === String(over.id));
    if (oldIndex >= 0 && newIndex >= 0) {
      commitEntries(arrayMove(current, oldIndex, newIndex));
    }
  }, [commitEntries]);

  // ── Мутации ─────────────────────────────────────────────────────────────

  const removeEntry = useCallback((key: string) => {
    commitEntries(entriesRef.current.filter((entry) => entry.key !== key));
  }, [commitEntries]);

  const addDividerBefore = useCallback((key: string) => {
    const current = entriesRef.current;
    const index = current.findIndex((entry) => entry.key === key);
    if (index < 0) return;
    const newEntry: KeyedEntry = {
      key: generateStableKey({ type: "divider" }),
      entry: { type: "divider" },
    };
    const next = [...current];
    next.splice(index, 0, newEntry);
    commitEntries(next);
  }, [commitEntries]);

  const addItem = useCallback((descriptor: MenuItemDescriptor) => {
    const entry: LayoutEntry = { type: "item", id: descriptor.id };
    const newEntry: KeyedEntry = {
      key: generateStableKey(entry),
      entry,
    };
    commitEntries([...entriesRef.current, newEntry]);
  }, [commitEntries]);

  const addDividerAtEnd = useCallback(() => {
    const newEntry: KeyedEntry = {
      key: generateStableKey({ type: "divider" }),
      entry: { type: "divider" },
    };
    commitEntries([...entriesRef.current, newEntry]);
  }, [commitEntries]);

  // ── Сохранение / сброс ──────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    isSelfUpdateRef.current = true;
    saveLayout(entries.map((e) => e.entry));
    setSaved(true);
  }, [entries]);

  const handleReset = useCallback(() => {
    isSelfUpdateRef.current = true;
    const layout = resetLayout();
    setEntries(attachKeys(layout));
    setSaved(true);
  }, []);

  // ── Данные для DragOverlay ───────────────────────────────────────────────

  const activeEntry = activeId
    ? entries.find((e) => String(e.key) === String(activeId))
    : null;

  const activeDescriptor =
    activeEntry?.entry.type === "item"
      ? MENU_ITEM_MAP.get(activeEntry.entry.id)
      : undefined;

  const itemKeys = useMemo(() => entries.map((e) => e.key), [entries]);

  return (
    <div className="cmenu-editor">
      {/* ── Шапка с кнопками управления ── */}
      <div className="cmenu-editor__header">
        <span className="cmenu-editor__title">
          <MousePointerClick size={14} style={{ color: "var(--accent)" }} />
          {dict.settings.contextMenuConfig.cmenuConfigTitle}
        </span>
        <div className="cmenu-editor__actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleReset}
            title={dict.settings.contextMenuConfig.btnResetTitle}
          >
            <RotateCcw size={13} /> {dict.settings.contextMenuConfig.btnReset}
          </button>
          <button
            type="button"
            className={`btn btn--sm ${saved ? "btn--secondary" : "btn--accent"}`}
            onClick={handleSave}
            title={dict.settings.contextMenuConfig.btnSaveTitle}
          >
            <Check size={13} /> {dict.settings.contextMenuConfig.btnSaved}
          </button>
        </div>
      </div>

      {/* ── Двухколоночная область ── */}
      <div className="cmenu-editor__body">
        {/* Левая колонка — текущее меню */}
        <div className="cmenu-editor__current">
          <div className="cmenu-editor__col-header">
            <SlidersHorizontal size={14} style={{ color: "var(--accent)" }} />
            <span>{dict.settings.contextMenuConfig.colCurrent}</span>
            <span className="cmenu-editor__count">{entries.length}</span>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            measuring={{
              droppable: {
                strategy: MeasuringStrategy.WhileDragging,
                frequency: 32,
              },
            }}
            autoScroll={{
              threshold: {
                x: 0.15,
                y: 0.15,
              },
              acceleration: 10,
              layoutShiftCompensation: false,
            }}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <ScrollSync
              containerRef={scrollContainerRef}
              isDragging={activeId !== null}
            />
            <SortableContext
              items={itemKeys}
              strategy={verticalListSortingStrategy}
            >
              <div className="cmenu-editor__list" ref={scrollContainerRef}>
                {entries.length === 0 ? (
                  <div className="cmenu-editor__empty">
                    <span>{dict.settings.contextMenuConfig.emptyCurrent}</span>
                  </div>
                ) : (
                  entries.map((ke) => {
                    const descriptor =
                      ke.entry.type === "item"
                        ? MENU_ITEM_MAP.get(ke.entry.id)
                        : undefined;
                    return (
                      <SortableCard
                        key={ke.key}
                        id={ke.key}
                        entry={ke.entry}
                        descriptor={descriptor}
                        onRemove={removeEntry}
                        onAddDividerBefore={addDividerBefore}
                      />
                    );
                  })
                )}
              </div>
            </SortableContext>

            <DragOverlay dropAnimation={null}>
              {activeEntry && activeOverlaySize ? (
                <div
                  className="cmenu-editor__drag-overlay"
                  style={{
                    pointerEvents: "none",
                    cursor: "grabbing",
                    width: activeOverlaySize.width,
                    minHeight: activeOverlaySize.height,
                    maxWidth: activeOverlaySize.width,
                    boxSizing: "border-box",
                  }}
                >
                  <OverlayCard entry={activeEntry.entry} descriptor={activeDescriptor} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Кнопка добавления разделителя в конец */}
          <button
            type="button"
            className="cmenu-editor__add-divider-btn"
            onClick={addDividerAtEnd}
          >
            <Plus size={12} /> {dict.settings.contextMenuConfig.btnAddDivider}
          </button>
        </div>

        {/* Правая колонка — доступные пункты */}
        <div className="cmenu-editor__available">
          <div className="cmenu-editor__col-header">
            <FolderOpen size={14} style={{ color: "var(--accent)" }} />
            <span>{dict.settings.contextMenuConfig.colAvailable}</span>
            <span className="cmenu-editor__count">{availableItems.length}</span>
          </div>
          <div className="cmenu-editor__available-list">
            {availableItems.length === 0 ? (
              <div className="cmenu-editor__empty">
                <Check size={16} style={{ color: "var(--accent)" }} />
                <span>{dict.settings.contextMenuConfig.emptyAvailable}</span>
              </div>
            ) : (
              availableItems.map((descriptor) => {
                const itemInfo = getLocalizedMenuItem(dict, descriptor);
                return (
                  <div key={descriptor.id} className="cmenu-available-item">
                    <span className="cmenu-available-item__icon">
                      {MENU_ICON_MAP[descriptor.iconName]}
                    </span>
                    <div className="cmenu-available-item__info">
                      <span className="cmenu-available-item__label">{itemInfo.label}</span>
                      {descriptor.hasSubmenu && (
                        <ChevronRight size={11} style={{ opacity: 0.5 }} />
                      )}
                    </div>
                    <button
                      type="button"
                      className="cmenu-available-item__add"
                      onClick={() => addItem(descriptor)}
                      title={dict.settings.contextMenuConfig.btnAddItem(itemInfo.label)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
