import {loginResponse} from '@/lib/desktop-github-auth.mjs';
import {desktopGitHubBrowserPage} from '@/lib/desktop-github-browser-page.mjs';
import connectionPages from '@/.generated/desktop-connection-pages.json';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return desktopGitHubBrowserPage(request, loginResponse(request), connectionPages);
}
