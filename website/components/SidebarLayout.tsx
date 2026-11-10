import type {ReactNode} from 'react';
import styles from './SidebarLayout.module.css';

type Props = {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
  sidebarClassName?: string;
  sidebarLabel?: string;
  skipToPane?: boolean;
};

export function SidebarLayout({sidebar, children, className, sidebarClassName, sidebarLabel, skipToPane}: Props) {
  const skipTarget = {id: 'page-content', tabIndex: -1};
  return <main {...(skipToPane ? {} : skipTarget)} className={className ? `${styles.layout} ${className}` : styles.layout}>
    <aside aria-label={sidebarLabel} className={sidebarClassName ? `${styles.sidebar} ${sidebarClassName}` : styles.sidebar}>
      {sidebar}
    </aside>
    <div {...(skipToPane ? skipTarget : {})} className={styles.content}>{children}</div>
  </main>;
}
