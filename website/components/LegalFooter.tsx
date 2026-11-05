'use client';

import { useEffect, useState } from 'react';
import './Legal.css';

export function LegalFooter() {
  const [year, setYear] = useState(2026);
  useEffect(() => { setYear(Math.max(2026, new Date().getFullYear())); }, []);
  const years = year === 2026 ? '2026' : `2026–${year}`;

  return <footer className="legal-footer">
    <div className="legal-footer-row">
      <span>© {years} Zero by Codepet</span>
      <nav aria-label="Footer links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:info@codepet.ca">Contact</a></nav>
    </div>
  </footer>;
}
