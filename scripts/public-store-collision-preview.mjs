import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';

const [screenshot] = process.argv.slice(2);
const port = process.env.ZERO_PROOF_EDITOR_PORT;
assert.match(port ?? '', /^\d{4,5}$/);
const targets = async () => (await fetch('http://127.0.0.1:' + port + '/json/list')).json();

async function query(target, method, params) {
  const address = new URL(target.webSocketDebuggerUrl);
  assert.equal(address.hostname,'127.0.0.1');
  assert.equal(address.port,port);
  const socket = new WebSocket(address);
  const response = await new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(Error('Editor frame did not respond')),10000);
    socket.addEventListener('open',() => socket.send(JSON.stringify({id:1,method,params})),{once:true});
    socket.addEventListener('error',reject,{once:true});
    socket.addEventListener('message',event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      if (message.error) reject(Error(message.error.message));
      else resolve(message.result);
    });
  }).finally(() => socket.close());
  return response;
}

for (let count = 0; count < 60; count++) {
  const entries = await targets();
  const frame = entries.find(entry => entry.type === 'iframe' && entry.url.startsWith('http://127.0.0.1:') && entry.url.includes('zero-embedded-'));
  if (frame) {
    const result = await query(frame, 'Runtime.evaluate', {
      expression: `[...document.querySelectorAll('fx-text:not([aria-hidden=true])')].some(element =>
        element.textContent.trim()==='Collision Helper Pilot works' && element.getBoundingClientRect().width>0)`,
      returnByValue:true,
    });
    if (result.result.value) {
      const editor = entries.find(entry => entry.type==='page' && entry.title.includes('zero-collision-check'));
      assert.ok(editor);
      const image = await query(editor,'Page.captureScreenshot',{format:'png'});
      await writeFile(screenshot, Buffer.from(image.data,'base64'));
      console.log('Installed editor WebFX preview displayed Collision Helper Pilot works');
      process.exit(0);
    }
  }
  await sleep(1000);
}
throw Error('The installed editor browser preview did not display the exercise result');
