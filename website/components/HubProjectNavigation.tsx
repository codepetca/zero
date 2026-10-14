"use client";
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Icon} from './Icon';
import styles from '@/app/hub/hub.module.css';

type Item = {id: string; title: string; href: string};
export type ProjectNavigation = {starter: Item; featured: Item[]; advanced: Item[]; checkpoint: Item | null};

export function HubProjectNavigation({navigation, current}: {navigation: ProjectNavigation; current: string}) {
  const router = useRouter();
  const items = [navigation.starter, ...navigation.featured, ...navigation.advanced,
    ...(navigation.checkpoint ? [navigation.checkpoint] : [])];
  const link = (item: Item) => <Link key={item.id} href={item.href}
    aria-current={item.id === current ? 'page' : undefined}>{item.title}</Link>;
  return <>
    <label className="mobile-reader-select-label">
      <span className="sr-only">Choose a project</span>
      <select className="mobile-reader-select" aria-label="Choose a project" value={current}
        onChange={event => {
          const item = items.find(item => item.id === event.target.value);
          if (item) router.push(item.href);
        }}>
        <optgroup label="Your own project"><option value={navigation.starter.id}>{navigation.starter.title}</option></optgroup>
        <optgroup label="Practice projects">{navigation.featured.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>
        <optgroup label="Advanced (optional)">{navigation.advanced.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>
        {navigation.checkpoint && <optgroup label="Tutorial checkpoint"><option value={navigation.checkpoint.id}>{navigation.checkpoint.title}</option></optgroup>}
      </select>
    </label>
    <div className={`reader-menu lesson-menu ${styles.projectMenu}`}>
      <nav aria-label="Project navigation">
        <h2>Your own project</h2>
        {link(navigation.starter)}
        <h2>Practice projects</h2>
        {navigation.featured.map(link)}
        <details key={`advanced-${current}`} className={styles.advancedProjects}
          open={navigation.advanced.some(item => item.id === current)}>
          <summary>Advanced <span className={styles.optional}>(optional)</span> <Icon name="chevron-down" /></summary>
          {navigation.advanced.map(link)}
        </details>
        {navigation.checkpoint && <><h2>Tutorial checkpoint</h2>{link(navigation.checkpoint)}</>}
      </nav>
    </div>
  </>;
}
