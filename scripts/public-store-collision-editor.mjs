import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium} from 'playwright';
import {parse} from 'parse5';

const [action, project, directory] = process.argv.slice(2);
const namespace = 'zero.lib.r1471779330.collision_helper';
const id = 'lib-r1471779330-collision-helper';
const version = '0.2.0';

function nodes(root) {
  return [root, ...(root.childNodes ?? []).flatMap(nodes)];
}
function text(root) {
  return nodes(root).filter(node => node.nodeName === '#text').map(node => node.value).join('');
}
async function publicText(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(45000)});
  assert.equal(response.status, 200, url);
  return response.text();
}
if (action === 'lesson') {
  const page = parse(await publicText('https://zero.codepet.ca/tutorials/11'));
  const code = nodes(page)
    .filter(node => node.tagName === 'pre')
    .map(text)
    .find(fragment => fragment.includes(namespace));
  assert.ok(code);
  assert.match(text(page), /Optional extension: add Collision Helper/);
  const src = (await readFile('student-template/lessons/11-zerohub.md', 'utf8')).replace(/\r\n/g, '\n');
  const expected = src.match(/   ```java\n((?:.*\n)*?)   ```/g)
    .find(fragment => fragment.includes(namespace))
    .split('\n').slice(1,-1).map(line => line.slice(3)).join('\n') + '\n';
  assert.equal(code.trim(), expected.trim());
  await writeFile(join(directory, 'Main.java'), expected);
  const [sharePage, usePage] = await Promise.all([
    publicText('https://zero.codepet.ca/hub/share?view=library'),
    publicText('https://zero.codepet.ca/hub?kind=library&view=use'),
  ]);
  assert.match(text(parse(sharePage)), /Check request/);
  assert.match(text(parse(usePage)), /Browse libraries/);
  console.log('Production Lesson 11 and ZeroHub guides verified');
  process.exit(0);
}

const port = process.env.ZERO_PROOF_EDITOR_PORT;
assert.match(port ?? '', /^\d{4,5}$/);
const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, {timeout:15000});
try {
  const pages = browser.contexts().flatMap(context => context.pages());
  const page = pages.find(item => item.url().includes('workbench')) ?? pages.find(item => item.url().startsWith('vscode-file:'));
  assert.ok(page, 'Expected the standalone installed editor window');
  const quick = page.locator('.quick-input-widget');
  const command = async title => {
    await page.keyboard.press('Control+Shift+P');
    const input = quick.locator('input:visible').first();
    await input.waitFor({state:'visible',timeout:15000});
    await input.press('Control+A');
    await input.press('Backspace');
    await input.pressSequentially('>' + title, {delay:20});
    const item = quick.getByRole('option', {name:title})
      .or(quick.getByText(title, {exact:true})).first();
    try {
      await item.waitFor({state:'visible',timeout:20000});
    } catch (error) {
      console.log(JSON.stringify({command:title, query:await input.inputValue(),
        quickInput:(await quick.innerText()).slice(0,1200),
        dialogs:(await page.getByRole('dialog').allTextContents()).join(' ').slice(0,700)}));
      await page.screenshot({path:join(directory,'public-editor-command.png')});
      throw error;
    }
    await item.click();
  };
  const choose = async (title, timeout = 20000) => {
    const item = quick.getByText(title, {exact:true}).first();
    await item.waitFor({state:'visible',timeout});
    await item.click();
  };
  if (action === 'inspect') {
    console.log(JSON.stringify({url:page.url(),title:await page.title(),dialogs:await page.getByRole('dialog').allTextContents(),quick:await quick.locator('.quick-input-title').allTextContents(),notifications:await page.locator('.notification-list-item').allTextContents(),boxes:await page.locator('.monaco-dialog-box').allTextContents()}));
  } else if (action === 'add') {
    // The starter's exact Git tree was verified before opening the folder.
    const trust = page.getByRole('button', {name:/yes, i trust the authors/i}).first();
    const restricted = page.getByText('Restricted Mode is intended for safe code browsing.', {exact:false}).first();
    const needsTrust = await trust.or(restricted).first().waitFor({state:'visible',timeout:10000})
      .then(() => true, error => {
        if (error.name !== 'TimeoutError') throw error;
        return false;
      });
    if (needsTrust) {
      if (await trust.isVisible()) {
        await trust.click();
      } else {
        await page.getByRole('link', {name:'Manage',exact:true}).click();
        await page.getByRole('button', {name:'Trust',exact:true}).click();
      }
      await restricted.waitFor({state:'hidden',timeout:15000});
    }
    await command('Zero: Libraries and Games');
    await choose('Browse libraries');
    await choose('Collision Helper Pilot', 45000);
    await choose('Add library');
    const apply = page.getByRole('button', {name:'Apply',exact:true}).first();
    await apply.waitFor({state:'visible',timeout:20000});
    await page.screenshot({path:join(directory,'public-editor-add.png')});
    await apply.click();
    const storage = join(project,'zero-dependencies',id,version);
    const raw = await publicText('https://zero.codepet.ca/api/sharing/catalog/v3');
    const catalogs = JSON.parse(raw);
    const release = (catalogs.releases ?? catalogs.catalog?.releases).find(entry => entry.id === id && entry.version === version);
    assert.ok(release);
    assert.equal(release.namespace, namespace);
    for (let attempt = 0; attempt < 80; attempt++) {
      if ((await readFile(join(project, 'pom.xml'), 'utf8')).includes(id)) break;
      await sleep(250);
    }
    const pom = await readFile(join(project, 'pom.xml'), 'utf8');
    assert.match(pom, new RegExp(id));
    assert.match(pom, /<version>0\.2\.0<\/version>/);
    for (const [name, kind] of [['library.jar','jar'], ['sources.jar','sources'], ['library.pom','pom']]) {
      const hash = createHash('sha256').update(await readFile(join(storage,name))).digest('hex');
      assert.equal(hash, release.artifacts[kind].sha256);
    }
    await writeFile(join(project,'src/main/java/Main.java'), await readFile(join(directory,'Main.java')));
    console.log('Public editor added and saved the exact library. Three artifact hashes matched.');
  } else if (action === 'run') {
    await command('Zero: Run App');
  } else if (action === 'export') {
    await command('Zero: Export for Web');
  } else if (action === 'update-browser') {
    const update = page.getByRole('button', {name:'Update Browser Tools',exact:true}).first();
    const offered = await update.waitFor({state:'visible',timeout:7000}).then(() => true, (error) => {
      if (error.name !== 'TimeoutError') throw error;
      return false;
    });
    if (!offered) {
      console.log('No browser-tools update was offered');
      process.exit(0);
    }
    assert.match(await page.locator('.monaco-dialog-box').innerText(), /Replace this project’s \.zero-build/);
    await update.click();
    console.log('Approved Zero’s browser tools update in the exercise project');
  } else if (action === 'preview') {
    await command('Zero: Preview Web Export');
  } else if (action === 'stop') {
    await command('Zero: Stop App');
  } else {
    throw Error('Unknown verification action');
  }
} finally {
  process.exitCode ??= 0;
  // Leave the installed editor open for the next check.
  void browser.disconnect?.();
  setTimeout(() => process.exit(process.exitCode), 50).unref();
}
