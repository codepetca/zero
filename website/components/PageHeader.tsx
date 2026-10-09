import Link from 'next/link';
import { Brand } from './Brand';
export function PageHeader() {
  return <header className="page-header"><Brand /><nav aria-label="Site"><Link href="/learn">Learn</Link><Link href="/community">Community</Link><a href="https://github.com/codepetca/zero">GitHub</a></nav></header>;
}
