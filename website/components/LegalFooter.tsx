'use client';

import { useEffect, useState } from 'react';
import './Legal.css';

export function LegalFooter() {
  const [year, setYear] = useState(2026);
  useEffect(() => { setYear(Math.max(2026, new Date().getFullYear())); }, []);
  const years = year === 2026 ? '2026' : `2026–${year}`;

  return <footer className="legal-footer">
    <hr />
    <div className="legal-footer-row">
      <span>© {years} Zero by Codepet</span>
      <nav aria-label="Privacy and terms"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
    </div>
    <p className="legal-use-notice">By using this site, you agree to the Terms.</p>
  </footer>;
}
