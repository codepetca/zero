import {copyFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {zipSync} from 'fflate';
import {starterMembers} from './kit.mjs';
import {root} from './release.mjs';
import {extractProject, maven} from './verification-project.mjs';

const project = extractProject(zipSync(starterMembers(root)), 'zero-starter', tmpdir());
try {
  for (const name of readdirSync(path.join(root, 'framework/checks/zero'))) {
    if (name.endsWith('.java')) copyFileSync(path.join(root, 'framework/checks/zero', name), path.join(project, 'src/main/java/zero', name));
  }
  const result = maven(project, ['-q', '-Dapp.mainClass=zero.SmokeLauncher', 'clean', 'compile', 'javafx:run']);
  if (!result.stdout.includes('ZERO_SMOKE_OK')) throw new Error(result.stdout + '\n' + result.stderr);
  const helpers = maven(project, ['-q', '-Dapp.mainClass=zero.GameHelpersCheck', 'compile', 'javafx:run']);
  if (!helpers.stdout.includes('ZERO_GAME_HELPERS_OK')) throw new Error(helpers.stdout + '\n' + helpers.stderr);
  console.log('ZERO_GAME_HELPERS_OK: finite native game helper checks.');
  console.log('ZERO_SMOKE_OK: finite native framework behavior in a standalone assembled project.');
} finally {rmSync(project, {recursive:true, force:true});}
