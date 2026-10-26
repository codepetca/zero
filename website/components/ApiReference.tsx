'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { CodeBlock } from './CodeBlock';
import Markdown from 'react-markdown';
import { searchApiReference } from '@/lib/api-reference.mjs';
import './ApiReference.css';

type Entry = {
  id: string; name: string; owner: string; signature: string; description: string;
  kind?: 'field';
  parameters: { name: string; description: string }[];
  example?: string; note?: string; related: string[];
};
type Category = { id: string; title: string; description: string; notes: string; entries: Entry[] };
const aliases: Record<string, string> = {
  app: 'startup', gameapp: 'startup', 'window-and-content': 'interface',
  callbacks: 'startup', 'lifecycle-and-extension-hooks': 'advanced',
  'public-lifecycle-methods': 'advanced', 'protected-app-api': 'advanced',
  'protected-gameapp-overrides': 'advanced',
  'input-methods': 'input', 'drawing-methods': 'drawing', 'images-and-resources': 'images',
  'app-startup-and-interfaces': 'startup', 'gameapp-frames-and-canvas': 'startup',
  'threading-errors-and-advanced-java': 'advanced', 'ordinary-javafx-and-reusable-objects': 'interface',
  'short-sound-effects': 'images', 'choose-an-app': 'startup',
};
function Code({ value }: { value: string }) {
  return <code>{value.split(/\b(void|double|boolean|public|protected|final|return|if|new)\b/g).map((part, i) =>
    i % 2 ? <span className="api-keyword" key={i}>{part}</span> : part)}</code>;
}
function RichText({ children, links }: { children: string; links: Record<string, string | null> }) {
  return <Markdown components={{ a: ({ href, children }) => {
    const target = links[href ?? ''] ?? (href?.startsWith('https://') || href?.startsWith('#') ? href : null);
    return target ? <a href={target}>{children}</a> : <span title="See this file in your downloaded starter">{children}</span>;
  } }}>{children}</Markdown>;
}
function entryLabel(entry: Entry) {
  return `${entry.name}${entry.kind === 'field' ? '' : '()'}`;
}
type ApiContentProps = {
  categories: Category[]; links: Record<string, string | null>; active: string;
  jump: (id: string) => void; advancedOpen: boolean; setAdvancedOpen: (open: boolean) => void;
};
// Navigation-only state must not re-parse and reconcile the entire reference.
const ApiContent = memo(function ApiContent({ categories, links, active, jump, advancedOpen, setAdvancedOpen }: ApiContentProps) {
  const entries = useMemo(() => categories.flatMap(category => category.entries), [categories]);
  function methodLink(entry: Entry, label = entryLabel(entry)) {
    return <a href={`#${entry.id}`} aria-current={active === entry.id ? 'location' : undefined}
      onClick={event => { event.preventDefault(); jump(entry.id); }}>{label}</a>;
  }
  function renderCategory(category: Category) {
    return <section className="api-category" id={category.id} key={category.id} tabIndex={-1}>
      <div className="api-category-heading"><h2>{category.title}</h2></div>
      {category.entries.map(entry => <article className="api-entry" id={entry.id} data-api-entry key={entry.id} tabIndex={-1}>
        <div className="api-method-title"><h3><a href={`#${entry.id}`} onClick={event => { event.preventDefault(); jump(entry.id); }}>{entryLabel(entry)}</a></h3><span className="api-owner">{entry.owner}</span></div>
        <div className="api-description"><RichText links={links}>{entry.description}</RichText></div>
        <div className="api-signature"><CodeBlock><Code value={entry.signature} /></CodeBlock></div>
        {!!entry.parameters.length && <dl className="api-parameters">{entry.parameters.map(parameter => <div key={parameter.name}><dt><code>{parameter.name}</code></dt><dd>{parameter.description}</dd></div>)}</dl>}
        {entry.example && <><h4>Example</h4><div className="api-example"><CodeBlock><Code value={entry.example} /></CodeBlock></div></>}
        {entry.note && <div className="api-method-note"><RichText links={links}>{entry.note}</RichText></div>}
        {!!entry.related.length && <p className="api-related">See also: {entry.related.map((id, index) => {
          const related = entries.find(other => other.id === id);
          return related ? <span key={id}>{index > 0 && ' · '}{methodLink(related)}</span> : null;
        })}</p>}
      </article>)}
      {category.notes && <details className="api-notes"><summary>More about {category.title.toLowerCase()}</summary><RichText links={links}>{category.notes}</RichText></details>}
    </section>;
  }

  return (
    <main className="api-content" id="page-content" tabIndex={-1}>
      {categories.filter(category => category.id !== 'advanced').map(renderCategory)}
      <details className="api-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
        <summary>Advanced lifecycle and extension hooks</summary>
        {categories.filter(category => category.id === 'advanced').map(renderCategory)}
      </details>
      <footer className="api-source">Reference maintained with the readable framework in your starter. <Link href="/learn">Learn through the tutorials</Link></footer>
    </main>
  );
});

