import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sealMacCandidate } from './mac-release.mjs';
import { verifyInstallerSource } from '../website/lib/local-installer.mjs';
function fixture(t) {const dir=mkdtempSync(join(tmpdir(),'zero-mac-release-')); t.after(() => rmSync(dir,{recursive:true,force:true})); return dir;}
function git(root,args) {const r=spawnSync('git',args,{cwd:root,encoding:'utf8'}); assert.equal(r.status,0,r.stderr); return r.stdout.trim();}
test('sealing preserves exact files and refuses any existing output', t => {
  const root=fixture(t), output=join(root,'candidate'), bytes=Buffer.from('exact reviewed bytes');
  sealMacCandidate(output, {'Zero.dmg':bytes,'candidate.json':'{}\n'});
  assert.deepEqual(readFileSync(join(output,'Zero.dmg')),bytes);
  assert.throws(() => sealMacCandidate(output, {'Zero.dmg':'replacement'}), /already exists/);
  const empty=join(root,'empty'); mkdirSync(empty); assert.throws(() => sealMacCandidate(empty,{}),/already exists/);
  assert.deepEqual(readFileSync(join(output,'Zero.dmg')),bytes);
});
test('source equivalence allows website/docs delivery but refuses dirty, runtime and untracked source', t => {
  const root=fixture(t); git(root,['init','-q']);
  mkdirSync(join(root,'native-installer/macos'),{recursive:true}); writeFileSync(join(root,'native-installer/macos/main.swift'),'original');
  git(root,['add','.']); git(root,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture']);
  const revision=git(root,['rev-parse','HEAD']);
  assert.equal(verifyInstallerSource(root,revision,{clean:true}).sourceEquivalent,true);
  writeFileSync(join(root,'notes.md'),'website handoff'); assert.throws(() => verifyInstallerSource(root,revision,{clean:true}),/clean committed/);
  git(root,['add','.']);git(root,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','docs']);
  assert.equal(verifyInstallerSource(root,revision,{clean:true}).sourceEquivalent,true);
  writeFileSync(join(root,'native-installer/macos/main.swift'),'changed'); assert.throws(() => verifyInstallerSource(root,revision),/differs/);
  writeFileSync(join(root,'native-installer/macos/main.swift'),'original'); writeFileSync(join(root,'native-installer/macos/new.swift'),'new'); assert.throws(() => verifyInstallerSource(root,revision),/Untracked/);
  assert.throws(() => verifyInstallerSource(root,'a'.repeat(40)));
});
