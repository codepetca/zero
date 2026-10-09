import Link from 'next/link';
import { Brand, DownloadIcon } from '@/components/Brand';
import { downloadHref } from '@/lib/content';
export const dynamic = 'force-dynamic';
export default function Home() {
  return <main className="landing"><div className="hero"><Brand hero /><p>A simple kit for building Java apps.</p><div className="hero-actions"><a className="button primary" href={downloadHref()}><DownloadIcon />Download Zero</a><Link className="button secondary" href="/learn">Learn more</Link></div></div></main>;
}
