"use client";
import { useState } from "react";
import { Brand } from "./Brand";
import { Icon } from "./Icon";
export function Navigation({ active = "", downloadUrl }) {
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
          ["Community", "/community"],
        ].map(([name, href]) => (
          <a
            key={name}
            href={href}
            aria-current={active === name ? "page" : undefined}
          >
            {name}
          </a>
        ))}
        <a className="nav-download" href={downloadUrl}>
          Download
        </a>
      </nav>
    </header>
  );
}
