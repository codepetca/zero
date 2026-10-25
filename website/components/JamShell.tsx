import type {ReactNode} from 'react';
import Link from 'next/link';
import {LearnTheme} from '@/app/learn/LearnTheme';
import '../.generated/learn-theme.css';
import '../app/learn/learn.css';
import './Jam.css';
export function JamShell({children}:{children:ReactNode}) {
  return <LearnTheme active="ZeroHub"><main id="page-content" tabIndex={-1} className="reading jam-page"><nav className="jam-navigation" aria-label="ZeroJams"><Link href="/hub">ZeroHub</Link><Link href="/hub/jams">ZeroJams</Link><Link href="/hub/jams/create">Create a jam</Link></nav>{children}</main></LearnTheme>;
}
