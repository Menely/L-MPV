import { ChevronDown } from "lucide-react";

export interface AccordionSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

export function AccordionSection({
  isOpen,
  onToggle,
  icon,
  title,
  badge,
  children,
}: AccordionSectionProps) {
  // Анимация включена всегда (класс --animated статичен): раньше первое
  // раскрытие было мгновенным, т.к. --animated и --open попадали в один
  // коммит и transition не срабатывал. На маунте анимации нет — значение
  // grid-template-rows не меняется без тоггла.
  const handleToggle = () => {
    onToggle();
  };

  return (
    <div
      className={`settings-accordion ${isOpen ? "settings-accordion--open" : ""} settings-accordion--animated`}
    >
      <button
        type="button"
        className="settings-accordion__header"
        onClick={handleToggle}
      >
        <div className="settings-accordion__title">
          <span className="settings-accordion__icon">{icon}</span>
          <span>{title}</span>
          {badge}
        </div>
        <ChevronDown size={18} className="settings-accordion__chevron" />
      </button>
      <div className="settings-accordion__collapse">
        <div className="settings-accordion__inner">
          <div className="settings-accordion__body">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
