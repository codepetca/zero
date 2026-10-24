import { ArrowRight, ChevronDown, ChevronRight, CircleCheck, CircleHelp, Info, Download, Flag, Menu, Moon, Play, Search, Star, Sun, TriangleAlert, UserRound, X } from "lucide-react";

const icons = {
  "arrow-right": ArrowRight,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "circle-check": CircleCheck,
  "circle-help": CircleHelp,
  download: Download,
  flag: Flag,
  info: Info,
  menu: Menu,
  play: Play,
  search: Search,
  star: Star,
  moon: Moon,
  sun: Sun,
  user: UserRound,
  "triangle-alert": TriangleAlert,
  x: X,
};

export function Icon({ name, className = "" }: { name: keyof typeof icons; className?: string }) {
  const Glyph = icons[name];
  return <Glyph size="1em" strokeWidth={2} className={`icon ${className}`} aria-hidden="true" focusable="false" />;
}
