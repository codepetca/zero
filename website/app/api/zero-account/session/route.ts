import { withAuth } from '@workos-inc/authkit-nextjs';
import { workosConfigured } from '@/lib/workos-config.mjs';
export async function GET() {
  const headers = {'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'};
  if (!workosConfigured()) return Response.json({configured:false,user:null}, {headers});
  try {
    const {user, impersonator} = await withAuth();
    const id = !impersonator && /^user_[A-Za-z0-9]+$/.test(user?.id || '') ? user!.id : null;
    return Response.json({configured:true,user:id ? {id} : null}, {headers});
  } catch { return Response.json({error:'Session unavailable'}, {status:503,headers}); }
}
