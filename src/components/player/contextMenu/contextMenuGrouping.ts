import type { MenuItem } from "./contextMenuBuilder";

/**
 * Описание логической островной карточки-группы внутри контекстного меню или подменю.
 */
export interface MenuGroup {
  /** Компактный заголовок карточки-группы (если задан). */
  header?: string;
  /** Дочерние интерактивные элементы внутри карточки. */
  items: MenuItem[];
}

/** Алиас для обратной совместимости со старыми модулями подменю. */
export type SubmenuGroup = MenuGroup;

/**
 * Чистая функция группировки плоского списка элементов меню
 * в массив изолированных островных карточек (Island Grouping).
 *
 * Правила разбиения:
 * 1. Элемент `{ type: "divider" }` завершает текущую карточку и открывает новую.
 * 2. Элемент `{ type: "header", label }` назначает заголовок для текущей пустой
 *    карточки, либо открывает новую карточку с этим заголовком, если в текущей
 *    уже накоплены элементы.
 * 3. Пустые группы автоматически отфильтровываются.
 */
export function groupMenuItems(items: MenuItem[]): MenuGroup[] {
  const groups: MenuGroup[] = [];
  let currentGroup: MenuGroup = { items: [] };

  const flushCurrentGroup = (): void => {
    if (currentGroup.items.length > 0) {
      groups.push(currentGroup);
      currentGroup = { items: [] };
    } else if (currentGroup.header) {
      currentGroup = { items: [] };
    }
  };

  for (const item of items) {
    if (item.type === "divider") {
      flushCurrentGroup();
      continue;
    }

    if (item.type === "header") {
      if (currentGroup.items.length > 0) {
        flushCurrentGroup();
      }
      currentGroup.header = item.label;
      continue;
    }

    currentGroup.items.push(item);
  }

  flushCurrentGroup();
  return groups;
}

/** Алиас для группировки дочерних элементов подменю. */
export const groupSubmenuChildren = groupMenuItems;
