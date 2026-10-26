"use client";

import { useRef, useState } from "react";
import "./BetaNotice.css";

export function BetaNotice() {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);

  return <>
    <button
      ref={trigger}
      className="beta-chip"
      aria-label="Beta information"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="beta-notice"
      onClick={() => { dialog.current.showModal(); setOpen(true); }}
    >Beta</button>
    <dialog
      ref={dialog}
      id="beta-notice"
      className="beta-notice"
      aria-labelledby="beta-notice-title"
      aria-describedby="beta-notice-details"
      onClose={() => { setOpen(false); trigger.current?.focus(); }}
    >
      <h2 id="beta-notice-title">Zero is in beta</h2>
      <div id="beta-notice-details">
        <p>Zero and ZeroHub are in beta. Features may change, break or be unavailable.</p>
        <p>Data may not be saved or retained, and may be lost or removed. Keep your own backups of code, assets and anything important.</p>
        <p>Repositories created in your GitHub account belong to you. You are responsible for their contents, visibility, access, backups and maintenance, including any apps published from them.</p>
        <p>These risks also apply after beta. Read the <a href="/terms">terms</a> and <a href="/privacy">privacy notice</a>.</p>
      </div>
      <form method="dialog"><button className="beta-close">Close</button></form>
    </dialog>
  </>;
}