export function ApiReference({ categories, links }: { categories: Category[]; links: Record<string, string | null> }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const [expanded, setExpanded] = useState<string[]>(['startup']);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.api-page');
    const header = root?.querySelector<HTMLElement>('.site-header');
    if (!root || !header) return;
    const update = () => root.style.setProperty('--api-header-height', `${header.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const results = useMemo(() => searchApiReference(categories, query), [categories, query]) as (Entry & { categoryId: string; categoryTitle: string })[];
  const searching = query.trim().length > 0;

  const reveal = useCallback((id: string) => {
    const target = aliases[id] ?? id;
    const category = categories.find(c => c.id === target || c.entries.some(e => e.id === target));
    if (category) {
      setExpanded(previous => previous.includes(category.id) ? previous : [...previous, category.id]);
      if (category.id === 'advanced') setAdvancedOpen(true);
    }
    setActive(target);
    return target;
  }, [categories]);
  const jump = useCallback((id: string) => {
    const target = reveal(id);
    setQuery('');
    setMobileOpen(false);
    window.history.pushState(null, '', `#${target}`);
    // Wait for a closed Advanced section to render before following its anchor.
    requestAnimationFrame(() => {
      const element = document.getElementById(target);
      element?.scrollIntoView({ block: 'start', behavior: 'instant' });
      element?.focus({ preventScroll: true });
    });
  }, [reveal]);
  useEffect(() => {
    function followHash() {
      let id = window.location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch { return; }
      if (!id) return;
      const target = reveal(id);
      requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    }
    followHash();
    window.addEventListener('hashchange', followHash);
    window.addEventListener('popstate', followHash);
    return () => {
      window.removeEventListener('hashchange', followHash);
      window.removeEventListener('popstate', followHash);
    };
  // Categories come from a static canonical snapshot and never change during this page's lifetime.
  }, []);
  useEffect(() => {
    let frame = 0;
    function onScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const headings = [...document.querySelectorAll<HTMLElement>('[data-api-entry]')];
        const anchorLine = headings[0] ? Number.parseFloat(getComputedStyle(headings[0]).scrollMarginTop) + 16 : 0;
        const nearest = headings.filter(element => element.getClientRects().length > 0 && element.getBoundingClientRect().top <= anchorLine).at(-1);
        if (nearest) setActive(nearest.id);
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, []);

  function methodLink(entry: Entry, label = entryLabel(entry)) {
    return <a href={`#${entry.id}`} aria-current={active === entry.id ? 'location' : undefined}
      onClick={event => { event.preventDefault(); jump(entry.id); }}>{label}</a>;
  }
  return <div className="api-workspace">
    <aside className="api-sidebar" aria-label="API reference navigation">
      <h1>API reference</h1>
      <form className="api-search" role="search" onSubmit={event => { event.preventDefault(); if (searching && results[0]) jump(results[0].id); }}>
        <Icon name="search" />
        <input ref={search} type="search" value={query} aria-label="Find a method" placeholder="Find a method…"
          onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { setQuery(''); search.current?.focus(); } }} />
      </form>
      <button className="api-contents-toggle" aria-expanded={mobileOpen} aria-controls="api-contents" onClick={() => setMobileOpen(!mobileOpen)}>Contents<Icon name="chevron-down" /></button>
      <p className="api-search-status" role="status">{searching ? `${results.length} ${results.length === 1 ? 'method' : 'methods'} found` : ''}</p>
      {searching ? <nav className="api-results" aria-label="Search results">{results.length ? results.map(entry => <div key={entry.id}>{methodLink(entry, `${entryLabel(entry)}${entry.id === 'image-scaled' ? ' — scaled' : ''}`)}<small>{entry.categoryTitle} · {entry.owner}</small></div>) : <p>No matching methods. Try “drawing”, “keyboard” or “image”.</p>}</nav> :
        <div className={`api-contents ${mobileOpen ? 'is-open' : ''}`} id="api-contents">
          <nav aria-label="Methods by category">{[...categories].sort((a, b) => a.title.localeCompare(b.title, 'en')).map(category => {
            const isOpen = expanded.includes(category.id);
            const isActive = category.id === active || category.entries.some(entry => entry.id === active);
            return <div className="api-nav-group" key={category.id}>
              <div className={`api-nav-heading ${isActive ? 'is-active' : ''}`}>
                <a href={`#${category.id}`} onClick={event => { event.preventDefault(); jump(category.id); }}>{category.title}</a>
                <button type="button" aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${category.title}`} aria-expanded={isOpen} aria-controls={`nav-${category.id}`} onClick={() => setExpanded(previous => isOpen ? previous.filter(id => id !== category.id) : [...previous, category.id])}><Icon name="chevron-down" className={isOpen ? '' : 'is-closed'} /></button>
              </div>
              <ul hidden={!isOpen} id={`nav-${category.id}`}>{category.entries.map(entry => <li key={entry.id}>{methodLink(entry, `${entryLabel(entry)}${entry.id === 'image-scaled' ? ' · scaled' : ''}${category.id === 'advanced' ? ` · ${entry.owner}` : ''}`)}</li>)}</ul>
            </div>;
          })}</nav>
          <div className="api-guide-links"><Link href="/learn">Tutorials</Link><Link href="/help/setup">Setup help</Link><Link href="/teachers">For teachers</Link></div>
        </div>}
    </aside>
    <ApiContent categories={categories} links={links} active={active} jump={jump} advancedOpen={advancedOpen} setAdvancedOpen={setAdvancedOpen} />
  </div>;
}
