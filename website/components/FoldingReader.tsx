"use client";
import { useEffect, type ReactNode } from "react";

export function FoldingReader({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reveal = () => {
      let anchor;
      try {
        anchor = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const target = anchor && document.getElementById(anchor);
      if (!target) return;
      let parent = target.closest("details");
      while (parent) {
        parent.open = true;
        parent = parent.parentElement?.closest("details") ?? null;
      }
      requestAnimationFrame(() => target.scrollIntoView());
    };
    const click = (event: MouseEvent) => {
      const element = event.target;
      const link =
        element instanceof Element ? element.closest("a[href]") : null;
      if (
        link instanceof HTMLAnchorElement &&
        link.origin === location.origin &&
        link.pathname === location.pathname &&
        link.search === location.search &&
        link.hash &&
        link.hash === location.hash
      )
        reveal();
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("hashchange", reveal);
      document.removeEventListener("click", click);
    };
  }, []);

  return <div className="markdown">{children}</div>;
}
