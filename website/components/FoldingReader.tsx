"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function FoldingReader({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const container = root.current;
    const syncExpanded = () => {
      const sections = container?.querySelectorAll<HTMLDetailsElement>(
        "details.reading-section",
      );
      setExpanded(
        !!sections?.length &&
          Array.from(sections).every((section) => section.open),
      );
    };
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
    container?.addEventListener("toggle", syncExpanded, true);
    reveal();
    window.addEventListener("hashchange", reveal);
    document.addEventListener("click", click);
    return () => {
      container?.removeEventListener("toggle", syncExpanded, true);
      window.removeEventListener("hashchange", reveal);
      document.removeEventListener("click", click);
    };
  }, []);

  const toggleAll = () => {
    const open = !expanded;
    root.current
      ?.querySelectorAll<HTMLDetailsElement>("details.reading-section")
      .forEach((section) => {
        section.open = open;
      });
    setExpanded(open);
  };
  return (
    <div className="markdown" ref={root}>
      <div className="reading-controls">
        <span>Tap a section to read more.</span>
        <button
          className="text-button"
          aria-pressed={expanded}
          onClick={toggleAll}
        >
          {expanded ? "Collapse all" : "Expand all"}
        </button>
      </div>
      {children}
    </div>
  );
}
