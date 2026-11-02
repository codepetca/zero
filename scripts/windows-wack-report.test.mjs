import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

test('WACK XML result requires an exact complete pass and successful process', {skip: process.platform !== 'win32' && !process.env.ZERO_TEST_PWSH}, () => {
  const shell = process.env.ZERO_TEST_PWSH || 'powershell.exe';
  const script = fileURLToPath(new URL('./windows-wack-report.test.ps1', import.meta.url));
  const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-File', script], {encoding: 'utf8'});
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
});
