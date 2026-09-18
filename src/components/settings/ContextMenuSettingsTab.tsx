import React, { useState, useCallback, useMemo, memo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  X,
  Plus,
  Minus,
  RotateCcw,
  MousePointerClick,
  ChevronRight,
  Check,
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
} from "lucide-react";
import {
  type LayoutEntry,
  getSavedLayout,
  saveLayout,
  resetLayout,
} from "../../utils/contextMenuLayout";
import {
  MENU_ITEM_REGISTRY,
  MENU_ITEM_MAP,
  type MenuItemDescriptor,
} from "../../utils/contextMenuRegistry";

/** Маппинг имени иконки в статичный React-элемент превью. */
const ICON_MAP: Record<string, React.ReactNode> = {
  FolderOpen: <FolderOpen size={14} />,
  AudioLines: <AudioLines size={14} />,
  Subtitles: <Subtitles size={14} />,
  BookOpen: <BookOpen size={14} />,
  Monitor: <Monitor size={14} />,
  RotateCw: <RotateCw size={14} />,
  Sparkles: <Sparkles size={14} />,
  Zap: <Zap size={14} />,
  Repeat: <Repeat size={14} />,
  Shuffle: <Shuffle size={14} />,
  Pin: <Pin size={14} />,
  Camera: <Camera size={14} />,
  Info: <Info size={14} />,
  FileText: <FileText size={14} />,
  Clock: <Clock size={14} />,
  Timer: <Timer size={14} />,
  LayoutTemplate: <LayoutTemplate size={14} />,
  Settings: <Settings size={14} />,
};

let uniqueKeyCounter = 0;

