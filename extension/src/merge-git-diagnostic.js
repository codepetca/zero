'use strict';

// Local Git can echo config paths, remote URLs or output from external tools.
// Recognize Git's wording without copying paths, object IDs or other values.
const gitMessages = [
  [/^fatal: Needed a single revision/i, 'fatal: missing revision'],
  [/^fatal: unable to read tree\b/i, 'fatal: unable to read tree'],
  [/^fatal: bad (tree|object|revision)\b/i, 'fatal: bad $1'],
  [/^error: no such remote\b/i, '$&'],
  [/^fatal: (?:index file corrupt|index file smaller than expected|unable to read index file)$/i, '$&'],
  [/^fatal: (?:not a git repository|detected dubious ownership in repository)\b/i, '$&'],
  [/^fatal: (?:invalid object|loose object .* is corrupt|packed object .* is corrupt)\b/i, 'fatal: corrupt or invalid Git object'],
  [/^fatal: (?:cannot lock ref|unable to create .*\.lock)\b/i, 'fatal: Git could not lock a ref or index'],
  [/^fatal: (?:unable to )?auto-detect email address\b/i, 'fatal: unable to auto-detect email address'],
  [/^(?:Author|Committer) identity unknown$/i, '$&'],
  [/^(?:error|fatal): gpg failed to sign the data$/i, '$&'],
  [/^fatal: failed to write commit object$/i, '$&'],
  [/^fatal: bad config line \d+\b/i, 'fatal: bad config line'],
  [/^(?:error|fatal):.*\bPermission denied$/i, 'Permission denied']
];

function mergeGitDiagnostic(command, failure) {
  const label = /^[a-z][a-z-]*$/.test(command || '') ? `Git ${command}` : 'Git';
  if (failure.code === 'ENOENT') return `${label} could not start because an executable or directory was missing.`;
  if (failure.code === 'EACCES' || failure.code === 'EPERM') return `${label} could not start because permission was denied.`;
  if (failure.code === 'ZERO_GIT_SETUP_FAILED') return 'Zero could not prepare Git on this computer.';
  if (failure.killed) return `${label} was stopped before it completed.`;
  if (failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return `${label} produced too much output.`;

  const status = Number.isInteger(failure.code) ? ` (exit ${failure.code})` : '';
  const lines = typeof failure.stderr === 'string' ? failure.stderr.slice(0, 8192).split(/\r?\n/) : [];
  for (const line of lines) {
    for (const [pattern, message] of gitMessages) {
      const match = pattern.exec(line);
      if (match) return `${label} failed${status}. ${match[0].replace(pattern, message)}.`;
    }
  }
  return `${label} failed${status}.`;
}

module.exports = {mergeGitDiagnostic};
