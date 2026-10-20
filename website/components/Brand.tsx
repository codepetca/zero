import Link from 'next/link';
import { Icon } from './Icon';
export function Brand({ hero = false }: { hero?: boolean }) {
  const mark = <><img className="brand-mark-light brand-wordmark" src="/generated/brand/zero-wordmark.svg" alt="" width="150" height="36" /><img className="brand-mark-dark brand-wordmark" src="/generated/brand/zero-wordmark-dark.svg" alt="" width="150" height="36" /></>;
  return hero ? <h1 className="hero-brand" aria-label="Zero">{mark}</h1> : <Link className="brand" href="/" aria-label="Zero home">{mark}</Link>;
}
export function DownloadIcon() { return <Icon name="download" className="download-icon" />; }
