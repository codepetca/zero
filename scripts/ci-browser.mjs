import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url);

export async function ensureBrowser({probe,install,log=console.log}) {
  const started=performance.now();
  try {await probe();log(`CI browser: reused working Chrome (${Math.round(performance.now()-started)}ms)`);return 'reused';}
  catch {log('CI browser: Chrome unavailable or incompatible; installing through the pinned Playwright CLI.');}
  await install();
  await probe(); // A failed installation/launch must fail CI.
  log(`CI browser: cold installation verified (${Math.round(performance.now()-started)}ms)`);
  return 'installed';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const cliRequire=createRequire(require.resolve('@playwright/cli/package.json'));
  const {chromium}=cliRequire('playwright');
  await ensureBrowser({
    probe:async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try {console.log('CI Chrome '+browser.version());}finally {await browser.close();}},
    install:()=>{const result=spawnSync(process.execPath,[require.resolve('@playwright/cli/playwright-cli.js'),'install-browser','chrome','--with-deps'],{stdio:'inherit',timeout:600000});if(result.status!==0)throw new Error('Pinned Chrome installation failed.');}
  });
}
