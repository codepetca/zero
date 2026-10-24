import {lstatSync, readdirSync, readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import snapshot from '../extension/src/web-export/snapshot.js';

/** Copy only the producer's explicit closure into a deliberately minimal fixture. */
export function copyProjectBuilderFixture(destination, sourceRoot) {
  if (!sourceRoot) throw new Error('Choose the explicit canonical fixture source root.');
  function copy(name) {
    const source = path.join(sourceRoot,name), stat = lstatSync(source);
    if (stat.isSymbolicLink()) throw new Error('Builder fixtures refuse source links: ' + name);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(source)) copy(name + '/' + entry);
    } else if (stat.isFile()) {
      const target = path.join(destination,name);
      mkdirSync(path.dirname(target),{recursive:true}); writeFileSync(target,readFileSync(source));
    } else throw new Error('Builder fixtures require ordinary files: ' + name);
  }
  for (const name of ['extension/src/web-export','framework/project-builder',
    ...snapshot.browserExternalFiles.map(name => 'extension/src/' + name),
    'release/sharing.json','student-template/pom.xml']) copy(name);
}
