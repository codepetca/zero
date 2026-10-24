'use client';
import {useEffect, useId, useRef, useState} from 'react';
import {HubAccount, useHubGitHub} from './HubGitHub';
import {Icon} from './Icon';
import './AccountMenu.css';

export function AccountMenu({dark, onToggleTheme}: {dark:boolean; onToggleTheme:()=>void}) {
  const {user, error} = useHubGitHub();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
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
    <button ref={trigger} type="button" className="profile-toggle" aria-expanded={open} aria-controls={id}
      aria-label={user ? `Account menu, signed in as @${user.login}` : error ? 'Account menu, GitHub connection needs attention' : 'Account menu'}
      title={user ? `@${user.login}` : 'Account'} onClick={() => setOpen(value => !value)}>
      <Icon name={error ? 'triangle-alert' : 'user'} />
    </button>
    <div id={id} hidden={!open} className="account-dropdown" aria-label="Account and appearance">
      <HubAccount onSignedOut={() => {setOpen(false); trigger.current?.focus();}} onRetryComplete={() => trigger.current?.focus()} />
      <button type="button" className="appearance-action" onClick={onToggleTheme}>
        <Icon name={dark ? 'sun' : 'moon'} />{dark ? 'Switch to light mode' : 'Switch to dark mode'}
      </button>
    </div>
  </div>;
}
