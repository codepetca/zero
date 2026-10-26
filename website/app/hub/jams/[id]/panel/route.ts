import {getJamResponse} from '@/lib/jams-http.mjs';
import {authorizeJamRequest} from '@/lib/jams-access.mjs';
import {jamOfficialOrigin} from '@/lib/jams-pilot-policy.mjs';
export const dynamic='force-dynamic';
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  const hidden=authorizeJamRequest(_request);
  const officialOrigin=jamOfficialOrigin();
  if(hidden) {
    if(hidden.status===404)return hidden;
    // No event lookup or params resolution: cross-site Lax cookies may be absent.
    const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Invited ZeroJams pilot</title><p>Open the official pilot page and sign in with your invited GitHub account.</p><a href="${escape(officialOrigin)}/hub/jams" target="_blank" rel="noopener noreferrer">Open official pilot page</a></html>`;
    return new Response(html,{status:hidden.status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex','Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",'Referrer-Policy':'no-referrer'}});
  }
  const {id}=await context.params;
  let title='Official ZeroJam status',status='This jam is unavailable. Open Zero to check its status.',origin='',code=503;
  if(/^jam-[1-9][0-9]*$/.test(id)) {
    try {
      // Deliberately construct a fresh request: never forward Cookie or session headers.
      const response=await getJamResponse(new Request(`${officialOrigin}/api/jams/${id}`),id);
      const data=await response.json();code=response.status;
      if(response.ok&&data.configured&&data.event?.revision) {
        const event=data.event,url=new URL(event.websiteUrl);
        if(url.protocol==='https:')origin=url.origin;
        title=event.title;
        status=`${event.moderation?.status==='suspended'?'Suspended':event.moderation?.status==='cancelled'?'Cancelled':'Approved'} · ${event.registrationOpen?'Registration open':'Registration closed'} · ${event.submissionsOpen?'Submissions open':'Submissions closed'} · ${event.participantCount} participants`;
      }
    }catch{/* A public unavailable panel remains useful without exposing operational errors. */}
  }else code=404;
  const href=/^jam-[1-9][0-9]*$/.test(id)?`${officialOrigin}/hub/jams/${id}`:`${officialOrigin}/hub/jams`;
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;padding:20px;background:light-dark(#faf9fc,#19171e);color:light-dark(#23202b,#f1edf8);font:16px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}h1{font-size:22px;margin:0 0 12px}a{color:light-dark(#6540a6,#c2a3ff);display:inline-flex;align-items:center;min-height:44px;margin-right:16px}a:focus-visible{outline:3px solid currentColor;outline-offset:3px}</style></head><body><main id="page-content"><h1>${escape(title)}</h1><p>${escape(status)}</p><a href="${href}" target="_blank" rel="noopener noreferrer">Official details and entries</a><a href="${href}/participate" target="_blank" rel="noopener noreferrer">Review rules and take part on Zero</a><p>Sign in and confirm actions directly on Zero. If a new tab is blocked, open either link directly.</p></main></body></html>`;
  return new Response(html,{status:code,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'${origin?' '+origin:''}`,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
