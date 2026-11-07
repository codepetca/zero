'use strict';

// This is selection evidence, not authority to write. Callers must bind it to
// a full project snapshot and revalidate that snapshot before any mutation.
function deletedFileSource(status, name) {
  if (typeof status !== 'string' || (status && !status.endsWith('\0')) ||
      typeof name !== 'string' || !name || name.startsWith('/') ||
      name.split('/').some(part => !part || part === '.' || part === '..') ||
      /[\x00-\x1f\x7f\\]/.test(name)) throw new Error('Cannot safely identify the deleted file.');
  const matches = [];
  for (const record of status.split('\0').filter(Boolean)) {
    if (record.length < 4 || record[2] !== ' ') throw new Error('Incomplete or unexpected Git status.');
    const code = record.slice(0, 2), filename = record.slice(3);
    if (!/^(?:\?\?|[ MADUT?!]{2})$/.test(code) || !filename || filename.startsWith('/') ||
        filename.split('/').some(part => !part || part === '.' || part === '..') ||
        /[\x00-\x1f\x7f\\]/.test(filename)) throw new Error('Incomplete or unexpected Git status.');
    if (filename === name) matches.push(code);
  }
  // A staged deletion with a recreated untracked file has two rows. Never
  // interpret that as permission to overwrite the recreated file.
  if (matches.length !== 1) throw new Error('The selected deletion changed or is ambiguous.');
  if ([' D', 'MD', 'AD'].includes(matches[0])) return 'index';
  if (matches[0] === 'D ') return 'head';
  throw new Error('The selected file is not a supported deletion.');
}

module.exports = {deletedFileSource};
