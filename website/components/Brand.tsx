import Link from 'next/link';
import { Icon } from './Icon';
export function Brand({ hero = false }: { hero?: boolean }) {
  const mark = <><img src="/generated/zero.svg" alt="" width="24" height="24" /><span>zero</span></>;
  return hero ? <h1 className="hero-brand" aria-label="Zero">{mark}</h1> : <Link className="brand" href="/" aria-label="Zero home">{mark}</Link>;
}
export function DownloadIcon() { return <Icon name="download" className="download-icon" />; }
