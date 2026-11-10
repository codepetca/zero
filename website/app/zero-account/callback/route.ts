import { getWorkOS, handleAuth } from '@workos-inc/authkit-nextjs';
import { cookieHeader, FLOW_COOKIE, safeHubReturnTo, SESSION_COOKIE } from '@/lib/hub-github-auth.mjs';
import { githubAuthentication, workosConfigured } from '@/lib/workos-config.mjs';
import { createWorkOSHubSession } from '@/lib/workos-github-binding.mjs';

export async function GET(request: Parameters<ReturnType<typeof handleAuth>>[0]) {
  if (!workosConfigured()) return new Response('Sign-in unavailable', {status:503, headers:{'Cache-Control':'no-store'}});
  const callback = new URL(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI!);
  const cookieConfig = {secure:callback.protocol === 'https:'};
  let hubCookie: string | null = null;
  let signedIn = false;
  const response = await handleAuth({
    baseURL:callback.origin,
    returnPathname:'/',
    onSuccess:async data => {
      if (!githubAuthentication(data)) throw new Error('GitHub authentication required');
      const grant = await createWorkOSHubSession(data, (token: string) => getWorkOS().userManagement.verifyAccessToken(token));
      hubCookie = grant?.cookie ?? null;
      signedIn = true;
    },
    onError:() => new Response('Sign-in could not be completed.', {status:400,headers:{'Cache-Control':'no-store'}}),
  })(request);
  if (signedIn) {
    response.headers.append('Set-Cookie', cookieHeader(FLOW_COOKIE, '', cookieConfig, 0));
    response.headers.append('Set-Cookie', hubCookie ?? cookieHeader(SESSION_COOKIE, '', cookieConfig, 0));
    const location = response.headers.get('Location');
    if (!hubCookie && location) {
      const target = new URL(location, callback);
      if (target.origin === callback.origin && safeHubReturnTo(target.pathname + target.search) === target.pathname + target.search) {
        target.searchParams.set('github', 'failed');
        response.headers.set('Location', target.toString());
      }
    }
  }
  return response;
}
