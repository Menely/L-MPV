import { useId } from "react";
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
  const contentId = useId();

  return (
    <div className={`settings-accordion ${isOpen ? "settings-accordion--open" : ""}`}>
      <button
        type="button"
        className="settings-accordion__header"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <div className="settings-accordion__title">
          <span className="settings-accordion__icon">{icon}</span>
          <span>{title}</span>
          {badge}
        </div>
        <ChevronDown size={18} className="settings-accordion__chevron" aria-hidden />
      </button>
      <div
        id={contentId}
        className="settings-accordion__collapse"
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        <div className="settings-accordion__inner">
          <div className="settings-accordion__body">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
