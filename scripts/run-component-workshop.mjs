import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {processSpecification} from './workshop-process.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const spec = JSON.parse(await readFile(path.join(root,'.verification/component-workshop-run.json'),'utf8'));
const expected = path.join(root,'student-template',process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw');
if (spec.command !== expected || spec.cwd !== root || !Array.isArray(spec.args) ||
    spec.args.at(-1) !== 'javafx:run') throw new Error('Prepare the workshop with the documented script first.');
const safeSpec = processSpecification(spec.command,spec.args);
const processHandle = spawn(safeSpec.command,safeSpec.args,{cwd:root,stdio:'inherit'});
processHandle.on('error',error => {console.error(error.message);process.exitCode=1;});
processHandle.on('exit',code => {process.exitCode=code ?? 1;});
