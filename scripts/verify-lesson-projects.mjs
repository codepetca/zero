import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {lessonProjects} from './lesson-projects.mjs';

// Compile generated source sets, not the reference shelf. No Git, GUI execution,
// credentials or student files. All writes belong to this new temporary folder.
const directory = mkdtempSync(path.join(tmpdir(),'zero-lesson-builds-'));
try {
  for (const project of lessonProjects().projects) {
    const destination = path.join(directory,project.folder); mkdirSync(destination);
    for (const file of project.files) {
      const filename = path.join(destination,file.path); mkdirSync(path.dirname(filename),{recursive:true});
      writeFileSync(filename,Buffer.from(file.content,'base64'),{mode:file.mode});
    }
    const result = spawnSync(path.join(destination,process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw'),['-q','compile'],{cwd:destination,encoding:'utf8',timeout:180000,shell:process.platform === 'win32'});
    if (result.status !== 0) throw new Error(`Lesson ${project.id} did not compile: ${result.error?.message || ''}\n${result.stdout}\n${result.stderr}`);
    console.log(`Lesson ${project.id}: generated project compiled.`);
  }
} finally {rmSync(directory,{recursive:true,force:true});}
