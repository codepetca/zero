import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareUiPrototypes, parseUiPrototypeArgs} from './prepare-ui-prototypes.mjs';
import {maven} from './verification-project.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));

export function verifyUiPrototypes(root = repository, {only, run = maven} = {}) {
  const results = [];
  for (const project of prepareUiPrototypes(root, {only})) {
    const harness = path.join(project.directory, 'src/main/java/PrototypeCheck.java');
    if (existsSync(harness)) throw new Error(`Preserved pre-existing verification harness: ${harness}`);
    const log = path.join(project.directory, 'native-check.log');
    try {
      const checkId = project.id;
      writeFileSync(harness, readFileSync(path.join(root, 'framework/prototypes/checks', checkId, 'PrototypeCheck.java')));
      const result = run(project.directory, ['-o', '-q', '-Dapp.mainClass=PrototypeCheck', 'clean', 'compile', 'javafx:run'], 60000);
      writeFileSync(log, result.stdout + '\n' + result.stderr);
      const marker = project.id === 'simulation' ? 'ZERO_SIMULATION_PROTOTYPE_OK'
        : project.id === 'counter' ? 'ZERO_COUNTER_PROTOTYPE_OK'
        : project.id === 'actor-components' ? 'ZERO_ACTOR_COMPONENTS_PROTOTYPE_OK'
        : project.id === 'actor-containers' ? 'ZERO_ACTOR_CONTAINERS_PROTOTYPE_OK'
        : project.id === 'actor-stress' ? 'ZERO_ACTOR_STRESS_OK' : 'ZERO_COIN_PROTOTYPE_OK';
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
  const receipt = only ? 'native-results-' + [...only].sort().join('-') + '.json' : 'native-results.json';
  writeFileSync(path.join(root, '.verification/ui-prototypes', receipt), JSON.stringify({
    selection: only || 'all',
    status: 'passed', platform: process.platform, architecture: process.arch, checkedAt: new Date().toISOString(),
    input: 'Native JavaFX windows and event handlers, test-driver synthetic input and real animation frames; see each selected prototype log.', results,
  }, null, 2) + '\n');
  console.log('ZERO_UI_PROTOTYPES_OK native ' + results.map(result => result.id).join(', '));

  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyUiPrototypes(repository, {only: parseUiPrototypeArgs(process.argv.slice(2))});
}
