import Link from 'next/link';
import { Icon } from './Icon';
export function Brand({ hero = false }: { hero?: boolean }) {
  const mark = <><img className="brand-mark-light" src="/generated/brand/zero-purple.svg" alt="" width="30" height="30" /><img className="brand-mark-dark" src="/generated/brand/zero-white-on-purple.svg" alt="" width="30" height="30" /><span>zero</span></>;
  return hero ? <h1 className="hero-brand" aria-label="Zero">{mark}</h1> : <Link className="brand" href="/" aria-label="Zero home">{mark}</Link>;
}
export function DownloadIcon() { return <Icon name="download" className="download-icon" />; }
