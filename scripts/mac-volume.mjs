import assert from 'node:assert/strict';
import {lstatSync, readdirSync, readFileSync, readlinkSync} from 'node:fs';
import path from 'node:path';
import {verifyMacIcon} from './mac-icon.mjs';
import {verifyMacDmgLayout} from './mac-dmg-layout.mjs';

export const macInstallInstructions = 'Install Zero\n\nDrag Zero.app to Applications. Then open Zero from Applications.\nYou can eject this disk after copying Zero.\n';
export const macDevelopmentNotice = '\nLocal development build: not Developer ID signed or notarized.\nNot ready for classroom distribution.\n';
export function verifyMacVolume(mount, identity, signed) {
  const names = readdirSync(mount).sort();
  if (identity.legacy) {
    assert.deepEqual(names, signed ? [identity.appName] : ['DEVELOPMENT-BUILD.txt', identity.appName]);
  } else {
    assert.deepEqual(names, (identity.styled ? ['.DS_Store', '.background', 'Applications', identity.appName] : ['Applications', 'INSTALL.txt', identity.appName]).sort(), 'Unexpected DMG contents');
    const applications = path.join(mount, 'Applications');
    assert.ok(lstatSync(applications).isSymbolicLink(), 'Applications must be a symlink');
    assert.equal(readlinkSync(applications), '/Applications', 'Applications link must target exactly /Applications');
    if (identity.styled) verifyMacDmgLayout(mount, identity.volumeName);
    else {
      const instruction = path.join(mount, 'INSTALL.txt');
      assert.ok(lstatSync(instruction).isFile() && !lstatSync(instruction).isSymbolicLink(), 'Owned instructions must be a regular file');
      assert.equal(readFileSync(instruction, 'utf8'), macInstallInstructions + (signed ? '' : macDevelopmentNotice));
    }
  }
  const app = path.join(mount, identity.appName);
  assert.ok(lstatSync(app).isDirectory() && !lstatSync(app).isSymbolicLink(), 'App bundle must be an owned directory');
  return app;
}
export function verifyMacPlist(plist, identity, version, signed, contents) {
  assert.equal(plist.CFBundleName, identity.displayName);
  assert.equal(plist.CFBundleDisplayName, identity.displayName);
  assert.equal(plist.CFBundleShortVersionString, version);
  assert.equal(plist.CFBundleExecutable, 'ZeroSetup');
  assert.equal(plist.CFBundleIdentifier, identity.bundleIdentifier);
  assert.equal(plist.ZeroDevelopmentBuild ?? true, !signed, 'Signed app requires explicit non-development marker');
  if (!identity.legacy) {
    assert.equal(plist.CFBundleIconFile, 'Zero.icns');
    const icon = path.join(contents, 'Resources/Zero.icns');
    assert.ok(lstatSync(icon).isFile() && !lstatSync(icon).isSymbolicLink(), 'App icon must be a regular file');
    verifyMacIcon(readFileSync(icon));
  }
}
