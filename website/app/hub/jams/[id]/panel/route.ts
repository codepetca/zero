import {getJamResponse} from '@/lib/jams-http.mjs';
import {gameJamAppLink} from '@/lib/game-jam-app-link.mjs';
import {hiddenJamsResponse} from '@/lib/jams-visibility.mjs';
export const dynamic='force-dynamic';
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  const hidden=hiddenJamsResponse();if(hidden)return hidden;
  const {id}=await context.params;
  const appLink=gameJamAppLink(id);
  let title='Official ZeroJam status',status='This jam is unavailable. Open Zero to check its status.',origin='',code=503,editorJoinRequired=false,joinFromZero=false;
  if(appLink) {
    try {
      // Deliberately construct a fresh request: never forward Cookie or session headers.
      const response=await getJamResponse(new Request(`https://zero.codepet.ca/api/jams/${id}`),id);
      const data=await response.json();code=response.status;
      if(response.ok&&data.configured&&data.event?.revision) {
        const event=data.event;
        if(event.websiteUrl) {const url=new URL(event.websiteUrl);if(url.protocol==='https:')origin=url.origin;}
        title=event.title;editorJoinRequired=data.editorGameJamJoinRequired===true;joinFromZero=editorJoinRequired&&event.registrationOpen===true;
        status=`${event.moderation?.status==='suspended'?'Suspended':event.moderation?.status==='cancelled'?'Cancelled':'Approved'} · ${event.registrationOpen?'Registration open':'Registration closed'} · ${event.submissionsOpen?'Submissions open':'Submissions closed'} · ${event.participantCount} participants`;
      }
    }catch{/* A public unavailable panel remains useful without exposing operational errors. */}
  }else code=404;
  const href=appLink?`https://zero.codepet.ca/hub/jams/${id}`:'https://zero.codepet.ca/hub/jams';
  const joinLinks=joinFromZero&&appLink
    ? `<a href="${appLink}">Open in Zero</a><a href="https://zero.codepet.ca/downloads" target="_blank" rel="noopener noreferrer">Download Zero</a><p>In Zero, choose this jam under <strong>Open Game Jams</strong> on the <strong>Start Page</strong>. In earlier versions, sign in and choose <strong>Project → Join a Game Jam</strong>.</p>`
    : editorJoinRequired?'':'<p>Sign in and confirm actions directly on Zero. If a new tab is blocked, open either link directly.</p>';
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;padding:20px;background:light-dark(#faf9fc,#19171e);color:light-dark(#23202b,#f1edf8);font:16px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}h1{font-size:22px;margin:0 0 12px}a{color:light-dark(#6540a6,#c2a3ff);display:inline-flex;align-items:center;min-height:44px;margin-right:16px}a:focus-visible{outline:3px solid currentColor;outline-offset:3px}</style></head><body><main id="page-content"><h1>${escape(title)}</h1><p>${escape(status)}</p><a href="${href}" target="_blank" rel="noopener noreferrer">Official details and entries</a><a href="${href}/participate" target="_blank" rel="noopener noreferrer">${editorJoinRequired?'Manage your entry':'Review rules and take part on Zero'}</a>${joinLinks}</main></body></html>`;
  return new Response(html,{status:code,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'${origin?' '+origin:''}`,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
