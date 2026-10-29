"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { AccountMenu } from "@/components/AccountMenu";
import { HubGitHubProvider } from "@/components/HubGitHub";
import { LegalFooter } from "@/components/LegalFooter";

const key = "zero-learn-theme";
const platformKey = "zero-docs-platform";
const choices = new Set(["system", "light", "dark"]);

export function LearnTheme({ children, active }) {
  const [theme, setTheme] = useState("system");
  const [systemDark, setSystemDark] = useState(false);
  const [platform, setPlatform] = useState("mac");

  useEffect(() => {
    // Preserve old downloads bookmarks and links without keeping downloads
    // inside Tutorials. The Hub's existing Get Zero link uses this address.
    if (window.location.pathname === "/learn" && window.location.hash === "#downloads") {
      window.location.replace("/downloads");
      return;
    }
    let savedPlatform;
    try { savedPlatform = localStorage.getItem(platformKey); } catch {}
    setPlatform(savedPlatform === "mac" || savedPlatform === "windows" ? savedPlatform : /Windows/i.test(navigator.userAgent) ? "windows" : "mac");
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

  useEffect(() => {
    // This stable root-layout link survives client navigation. Metadata links
    // are deduplicated by href, which changes when the page theme changes.
    const icon = document.getElementById("zero-favicon");
    if (icon) icon.setAttribute("href", `/generated/brand/favicon-${dark ? "dark" : "light"}.svg`);
  }, [dark]);

  function toggleTheme() {
    const next = dark ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // The current selection still works for this visit.
    }
  }

  function changePlatform(next) {
    setPlatform(next);
    try { localStorage.setItem(platformKey, next); } catch {}
  }

  return (
    <HubGitHubProvider><div className="learn-theme" data-theme={theme} data-platform={platform}>
      <PageHeader active={active} actions={<AccountMenu dark={dark} onToggleTheme={toggleTheme} platform={platform} onChangePlatform={changePlatform} />} />
      {children}
      <LegalFooter />
    </div></HubGitHubProvider>
  );
}
