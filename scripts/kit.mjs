import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {prepareStarter} from './prepare-starter.mjs';

export function starterMembers(root, prefix = 'zero-starter') {
  prepareStarter(root);
  const members = {};
  function collect(directory, relative = '') {
    for (const entry of readdirSync(directory, {withFileTypes:true})) {
      if (['target', '.git', '.DS_Store', 'node_modules', '__pycache__'].includes(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error(`No symlinks in starter: ${entry.name}`);
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(filename, name);
      else if (entry.isFile()) members[`${prefix}/${name}`] = [new Uint8Array(readFileSync(filename)), {
        os:3, attrs:((entry.name === 'mvnw' ? 0o100755 : 0o100644) << 16) >>> 0
      }];
    }
  }
  collect(path.join(root, 'student-template'));
  return members;
}
