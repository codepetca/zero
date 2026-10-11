import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, rmSync} from 'node:fs';

export const developerIdRequirement = 'anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists';

export function installerOptions(args, mode, host = process.platform) {
  let platform = 'all', identity = null, signed = false, selected = false;
  const usage = `Usage: node scripts/${mode}-installers.mjs [--platform macos|windows|all] ${mode === 'build' ? '[--sign-identity <40-hex SHA1>]' : '[--signed]'}`;
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (option === '--platform' && !selected) {
      selected = true; platform = args[++index];
      if (!['macos', 'windows', 'all'].includes(platform)) throw new Error(usage);
    } else if (mode === 'build' && option === '--sign-identity' && identity === null) {
      identity = args[++index];
      if (!/^[a-f0-9]{40}$/i.test(identity || '')) throw new Error(usage);
      identity = identity.toUpperCase(); signed = true;
    } else if (mode === 'verify' && option === '--signed' && !signed) signed = true;
    else throw new Error(usage);
  }
  if (signed && (platform !== 'macos' || host !== 'darwin')) throw new Error('Signed mode requires explicit --platform macos on macOS');
  return {platform, identity, signed};
}

export function installerPlist(template, version, signed) {
  for (const token of ['__KIT_VERSION__', '__BUNDLE_IDENTIFIER__', '__DEVELOPMENT_BUILD__']) assert.ok(template.includes(token), `Native plist must use ${token}`);
  return template.replaceAll('__KIT_VERSION__', version)
    .replaceAll('__BUNDLE_IDENTIFIER__', signed ? 'ca.codepet.zero.setup' : 'ca.codepet.zero.setup.development')
    .replaceAll('__DEVELOPMENT_BUILD__', signed ? 'false' : 'true');
}

export function signMacArtifact(run, target, identity, app) {
  // Replace swiftc's ad-hoc signature only on this freshly created owned app.
  run('/usr/bin/codesign', [...(app ? ['--force', '--options', 'runtime'] : []), '--timestamp', '--sign', identity, target]);
}

// All signature evidence comes from the verified artifact, never a Keychain query.
// run returns separate stdout/stderr strings; certificate files are scoped to scratch.
export function verifyMacSignature(run, target, scratchPrefix, {app = false, identity, team} = {}) {
  run('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', '-R', `=${developerIdRequirement}`, target]);
  const architectures = app ? ['arm64', 'x86_64'] : [null];
  const evidence = [];
  for (const architecture of architectures) {
    const archArgs = architecture ? ['--arch', architecture] : [];
    const detail = run('/usr/bin/codesign', ['--display', '--verbose=4', ...archArgs, target]);
    const output = `${detail.stdout}\n${detail.stderr}`;
    const field = key => output.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1].trim();
    const teamIdentifier = field('TeamIdentifier'), authority = field('Authority'), timestamp = field('Timestamp');
    assert.match(teamIdentifier || '', /^[A-Z0-9]{10}$/, 'Developer ID team');
    assert.ok(authority?.startsWith('Developer ID Application: ') && authority.endsWith(`(${teamIdentifier})`), 'Developer ID Application authority');
    assert.ok(timestamp && timestamp !== 'none', 'Secure signing timestamp required');
    if (app) {
      assert.equal(field('Identifier'), 'ca.codepet.zero.setup', 'Signed app bundle identifier');
      assert.ok(/^CodeDirectory .*flags=0x[0-9a-f]+\([^\n]*\bruntime\b[^\n]*\)/mi.test(output), 'App hardened runtime required');
      const entitlements = run('/usr/bin/codesign', ['--display', '--entitlements', ':-', ...archArgs, target]);
      assert.equal(entitlements.stdout.trim(), '', 'App must not carry entitlements');
    }
    const prefix = `${scratchPrefix}-${architecture || 'dmg'}-`, certificate = `${prefix}0`;
    let identitySha1;
    try {
      run('/usr/bin/codesign', ['--display', ...archArgs, '--extract-certificates', prefix, target]);
      identitySha1 = createHash('sha1').update(readFileSync(certificate)).digest('hex').toUpperCase();
    } finally {
      // codesign extracts the leaf and its two issuer certificates.
      for (let index = 0; index < 3; index++) rmSync(`${prefix}${index}`, {force:true});
    }
    if (identity) assert.equal(identitySha1, identity, 'Artifact signer differs from requested identity');
    if (team) assert.equal(teamIdentifier, team, 'Artifact team differs from receipt');
    evidence.push({...(architecture ? {architecture} : {}), identitySha1, teamIdentifier, authority, timestamp});
  }
  for (const item of evidence) {
    assert.equal(item.identitySha1, evidence[0].identitySha1, 'Architecture signer mismatch');
    assert.equal(item.teamIdentifier, evidence[0].teamIdentifier, 'Architecture team mismatch');
    assert.equal(item.authority, evidence[0].authority, 'Architecture authority mismatch');
  }
  return app ? {architectures:evidence} : evidence[0];
}
