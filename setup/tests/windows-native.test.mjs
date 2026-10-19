import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script = fileURLToPath(new URL('../Setup.ps1', import.meta.url));
const source = readFileSync(script, 'utf8');
const portable = fileURLToPath(new URL('../../.verification/calm-windows-setup/powershell/runtime/pwsh', import.meta.url));
const pwsh = process.env.ZERO_TEST_PWSH || (existsSync(portable) ? portable : null);

test('Windows native requests are explicit and validated before any probes', () => {
  assert.match(source, /param\([\s\S]*\$NativeCheck[\s\S]*\$NativeExtension[\s\S]*\$Approved[\s\S]*\$NativeOpen/);
  assert.ok(source.indexOf('$nativeCount -ne 1') < source.indexOf('function Find-Code'));
  const native = source.slice(source.indexOf('function Invoke-NativeAction'), source.indexOf('try {\n    if ($nativeCount'));
  assert.doesNotMatch(native, /winget|Read-Host|Start-Process|ExecutionPolicy|--force/);
  assert.match(native, /Find-Kit; Find-Code; Find-Extensions[\s\S]*--install-extension/);
  assert.match(native, /if \(\$NativeOpen\) \{\s*Show-Check\s*if \(-not \(Is-Ready\)\)/);
  assert.match(native, /Invoke-Code @\('--new-window'\)/);
  assert.match(source, /RedirectStandardInput = \$true[\s\S]*StandardInput.Close\(\)/);
  assert.match(source, /ReadAsync[\s\S]*262144/);
  assert.match(source, /WaitAll[\s\S]*2000/);
  assert.match(source, /\$script:Vsix = Join-Path \$KitDir "zero-\$KitVersion.vsix"/);
});
test('Windows production launcher uses automatic preparation and authenticated explicit updates', () => {
  const ui = readFileSync(new URL('../../native-installer/windows/MainForm.cs', import.meta.url), 'utf8');
  const backend = readFileSync(new URL('../../native-installer/windows/NativeSetupBackend.cs', import.meta.url), 'utf8');
  const program = readFileSync(new URL('../../native-installer/windows/Program.cs', import.meta.url), 'utf8');
  assert.match(ui, /AutomaticSetupController/);
  assert.match(ui, /Hide\(\)[\s\S]*updates.IsDue/);
  assert.match(ui, /controller.Busy[\s\S]*updates.ApplyPending/);
  assert.doesNotMatch(ui, /ProfileStep|Import Profile|Open download page/);
  assert.doesNotMatch(backend, /PowerShell|NativeInfo|Process.Start/);
  assert.match(backend, /runtime.Prepare/);
  assert.match(backend, /runtime.Open\(File.Exists\(marker\)/);
  assert.ok(program.indexOf('SetAutoApplyOnStartup(false).Run()') < program.indexOf('Application.EnableVisualStyles()'));
});
test('PowerShell parser and mocked native workflow (portable PowerShell; not Windows 5.1)', {skip: !pwsh}, () => {
  const result = spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./windows-native-fakes.ps1', import.meta.url)), '-Source', script], {encoding: 'utf8', timeout: 20000});
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Windows PowerShell mocked backend: \d+ checks passed/);
});

test('manual and native Windows editor opens omit starter and carry kit location', () => {
  assert.doesNotMatch(source, /Invoke-Code @\('[^\n]*\$Starter/);
  assert.match(source, /\$info.EnvironmentVariables\['ZERO_KIT_DIR'\] = \$KitDir/);
  assert.match(source, /7 Open Zero/);
});
