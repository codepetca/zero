import { Navigation } from "./Navigation";
import { landingHref } from "@/lib/content";
export function PageHeader({ active = "" }: { active?: string }) {
  return <Navigation active={active} downloadUrl={landingHref()} />;
}
