import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {setTimeout as sleep} from 'node:timers/promises';

const {ZERO_JAM_PAGE:pageUrl,ZERO_JAM_ID:id,ZERO_JAM_TITLE:title,ZERO_JAM_RULES:rules,ZERO_JAM_EDITOR_PORT:editorPort,ZERO_JAM_CHROME_PORT:chromePort} = process.env;
assert.match(id ?? '', /^jam-(?:[1-9][0-9]{0,19}|zero-[a-f0-9]{32})$/);
assert.ok(title && rules && pageUrl && editorPort && chromePort);
const editor = await chromium.connectOverCDP(`http://127.0.0.1:${editorPort}`);
const chrome = await chromium.connectOverCDP(`http://127.0.0.1:${chromePort}`);
const normalize = value => value.replace(/\s+/gu,' ').trim();
// Electron may expose its webviews as separate CDP targets rather than child
// frames. The browser link itself is still clicked through browser input.
async function evaluateWebview(target,expression) {
  const socket=new WebSocket(target.webSocketDebuggerUrl);
  try {
    return await Promise.race([sleep(1800).then(()=>null),new Promise((resolve,reject)=>{
      socket.onopen=()=>socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));
      socket.onmessage=event=>{
        const message=JSON.parse(event.data);
        if (message.id===1) resolve(message.result?.result?.value??null);
      };
      socket.onerror=reject;
    })]);
  } finally {socket.close();}
}

async function checkElectronWebview() {
  const targets=await fetch(`http://127.0.0.1:${editorPort}/json/list`,{signal:AbortSignal.timeout(2500)}).then(res=>res.json()).catch(()=>[]);
  for (const target of targets.filter(tab=>tab.type==='iframe' && tab.url.startsWith('vscode-webview:') && tab.webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${editorPort}/`))) {
    const state=await evaluateWebview(target,`(() => {
      const doc=document.getElementById('active-frame')?.contentDocument;
      const setup=doc?.getElementById('first-launch');
      if (setup && !setup.hidden) {
        const reports=doc.getElementById('automatic-reports');
        if(reports.checked) reports.click();
        const start=doc.getElementById('start-building');
        if(!start.disabled) start.click();
        return null;
      }
      const card=doc?.getElementById('jam-review');
      const full=doc?.getElementById('jam-full-rules');
      if(!card || card.hidden || !full || full.hidden) return null;
      if(!full.open) full.querySelector('summary').click();
      return {title:doc.getElementById('jam-title').textContent,rules:doc.getElementById('jam-full-rules-text').innerText};
    })()`).catch(()=>null);
    if (!state || normalize(state.title)!==normalize(title)) continue;
    assert.equal(normalize(state.rules),normalize(rules),'live rules mismatch');
    await evaluateWebview(target,`document.getElementById('active-frame').contentDocument.getElementById('dismiss-jam').click()`);
    for(let i=0;i<12;i++) {
      if (await evaluateWebview(target,`document.getElementById('active-frame').contentDocument.getElementById('jam-review').hidden`)) return true;
      await sleep(200);
    }
    throw new Error('Cancel joining did not dismiss the review.');
  }
  return false;
}
try {
  const browserPage = chrome.contexts()[0].pages()[0] ?? await chrome.contexts()[0].newPage();
  await browserPage.goto(pageUrl,{waitUntil:'domcontentloaded',timeout:30000});
  // A real input click on the page, never a direct protocol invocation.
  const link = browserPage.getByRole('link',{name:'Open in Zero',exact:true});
  await link.waitFor({state:'visible',timeout:30000});
  assert.equal(await link.getAttribute('href'),`zero-studio://jam/${id}`);
  await link.click({timeout:15000});
  const deadline = Date.now()+120000;
  let passed = false;
  while (Date.now()<deadline && !passed) {
    for (const context of editor.contexts()) for (const page of context.pages()) {
      // VS Code's protocol confirmation is a workbench dialog; it follows the
      // real browser click. Never accept sign-in or a registration action.
      const dialog=page.locator('[role=dialog], [role=alertdialog]').filter({hasText:/Allow ['‘]Zero['’] extension to open this URI/i});
      if (await dialog.count()) {
        const open=dialog.first().getByRole('button',{name:/^(open|open uri|open link)$/i});
        if (await open.count() && await open.first().isVisible()) await open.first().click();
      }
      for (const frame of page.frames()) {
        try {
          const setup=frame.locator('#first-launch');
          if (await setup.count() && await setup.isVisible()) {
            const reports=frame.locator('#automatic-reports');
            if (await reports.isChecked()) await reports.uncheck();
            const start=frame.locator('#start-building');
            if (await start.isEnabled()) await start.click();
          }
          const heading=frame.locator('#jam-title');
          if (!(await heading.count()) || !(await heading.isVisible()) || normalize(await heading.innerText())!==normalize(title)) continue;
          const full=frame.locator('#jam-full-rules');
          if (!(await full.isVisible())) continue;
          if (!(await full.evaluate(element=>element.open))) await full.locator('summary').click();
          assert.equal(normalize(await frame.locator('#jam-full-rules-text').innerText()),normalize(rules),'live rules mismatch');
          assert.equal(await frame.locator('#jam-review').isVisible(),true);
          await frame.getByRole('button',{name:'Cancel joining',exact:true}).click();
          await frame.locator('#jam-review').waitFor({state:'hidden',timeout:5000});
          passed=true; break;
        } catch (error) { if (error.code === 'ERR_ASSERTION') throw error; }
      }
    }
    if (!passed) passed=await checkElectronWebview();
    if (!passed) await sleep(500);
  }
  assert.ok(passed,'Linked Game Jam review did not become visible in the installed editor');
  console.log('Browser protocol click, exact live rules and dismissal verified.');
} finally { await chrome.close(); await editor.close(); }
