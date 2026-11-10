"use client";
import { useEffect, useRef, useState } from "react";
import { Brand } from "./Brand";
import { Icon } from "./Icon";
import { BetaNotice } from "./BetaNotice";
import { ZeroAccount } from "./ZeroAccount";
/** @param {{ active?: string, actions?: import("react").ReactNode }} props */
export function Navigation({ active = "", actions = null }) {
  const navigation = useRef(null);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  useEffect(() => {
    function dismiss(event) {
      if (event.key === 'Escape' && navigation.current?.querySelector('a:hover, a:focus-visible')) setTooltipDismissed(true);
    }
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, []);
  return (
    <header className="site-header">
      <div className="site-identity"><Brand /><BetaNotice /></div>
      <nav ref={navigation} id="site-nav" aria-label="Main navigation">
        {[
          ["Tutorials", "/learn", "graduation-cap"],
          ["Docs", "/docs", "book-open"],
          ["ZeroHub", "/hub", "graph-star"],
        ].map(([name, href, icon]) => (
          <a
            key={name}
            href={href}
            aria-label={name}
            data-tooltip={name}
            data-tooltip-dismissed={tooltipDismissed ? 'true' : undefined}
            aria-current={active === name ? "page" : undefined}
            onFocus={() => setTooltipDismissed(false)}
            onBlur={() => setTooltipDismissed(false)}
            onMouseEnter={() => setTooltipDismissed(false)}
            onMouseLeave={() => setTooltipDismissed(false)}
          >
            <Icon name={icon} /><span>{name}</span>
          </a>
        ))}
      </nav>
      <ZeroAccount />
      {actions}
    </header>
  );
}
