"use client";
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Icon} from './Icon';
import styles from '@/app/hub/hub.module.css';

type Item = {id: string; title: string; href: string; external?: boolean};
export type ProjectNavigation = {starter: Item; featured: Item[]; advanced: Item[]; checkpoint: Item | null};

export function HubProjectNavigation({navigation, current}: {navigation: ProjectNavigation; current: string}) {
  const router = useRouter();
  const items = [...navigation.featured, ...navigation.advanced,
    ...(navigation.checkpoint ? [navigation.checkpoint] : [])];
  const link = (item: Item) => item.external
    ? <a key={item.id} href={item.href}>{item.title} <Icon name="arrow-right" /></a>
    : <Link key={item.id} href={item.href}
      aria-current={item.id === current ? 'page' : undefined}>{item.title}</Link>;
  const newProject = <a className={`button secondary ${styles.newProject}`} href={navigation.starter.href}>
    {navigation.starter.title} <Icon name="arrow-right" />
  </a>;
  return <>
    <div className={styles.mobileProjectActions}>
      {newProject}
      <label>
      <span className="sr-only">Choose an example</span>
      <select className="mobile-reader-select" aria-label="Choose an example" value={items.some(item => item.id === current) ? current : ''}
        onChange={event => {
          const item = items.find(item => item.id === event.target.value);
          if (item) router.push(item.href);
        }}>
        <option value="" disabled>Explore examples</option>
        <optgroup label="Practice projects">{navigation.featured.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>
        <optgroup label="Advanced (optional)">{navigation.advanced.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>
        {navigation.checkpoint && <optgroup label="Tutorial checkpoint"><option value={navigation.checkpoint.id}>{navigation.checkpoint.title}</option></optgroup>}
      </select>
      </label>
    </div>
    <div className={`reader-menu lesson-menu ${styles.projectMenu}`}>
      {newProject}
      <nav aria-label="Project navigation">
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
