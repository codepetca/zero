import { Navigation } from "./Navigation";
import { downloadHref } from "@/lib/content";
export function PageHeader({ active = "" }: { active?: string }) {
  return <Navigation active={active} downloadUrl={downloadHref()} />;
}
