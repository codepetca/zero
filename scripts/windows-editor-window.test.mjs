import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';

test('editor GUI proof rejects CLI/hidden/stale/unrelated processes and resets its stability window', {skip: process.platform !== 'win32' && !process.env.ZERO_TEST_PWSH}, () => {
  const shell = process.env.ZERO_TEST_PWSH || 'powershell.exe';
  const script = fileURLToPath(new URL('./windows-editor-window.test.ps1', import.meta.url));
  const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-File', script], {encoding:'utf8',timeout:30000});
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
});
test('Windows CI exercises current MSIX first-run and both PowerShell regression suites without a transient upgrade artifact gate', () => {
  const workflow = readFileSync(new URL('../.github/workflows/windows-native.yml',import.meta.url),'utf8');
  assert.match(workflow,/test-windows-msix\.ps1[^\n]+-RunFirstRun/);
  assert.match(workflow,/node --test[^\n]+scripts\/windows-wack-report\.test\.mjs[^\n]+scripts\/windows-editor-window\.test\.mjs/);
  assert.equal(existsSync(new URL('../.github/workflows/store-upgrade-test.yml',import.meta.url)),false);
  for (const file of ['test-msix-first-run.ps1','test-windows-msix-upgrade.ps1']) {
    const script=readFileSync(new URL(file,import.meta.url),'utf8');
    assert.match(script,/\. \(Join-Path \$PSScriptRoot 'windows-editor-window\.ps1'\)/);
    assert.match(script,/Get-ZeroEditorWindowProof -State/);
  }
});
