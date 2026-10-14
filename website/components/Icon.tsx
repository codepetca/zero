import { ArrowRight, ChevronDown, ChevronRight, Download, Menu, Moon, Sun, X } from "lucide-react";

const icons = {
  "arrow-right": ArrowRight,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  download: Download,
  menu: Menu,
  moon: Moon,
  sun: Sun,
  x: X,
};

export function Icon({ name, className = "" }: { name: keyof typeof icons; className?: string }) {
  const Glyph = icons[name];
  return <Glyph size="1em" strokeWidth={2} className={`icon ${className}`} aria-hidden="true" focusable="false" />;
}
