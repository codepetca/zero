"use client";
import { useEffect, useRef, useState } from "react";
import { Brand } from "./Brand";
import { Icon } from "./Icon";
import { BetaNotice } from "./BetaNotice";
/** @param {{ active?: string, actions?: import("react").ReactNode }} props */
export function Navigation({ active = "", actions = null }) {
  const [menu, setMenu] = useState(false);
  const toggle = useRef(null), navigation = useRef(null);
  useEffect(() => {
    if (!menu) return;
    const mobile = window.matchMedia('(max-width: 760px)');
    function outside(event) {
      if (!navigation.current?.contains(event.target) && !toggle.current?.contains(event.target)) setMenu(false);
    }
    function escape(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMenu(false);
      toggle.current?.focus();
    }
    function resize() { if (!mobile.matches) setMenu(false); }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    mobile.addEventListener('change', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
      mobile.removeEventListener('change', resize);
    };
  }, [menu]);
  return (
    <header className="site-header">
      <div className="site-identity"><Brand /><BetaNotice /></div>
      <button
        ref={toggle}
        className="menu-toggle"
        aria-label={menu ? "Close navigation" : "Open navigation"}
        aria-expanded={menu}
        aria-controls="site-nav"
        onClick={() => setMenu(!menu)}
      >
        <Icon name={menu ? "x" : "menu"} />
      </button>
      <nav
        ref={navigation}
        id="site-nav"
        aria-label="Main navigation"
        className={menu ? "nav-open" : ""}
      >
        {[
          ["Tutorials", "/learn"],
          ["Docs", "/docs"],
          ["ZeroHub", "/hub"],
        ].map(([name, href]) => (
          <a
            key={name}
            href={href}
            aria-current={active === name ? "page" : undefined}
            onClick={() => setMenu(false)}
          >
            {name}
          </a>
        ))}
      </nav>
      {actions}
    </header>
  );
}
