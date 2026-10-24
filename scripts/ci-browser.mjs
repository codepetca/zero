import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {lstatSync, statSync, realpathSync, readFileSync, writeFileSync, chmodSync, renameSync, rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
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
// Hosted setup-java links this one file to the runner's certificate store.
// Snapshot the same bytes before execution/evidence; keep strict identity
// traversal and reject every other unexpected link in the selected runtime.
export function normalizeCiJdkTrustStore(javaHome) {
  if (typeof javaHome !== 'string' || !path.isAbsolute(javaHome)) throw Error('CI needs an absolute selected JAVA_HOME.');
  const root = realpathSync(javaHome);
  for (const part of ['lib', 'lib/security']) {
    const stat = lstatSync(path.join(root, part));
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('CI JDK trust-store parent must be an ordinary directory.');
  }
  const filename = path.join(root, 'lib/security/cacerts'), original = lstatSync(filename);
  if (!original.isSymbolicLink()) {
    if (!original.isFile()) throw Error('CI JDK trust store must be a file.');
    return false;
  }
  const target = statSync(filename);
  if (!target.isFile()) throw Error('CI JDK trust-store target must be a file.');
  const bytes = readFileSync(filename), temporary = filename + '.zero-ci-' + randomUUID();
  try {
    writeFileSync(temporary, bytes, {flag:'wx', mode:0o600});
    const current = lstatSync(filename);
    if (!current.isSymbolicLink() || current.dev !== original.dev || current.ino !== original.ino || !readFileSync(filename).equals(bytes))
      throw Error('CI JDK trust store changed during preparation.');
    chmodSync(temporary, target.mode & 0o777);
    renameSync(temporary, filename); // Replace the link, never its original target.
    if (!readFileSync(filename).equals(bytes)) throw Error('CI JDK trust-store copy differs.');
    return true;
  } finally { rmSync(temporary, {force:true}); }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='prepare-jdk') {
    if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('JDK preparation is limited to disposable GitHub-hosted Linux runners.');
    console.log('CI JDK trust store: '+(normalizeCiJdkTrustStore(process.env.JAVA_HOME)?'linked certificate bytes copied unchanged':'already an ordinary file'));
  } else {
    const cliRequire=createRequire(require.resolve('@playwright/cli/package.json'));
    const {chromium}=cliRequire('playwright');
    await ensureBrowser({
      probe:async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try {console.log('CI Chrome '+browser.version());}finally {await browser.close();}},
      install:()=>{const result=spawnSync(process.execPath,[require.resolve('@playwright/cli/playwright-cli.js'),'install-browser','chrome','--with-deps'],{stdio:'inherit',timeout:600000});if(result.status!==0)throw new Error('Pinned Chrome installation failed.');}
    });
  }
}
