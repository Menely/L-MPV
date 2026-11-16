import React from "react";
import type { ControlsLayoutProps } from "./types";
import { ModernControlsLayout } from "./ModernControlsLayout";

/**
 * Модульное представление панели управления для стиля «Классический» (Docked):
 * - Пристыкованная монолитная панель к нижнему краю окна
 * - Полноразмерный интерфейс без внешних парящих отступов
 */
export const DockedControlsLayout: React.FC<ControlsLayoutProps> = (props) => {
  return <ModernControlsLayout {...props} />;
};

