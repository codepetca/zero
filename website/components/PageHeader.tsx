import type { ReactNode } from "react";
import { Navigation } from "./Navigation";
export function PageHeader({ active = "", actions }: { active?: string; actions?: ReactNode }) {
  return <Navigation active={active} actions={actions} />;
}
