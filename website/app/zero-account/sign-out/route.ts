import { getWorkOS } from '@workos-inc/authkit-nextjs';
import { cookies } from 'next/headers';
import { unsealData } from 'iron-session';
import { decodeJwt } from 'jose';
import { cookieHeader, FLOW_COOKIE, readCookie, redirect, SESSION_COOKIE } from '@/lib/hub-github-auth.mjs';
import { workosConfigured } from '@/lib/workos-config.mjs';

export async function POST(request: Request) {
  if (!workosConfigured()) return new Response('Sign-in unavailable', {status:503,headers:{'Cache-Control':'no-store'}});
  const callback = new URL(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI!);
  if (request.headers.get('origin') !== callback.origin)
    return new Response('Invalid origin', {status:403,headers:{'Cache-Control':'no-store'}});
  const workosCookie = process.env.WORKOS_COOKIE_NAME!;
  const sessionData = readCookie(request, workosCookie);
  let location = new URL('/zero-account', callback).toString();
  if (sessionData) {
    try {
      // Match AuthKit signOut: the sealed cookie authenticates the token's
      // origin, so its SID can be recovered even when the access token expired.
      const session = await unsealData<{accessToken?: unknown}>(sessionData, {
        password:process.env.WORKOS_COOKIE_PASSWORD!,
      });
      if (typeof session?.accessToken === 'string') {
        const {sid} = decodeJwt(session.accessToken);
        if (typeof sid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(sid))
          location = getWorkOS().userManagement.getLogoutUrl({sessionId:sid});
      }
    } catch { /* An invalid provider cookie still clears local access. */ }
  }
  const jar = await cookies();
  // AuthKit's documented PKCE cookie and its per-flow variants can otherwise
  // finish a pending login after this sign-out.
  const verifiers = jar.getAll().map(({name}) => name)
    .filter(name => /^wos-auth-verifier(?:-[a-zA-Z0-9_-]+)?$/.test(name));
  const clear = [SESSION_COOKIE, FLOW_COOKIE, workosCookie, ...verifiers].map(name =>
    cookieHeader(name, '', {secure:callback.protocol === 'https:'}, 0));
  return redirect(location, clear);
}
