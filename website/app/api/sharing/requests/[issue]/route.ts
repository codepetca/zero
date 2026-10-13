import {parseIssue, readRequestResults} from '@/lib/sharing-requests.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: {params:Promise<{issue:string}>}) {
  const {issue} = await context.params;
  try {parseIssue(issue);} catch {
    return Response.json({error:'Enter an official GitHub issue URL or a positive issue number.'},{status:400,headers:{'Cache-Control':'no-store'}});
  }
  try {
    return Response.json(await readRequestResults(issue,{signal:request.signal}),{headers:{'Cache-Control':'no-store'}});
  } catch {
    return Response.json({error:'Request results are unavailable. Try again shortly, or view your official GitHub issue.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
