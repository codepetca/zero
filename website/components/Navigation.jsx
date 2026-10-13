"use client";
import { useState } from "react";
import { Brand } from "./Brand";
import { Icon } from "./Icon";
/** @param {{ active?: string, actions?: import("react").ReactNode }} props */
export function Navigation({ active = "", actions = null }) {
  const [menu, setMenu] = useState(false);
  return (
    <header className="site-header">
      <Brand />
      <button
        className="menu-toggle"
        aria-label={menu ? "Close navigation" : "Open navigation"}
        aria-expanded={menu}
        aria-controls="site-nav"
        onClick={() => setMenu(!menu)}
      >
        <Icon name={menu ? "x-lg" : "list"} />
      </button>
      <nav
        id="site-nav"
        aria-label="Main navigation"
        className={menu ? "nav-open" : ""}
      >
        {[
          ["Tutorials", "/learn"],
          ["Docs", "/docs"],
          ["Examples", "/examples"],
          ["ZeroHub", "/hub"],
          ["Download", "/downloads"],
        ].map(([name, href]) => (
          <a
            key={name}
            href={href}
            aria-current={active === name ? "page" : undefined}
          >
            {name}
          </a>
        ))}
      </nav>
      {actions}
    </header>
  );
}
