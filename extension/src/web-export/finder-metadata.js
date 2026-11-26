'use strict';

function isFinderMetadataResource(name) {
  return /^(?:libraries\/[^/]+\/)?src\/main\/resources\//.test(name) &&
    name.split('/').at(-1) === '.DS_Store';
}

module.exports = { isFinderMetadataResource };