/** Генерирует гарантированно уникальный ключ для записи раскладки. */
function generateKey(prefix: string): string {
  uniqueKeyCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueKeyCounter}`;
}

interface KeyedEntry {
  key: string;
  entry: LayoutEntry;
}

function attachKeys(layout: LayoutEntry[]): KeyedEntry[] {
  return layout.map((entry, index) => ({
    key: entry.type === "divider" ? `divider-${index}` : `item-${entry.id}-${index}`,
    entry,
  }));
}

// ─── Мемоизированная карточка элемента меню ─────────────────────────────────

interface SortableCardProps {
  id: string;
  entry: LayoutEntry;
  descriptor?: MenuItemDescriptor;
  onRemove: (key: string) => void;
  onAddDividerBefore: (key: string) => void;
}

const SortableCard = memo(function SortableCard({
  id,
  entry,
  descriptor,
  onRemove,
  onAddDividerBefore,
}: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const handleRemove = useCallback(() => {
    onRemove(id);
  }, [onRemove, id]);

  const handleAddDivider = useCallback(() => {
    onAddDividerBefore(id);
  }, [onAddDividerBefore, id]);

  if (entry.type === "divider") {
    return (
      <div ref={setNodeRef} style={style} className="cmenu-entry cmenu-entry--divider">
        <span {...attributes} {...listeners} className="cmenu-entry__grip" title="Перетащить">
          <GripVertical size={14} />
        </span>
        <div className="cmenu-entry__divider-line">
          <span className="cmenu-entry__divider-label">── Разделитель ──</span>
        </div>
        <button
          type="button"
          className="cmenu-entry__remove"
          onClick={handleRemove}
          title="Удалить разделитель"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="cmenu-entry">
      <button
        type="button"
        className="cmenu-entry__add-divider"
        onClick={handleAddDivider}
        title="Добавить разделитель перед этим пунктом"
      >
        <Minus size={11} />
      </button>
      <span
        {...attributes}
        {...listeners}
        className="cmenu-entry__grip"
        title="Перетащить для изменения порядка"
      >
        <GripVertical size={14} />
      </span>
      <span className="cmenu-entry__icon">
        {descriptor ? ICON_MAP[descriptor.iconName] : null}
      </span>
      <div className="cmenu-entry__info">
        <span className="cmenu-entry__label">{descriptor?.label ?? entry.id}</span>
        {descriptor?.hasSubmenu && (
          <ChevronRight size={11} className="cmenu-entry__submenu-hint" />
        )}
      </div>
      <button
        type="button"
        className="cmenu-entry__remove"
        onClick={handleRemove}
        title="Убрать из меню"
      >
        <X size={12} />
      </button>
    </div>
  );
});

/** Статичная карточка для DragOverlay при перетаскивании. */
function OverlayCard({
  entry,
  descriptor,
}: {
  entry: LayoutEntry;
  descriptor?: MenuItemDescriptor;
}) {
  if (entry.type === "divider") {
    return (
      <div className="cmenu-entry cmenu-entry--divider cmenu-entry--overlay">
        <span className="cmenu-entry__grip"><GripVertical size={14} /></span>
        <div className="cmenu-entry__divider-line">
          <span className="cmenu-entry__divider-label">── Разделитель ──</span>
        </div>
      </div>
    );
  }
  return (
    <div className="cmenu-entry cmenu-entry--overlay">
      <span className="cmenu-entry__grip"><GripVertical size={14} /></span>
      <span className="cmenu-entry__icon">
        {descriptor ? ICON_MAP[descriptor.iconName] : null}
      </span>
      <div className="cmenu-entry__info">
        <span className="cmenu-entry__label">{descriptor?.label ?? entry.id}</span>
        {descriptor?.hasSubmenu && (
          <ChevronRight size={11} className="cmenu-entry__submenu-hint" />
        )}
      </div>
    </div>
  );
}

// ─── Основной компонент конфигуратора ───────────────────────────────────────

export function ContextMenuSettingsTab() {
  const [entries, setEntries] = useState<KeyedEntry[]>(() =>
    attachKeys(getSavedLayout()),
  );
  const [saved, setSaved] = useState(true);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setEntries((prev) => {
      const oldIndex = prev.findIndex((e) => e.key === active.id);
      const newIndex = prev.findIndex((e) => e.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    setSaved(false);
  }, []);

  // ── Мутации ─────────────────────────────────────────────────────────────

  const removeEntry = useCallback((key: string) => {
    setEntries((prev) => prev.filter((e) => e.key !== key));
    setSaved(false);
  }, []);

  const addDividerBefore = useCallback((key: string) => {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.key === key);
      if (idx < 0) return prev;
      const newEntry: KeyedEntry = {
        key: generateKey("divider"),
        entry: { type: "divider" },
      };
      const copy = [...prev];
      copy.splice(idx, 0, newEntry);
      return copy;
    });
    setSaved(false);
  }, []);

  const addItem = useCallback((descriptor: MenuItemDescriptor) => {
    const newEntry: KeyedEntry = {
      key: generateKey(`item-${descriptor.id}`),
      entry: { type: "item", id: descriptor.id },
    };
    setEntries((prev) => [...prev, newEntry]);
    setSaved(false);
  }, []);

  const addDividerAtEnd = useCallback(() => {
    const newEntry: KeyedEntry = {
      key: generateKey("divider"),
      entry: { type: "divider" },
    };
    setEntries((prev) => [...prev, newEntry]);
    setSaved(false);
  }, []);

  // ── Сохранение / сброс ──────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    saveLayout(entries.map((e) => e.entry));
    setSaved(true);
  }, [entries]);

  const handleReset = useCallback(() => {
    const layout = resetLayout();
    setEntries(attachKeys(layout));
    setSaved(true);
  }, []);

  // ── Данные для DragOverlay ───────────────────────────────────────────────

  const activeEntry = activeId
    ? entries.find((e) => e.key === activeId)
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
          Настройка меню правой кнопки мыши
        </span>
        <div className="cmenu-editor__actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleReset}
            title="Сбросить к стандартному набору пунктов"
          >
            <RotateCcw size={13} /> Сброс
          </button>
          <button
            type="button"
            className={`btn btn--sm ${saved ? "btn--secondary" : "btn--accent"}`}
            onClick={handleSave}
            disabled={saved}
            title="Сохранить текущую раскладку меню"
          >
            {saved ? <><Check size={13} /> Сохранено</> : "Сохранить"}
          </button>
        </div>
      </div>

      {/* ── Двухколоночная область ── */}
      <div className="cmenu-editor__body">
        {/* Левая колонка — текущее меню */}
        <div className="cmenu-editor__current">
          <div className="cmenu-editor__col-header">
            Текущее меню
            <span className="cmenu-editor__count">{entries.length}</span>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={itemKeys}
              strategy={verticalListSortingStrategy}
            >
              <div className="cmenu-editor__list">
                {entries.length === 0 ? (
                  <div className="cmenu-editor__empty">
                    <span>Меню пусто. Добавьте пункты из правой колонки.</span>
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

            <DragOverlay>
              {activeEntry ? (
                <OverlayCard entry={activeEntry.entry} descriptor={activeDescriptor} />
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Кнопка добавления разделителя в конец */}
          <button
            type="button"
            className="cmenu-editor__add-divider-btn"
            onClick={addDividerAtEnd}
          >
            <Plus size={12} /> Добавить разделитель
          </button>
        </div>

        {/* Правая колонка — доступные пункты */}
        <div className="cmenu-editor__available">
          <div className="cmenu-editor__col-header">
            Доступные пункты
            <span className="cmenu-editor__count">{availableItems.length}</span>
          </div>
          <div className="cmenu-editor__available-list">
            {availableItems.length === 0 ? (
              <div className="cmenu-editor__empty">
                <Check size={16} style={{ color: "var(--accent)" }} />
                <span>Все пункты уже добавлены</span>
              </div>
            ) : (
              availableItems.map((descriptor) => (
                <div key={descriptor.id} className="cmenu-available-item">
                  <span className="cmenu-available-item__icon">
                    {ICON_MAP[descriptor.iconName]}
                  </span>
                  <div className="cmenu-available-item__info">
                    <span className="cmenu-available-item__label">{descriptor.label}</span>
                    {descriptor.hasSubmenu && (
                      <ChevronRight size={11} style={{ opacity: 0.5 }} />
                    )}
                  </div>
                  <button
                    type="button"
                    className="cmenu-available-item__add"
                    onClick={() => addItem(descriptor)}
                    title={`Добавить «${descriptor.label}» в меню`}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
