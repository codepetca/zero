import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareUiPrototypes} from './prepare-ui-prototypes.mjs';
import {maven} from './verification-project.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const results = [];
for (const project of prepareUiPrototypes()) {
  const harness = path.join(project.directory, 'src/main/java/PrototypeCheck.java');
  if (existsSync(harness)) throw new Error(`Preserved pre-existing verification harness: ${harness}`);
  const log = path.join(project.directory, 'native-check.log');
  try {
    const checkId = project.id === 'beginner-coin-game' ? 'coin-game' : project.id;
    writeFileSync(harness, readFileSync(path.join(root, 'framework/prototypes/checks', checkId, 'PrototypeCheck.java')));
    const result = maven(project.directory, ['-o', '-q', '-Dapp.mainClass=PrototypeCheck', 'clean', 'compile', 'javafx:run'], 60000);
    writeFileSync(log, result.stdout + '\n' + result.stderr);
    const marker = project.id === 'counter' ? 'ZERO_COUNTER_PROTOTYPE_OK' : 'ZERO_COIN_PROTOTYPE_OK';
    if (!result.stdout.includes(marker)) throw new Error(`Missing native acceptance marker: ${marker}`);
    results.push({id: project.id, status: 'passed', marker, log});
    console.log(result.stdout.trim());
  } catch (error) {
    writeFileSync(log, String(error.stack || error));
    throw error;
  } finally {
    rmSync(harness, {force: true});
  }
}
writeFileSync(path.join(root, '.verification/ui-prototypes/native-results.json'), JSON.stringify({
  status: 'passed', platform: process.platform, architecture: process.arch, checkedAt: new Date().toISOString(),
  input: 'Native JavaFX windows and event handlers; synthetic Button.fire and canvas mouse-move events; real animation frames.', results,
}, null, 2) + '\n');
console.log('ZERO_UI_PROTOTYPES_OK standalone native counter and both coin-game versions.');
