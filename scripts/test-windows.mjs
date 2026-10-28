import {mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {root} from './release.mjs';

// Only disposable fixture files, fake vendor tools and ephemeral signing keys.
// On Windows this also exercises real filesystem locking and the Framework CLR.
const output = path.join(root, '.verification/windows-tests');
mkdirSync(output, {recursive:true});
const env = {...process.env, DOTNET_CLI_TELEMETRY_OPTOUT:'1', DOTNET_NOLOGO:'1'};
function run(command, args) {
  const result = spawnSync(command, args, {cwd:root,env,stdio:'inherit',timeout:180000});
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.status}`);
}
for (const name of ['WindowsHarness','WindowsUpdaterHarness','StoreFeasibilityHarness','StoreProductionHarness']) {
  const target = path.join(output,name);
  const project = name === 'StoreProductionHarness' ? 'StoreFeasibilityHarness' : name;
  run('dotnet',['build',path.join(root,`native-installer/windows/tests/${project}.csproj`),'-c','Release','-o',target,
    `-p:BaseIntermediateOutputPath=${path.join(target,'obj')}${path.sep}`,
    `-p:BaseOutputPath=${path.join(target,'bin')}${path.sep}`,
    `-p:RestorePackagesPath=${path.join(output,'nuget')}`, ...(name === 'StoreProductionHarness' ? ['-p:ZeroDistribution=Store'] : [])]);
  const executable = path.join(target,`${project}.exe`);
  if (process.platform === 'win32') run(executable,[]);
  else run('mono',[executable]);
}
