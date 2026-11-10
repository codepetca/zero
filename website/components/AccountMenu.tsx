'use client';
import {useEffect, useId, useRef, useState} from 'react';
import {HubAccount, useHubGitHub} from './HubGitHub';
import {Icon} from './Icon';
import {useZeroAccount} from './useZeroAccount';
import './AccountMenu.css';

function ProfileAvatar({id, login}: {id?:string|null; login?:string}) {
  const [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false);
  return <span className="profile-avatar" aria-hidden="true">
    {(!loaded || failed) && (login ? <span>{login.charAt(0).toUpperCase()}</span> : <Icon name="user" />)}
    {id && !failed && <img className="profile-photo" src={`https://avatars.githubusercontent.com/u/${id}?s=88`} alt="" width={28} height={28}
      crossOrigin="anonymous" referrerPolicy="no-referrer" decoding="async" data-loaded={loaded}
      onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
  </span>;
}

export function AccountMenu({dark, onToggleTheme, platform, onChangePlatform}: {dark:boolean; onToggleTheme:()=>void; platform:'mac'|'windows'; onChangePlatform:(platform:'mac'|'windows')=>void}) {
  const {configured, user, error, callbackError} = useHubGitHub();
  const {state: zeroAccount, error: zeroAccountError} = useZeroAccount();
  const zeroUser = zeroAccount?.user;
  const signedIn = Boolean(user || zeroUser);
  const avatarId = user?.id ?? zeroUser?.avatarId;
  const label = user ? `Account menu, signed in as @${user.login}` :
    signedIn ? 'Account menu, signed in to Zero' : 'Account menu';
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const attention = !signedIn && (!!error || callbackError || zeroAccountError);
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
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return <div ref={root} className="account-menu" onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className="profile-toggle" data-connected={signedIn ? 'true' : undefined} aria-expanded={open} aria-controls={id}
      aria-label={attention ? 'Account menu, sign-in needs attention' : label}
      title={user ? `@${user.login}` : 'Account'} onClick={() => setOpen(value => !value)}>
      {signedIn ? <ProfileAvatar key={avatarId} id={avatarId} login={user?.login} /> : <Icon name={attention ? 'triangle-alert' : 'user'} />}
      {!signedIn && <span className="account-label">Account</span>}
    </button>
    <div id={id} hidden={!open} className="account-dropdown" aria-label="Account and appearance">
      {!user && zeroUser ? <>
        <span className="account-identity">Signed in to Zero</span>
        <form action="/zero-account/sign-out" method="post"><button type="submit">Sign out</button></form>
        {(configured || error || callbackError) && <HubAccount showSignOut={false}
          signInLabel="Connect GitHub to ZeroHub" onRetryComplete={() => trigger.current?.focus()} />}
      </> : !user && configured !== true && zeroAccount?.configured ?
        <a href="/zero-account/sign-in">Sign in to GitHub</a> :
        <HubAccount onSignedOut={() => {setOpen(false); trigger.current?.focus();}} onRetryComplete={() => trigger.current?.focus()} />}
      {!signedIn && zeroAccountError && <p role="status">Could not check your Zero account. Reload to try again.</p>}
      <fieldset className="platform-setting">
        <legend>Documentation platform</legend>
        <label><input type="radio" name="documentation-platform" value="mac" checked={platform === 'mac'} onChange={() => onChangePlatform('mac')} /> Mac</label>
        <label><input type="radio" name="documentation-platform" value="windows" checked={platform === 'windows'} onChange={() => onChangePlatform('windows')} /> Windows</label>
      </fieldset>
      <button type="button" className="appearance-action" onClick={onToggleTheme}>
        <Icon name={dark ? 'sun' : 'moon'} />{dark ? 'Switch to light mode' : 'Switch to dark mode'}
      </button>
    </div>
  </div>;
}
