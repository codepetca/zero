"use client";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {copyCode} from "@/lib/copy-code.mjs";

/** Copy the rendered code verbatim; controls and feedback stay outside the pre. */
export function CodeBlock({children, copyText, hasRemovedLines = false}: {children: ReactNode; copyText?: string; hasRemovedLines?: boolean}) {
  const pre = useRef<HTMLPreElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copying = useRef(false);
  const mounted = useRef(false);
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    const text = copyText ?? pre.current?.querySelector("code")?.textContent;
    if (text == null || copying.current) return;
    copying.current = true;
    if (timer.current) clearTimeout(timer.current);
    try {
      if (!await copyCode(text)) throw new Error("Copy unavailable");
      if (!mounted.current) return;
      setStatus("copied");
      timer.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      if (mounted.current) setStatus("error");
    } finally {
      copying.current = false;
    }
  }

  return <div className="copyable-code" data-copy-state={status}>
    <pre ref={pre} title="Click to copy code" onClick={() => {
      // Dragging to select part of a snippet should keep normal text selection.
      if (window.getSelection()?.isCollapsed === false) return;
      void copy();
    }}>{children}</pre>
    <button className="code-copy-button" type="button" aria-label="Copy code to clipboard"
      onClick={() => { void copy(); }}>{status === "copied" ? "Copied" : "Copy"}</button>
    <span role="status" className={status === "error" ? "code-copy-error" : "sr-only"}>
      {status === "copied" ? "Code copied to clipboard." : status === "error"
        ? hasRemovedLines ? "Could not copy. Copy the code manually, leaving out the removed lines." : "Could not copy. Select the code and copy it manually." : ""}
    </span>
  </div>;
}
