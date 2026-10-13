"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Icon } from "@/components/Icon";

const key = "zero-learn-theme";
const choices = new Set(["system", "light", "dark"]);

export function LearnTheme({ children, active }) {
  const [theme, setTheme] = useState("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    // Preserve old downloads bookmarks and links without keeping downloads
    // inside Tutorials. The Hub's existing Get Zero link uses this address.
    if (window.location.pathname === "/learn" && window.location.hash === "#downloads") {
      window.location.replace("/downloads");
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystem = () => setSystemDark(media.matches);
    updateSystem();
    media.addEventListener("change", updateSystem);
    try {
      const stored = localStorage.getItem(key);
      if (choices.has(stored)) setTheme(stored);
    } catch {
      // Storage may be unavailable; the OS preference still works.
    }
    return () => media.removeEventListener("change", updateSystem);
  }, []);

  const dark = theme === "dark" || (theme === "system" && systemDark);

  function toggleTheme() {
    const next = dark ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // The current selection still works for this visit.
    }
  }

  return (
    <div className="learn-theme" data-theme={theme}>
      <PageHeader active={active} actions={
        <button type="button" className="theme-toggle" onClick={toggleTheme}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}>
          <Icon name={dark ? "sun" : "moon"} />
        </button>
      } />
      {children}
    </div>
  );
}
