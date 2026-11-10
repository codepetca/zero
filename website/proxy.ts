import { authkitProxy } from '@workos-inc/authkit-nextjs';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { workosConfigured } from './lib/workos-config.mjs';

const authkit = authkitProxy();
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // The callback and sign-out routes own their session cookie writes. An
  // automatic refresh on either response could put an older session back.
  const path = request.nextUrl.pathname;
  return workosConfigured() && path !== '/zero-account/callback' && path !== '/zero-account/sign-out'
    ? authkit(request, event) : NextResponse.next();
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
