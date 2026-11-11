import { getSignInUrl } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { safeHubReturnTo } from '@/lib/hub-github-auth.mjs';
import { workosConfigured } from '@/lib/workos-config.mjs';
export async function GET(request: Request) {
  if (!workosConfigured()) return new Response('Sign-in unavailable', {status:503, headers:{'Cache-Control':'no-store'}});
  const returnTo = new URL(request.url).searchParams.get('returnTo');
  redirect(await getSignInUrl({redirectUri:process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI!, maxAge:0,
    ...(returnTo === null ? {} : {returnTo:safeHubReturnTo(returnTo)})}));
}
