'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const core = require('./core');

class TrackingError extends Error {}
function refuse(message) { throw new TrackingError(message); }
const oid = value => typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value);

async function noUrlRewrites(root, run) {
  let keys;
  try { keys = await run(root, ['config', '--name-only', '--get-regexp', '^url\\.']); }
  catch (error) { if (error.code === 1) return; throw error; }
  if (keys.split('\n').some(key => /\.(?:insteadof|pushinsteadof)$/i.test(key))) {
    refuse('Git URL rewriting prevents refreshing the local tracking reference.');
  }
}
async function completeHistory(root, run) {
  let partial;
  try { partial = await run(root, ['config', '--get-regexp', '^(extensions\\.partialclone|remote\\..*\\.promisor)$']); }
  catch (error) { if (error.code === 1) return; throw error; }
  // Older supported Git versions cannot reliably disable automatic lazy fetch.
  if (partial) refuse('Local tracking needs complete local Git history. Refresh this partial clone manually with Git.');
}
async function ordinaryRef(root, ref, run) {
  try {
    await run(root, ['symbolic-ref', '--quiet', ref]);
    refuse('The local tracking reference is symbolic. Refresh it manually with Git.');
  } catch (error) { if (error.code !== 1) throw error; }
}
async function readRef(root, ref, run) {
  await ordinaryRef(root, ref, run);
  try { return await run(root, ['rev-parse', '--verify', '--quiet', ref]); }
  catch (error) { if (error.code === 1) return null; throw error; }
}

// Only call after the guarded transport has confirmed this exact remote SHA.
// This updates local SCM metadata only; it never contacts a remote or sets an upstream.
async function updateRemoteTracking(project, {remote, branch, head} = {}, {run = core.git} = {}) {
  try {
    if (!oid(head) || typeof branch !== 'string' || !branch || branch.startsWith('-')) {
      refuse('The confirmed branch or commit is invalid for local Git tracking.');
    }
    head = head.toLowerCase();
    const canonical = core.parseRepositoryUrl(remote).remote;
    if (remote !== canonical) refuse('Use the reviewed canonical GitHub repository for local tracking.');
    const root = await fs.realpath(project);
    const ref = `refs/remotes/origin/${branch}`;
    await run(root, ['check-ref-format', `refs/heads/${branch}`]);
    await run(root, ['check-ref-format', ref]);
    const gitDir = await run(root, ['rev-parse', '--absolute-git-dir']);
    async function guard() {
      if (await fs.realpath(project) !== root || await core.repositoryRoot(root, run) !== root ||
          await run(root, ['rev-parse', '--absolute-git-dir']) !== gitDir) {
        refuse('The project repository changed before local Git tracking could refresh.');
      }
      await noUrlRewrites(root, run);
      await completeHistory(root, run);
      const fetch = (await run(root, ['remote', 'get-url', '--all', 'origin'])).split('\n');
      const push = (await run(root, ['remote', 'get-url', '--push', '--all', 'origin'])).split('\n');
      if (fetch.length !== 1 || push.length !== 1 ||
          core.parseRepositoryUrl(fetch[0]).remote !== canonical || core.parseRepositoryUrl(push[0]).remote !== canonical) {
        refuse('Origin changed before local Git tracking could refresh.');
      }
    }
    await guard();
    if (await run(root, ['--no-replace-objects', 'cat-file', '-t', head]) !== 'commit') refuse('The confirmed Git object is not a commit.');
    const previous = await readRef(root, ref, run);
    if (previous !== null && (!oid(previous) || previous.length !== head.length)) {
      refuse('The local Git tracking reference is invalid.');
    }
    if (previous && previous !== head) {
      try { await run(root, ['--no-replace-objects', 'merge-base', '--is-ancestor', previous, head]); }
      catch (error) {
        if (error.code === 1) refuse('The local tracking reference has newer or different changes. Refresh it manually with Git.');
        throw error;
      }
    }
    await guard();
    await ordinaryRef(root, ref, run);
    // Git 2.31 has no atomic symbolic-ref type comparison. Refuse observed
    // symbolic refs, never follow one at write time, and CAS ordinary OID moves.
    // Configuration can also change after the final read; never rewrite it here.
    await run(root, ['-c', `core.hooksPath=${os.devNull}`, 'update-ref', '--no-deref', ref, head, previous || '0'.repeat(head.length)]);
    return {updated: previous !== head, ref, head};
  } catch (error) {
    if (error instanceof TrackingError) throw new Error(error.message);
    // Raw Git errors can contain private configuration and credential output.
    throw new Error('Could not refresh local Git tracking. Use Git Fetch to refresh the source control counts.');
  }
}

module.exports = {updateRemoteTracking};
