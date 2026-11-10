import { withAuth } from '@workos-inc/authkit-nextjs';
import { workosConfigured } from '@/lib/workos-config.mjs';
export async function GET() {
  const headers = {'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'};
  if (!workosConfigured()) return Response.json({configured:false,user:null}, {headers});
  try {
    const {user, impersonator} = await withAuth();
    if (impersonator || !user || !/^user_[A-Za-z0-9]+$/.test(user.id)) {
      return Response.json({configured:true,user:null}, {headers});
    }
    // Keep the avatar request on GitHub and discard provider-supplied query strings.
    const avatar = /^https:\/\/avatars\.githubusercontent\.com\/u\/([1-9][0-9]*)(?:\?|$)/.exec(user.profilePictureUrl ?? '');
    return Response.json({configured:true,user:{id:user.id,avatarId:avatar?.[1] ?? null}}, {headers});
  } catch { return Response.json({error:'Session unavailable'}, {status:503,headers}); }
}
