import type { MenuItem } from "./contextMenuBuilder";

/**
 * Описание логической островной карточки-группы внутри всплывающего подменю.
 */
export interface SubmenuGroup {
  /** Компактный заголовок карточки-группы (если задан). */
  header?: string;
  /** Дочерние интерактивные элементы внутри карточки. */
  items: MenuItem[];
}

/**
 * Чистая функция группировки плоского списка элементов подменю
 * в массив изолированных островных карточек (Island Grouping).
 *
 * Правила разбиения:
 * 1. Элемент `{ type: "divider" }` завершает текущую карточку и открывает новую.
 * 2. Элемент `{ type: "header", label }` назначает заголовок для текущей пустой
 *    карточки, либо открывает новую карточку с этим заголовком, если в текущей
 *    уже накоплены элементы.
 * 3. Пустые группы автоматически отфильтровываются.
 */
export function groupSubmenuChildren(children: MenuItem[]): SubmenuGroup[] {
  const groups: SubmenuGroup[] = [];
  let currentGroup: SubmenuGroup = { items: [] };

  const flushCurrentGroup = (): void => {
    if (currentGroup.items.length > 0) {
      groups.push(currentGroup);
      currentGroup = { items: [] };
    } else if (currentGroup.header) {
      currentGroup = { items: [] };
    }
  };

  for (const child of children) {
    if (child.type === "divider") {
      flushCurrentGroup();
      continue;
    }

    if (child.type === "header") {
      if (currentGroup.items.length > 0) {
        flushCurrentGroup();
      }
      currentGroup.header = child.label;
      continue;
    }

    currentGroup.items.push(child);
  }

  flushCurrentGroup();
  return groups;
}

