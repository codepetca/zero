import {copyFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {zipSync} from 'fflate';
import {starterMembers} from './kit.mjs';
import {root} from './release.mjs';
import {extractProject, maven} from './verification-project.mjs';

const project = extractProject(zipSync(starterMembers(root)), 'zero-starter', tmpdir());
try {
  copyFileSync(path.join(root, 'framework/checks/zero/SmokeLauncher.java'), path.join(project, 'src/main/java/zero/SmokeLauncher.java'));
  const result = maven(project, ['-q', '-Dapp.mainClass=zero.SmokeLauncher', 'clean', 'compile', 'javafx:run']);
  if (!result.stdout.includes('ZERO_SMOKE_OK')) throw new Error(result.stdout + '\n' + result.stderr);
  console.log('ZERO_SMOKE_OK: finite native framework behavior in a standalone assembled project.');
} finally {rmSync(project, {recursive:true, force:true});}
