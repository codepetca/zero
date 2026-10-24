'use client';
import {useEffect, useId, useRef, useState} from 'react';
import {HubAccount, useHubGitHub} from './HubGitHub';
import {Icon} from './Icon';
import './AccountMenu.css';

function GitHubAvatar({id, login}: {id:string; login:string}) {
  const [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false);
  return <span className="profile-avatar" aria-hidden="true">
    {(!loaded || failed) && <span>{login.charAt(0).toUpperCase() || '?'}</span>}
    {!failed && <img className="profile-photo" src={`https://avatars.githubusercontent.com/u/${id}?s=88`} alt="" width={44} height={44}
      crossOrigin="anonymous" referrerPolicy="no-referrer" decoding="async" data-loaded={loaded}
      onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
  </span>;
}

export function AccountMenu({dark, onToggleTheme}: {dark:boolean; onToggleTheme:()=>void}) {
  const {user, error, callbackError} = useHubGitHub();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const attention = !!error || callbackError && !user;
  useEffect(() => {if (callbackError) {setOpen(true); trigger.current?.focus();}}, [callbackError]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', outside);
    root.current?.addEventListener('keydown', escape);
    const element = root.current;
    return () => {
      document.removeEventListener('pointerdown', outside);
      element?.removeEventListener('keydown', escape);
    };
  }, [open]);
  return <div ref={root} className="account-menu" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className="profile-toggle" data-connected={user ? 'true' : undefined} aria-expanded={open} aria-controls={id}
      aria-label={user ? `Account menu, signed in as @${user.login}` : attention ? 'Account menu, GitHub connection needs attention' : 'Account menu'}
      title={user ? `@${user.login}` : 'Account'} onClick={() => setOpen(value => !value)}>
      {user ? <GitHubAvatar key={user.id} id={user.id} login={user.login} /> : <Icon name={attention ? 'triangle-alert' : 'user'} />}
    </button>
    <div id={id} hidden={!open} className="account-dropdown" aria-label="Account and appearance">
      <HubAccount onSignedOut={() => {setOpen(false); trigger.current?.focus();}} onRetryComplete={() => trigger.current?.focus()} />
      <button type="button" className="appearance-action" onClick={onToggleTheme}>
        <Icon name={dark ? 'sun' : 'moon'} />{dark ? 'Switch to light mode' : 'Switch to dark mode'}
      </button>
    </div>
  </div>;
}
