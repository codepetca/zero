import type {ReactNode} from 'react';
import './Jam.css';

export function JamShell({children}:{children:ReactNode}) {
  return <div className="jam-page">{children}</div>;
}
