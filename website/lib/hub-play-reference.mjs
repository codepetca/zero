// A reference selects a publication. Every use resolves trusted current records
// and checks authority again. Knowing or replaying the digest grants no access.
import {createHash} from 'node:crypto';
import {maintainedPlayLink, playLink} from './sharing-client.mjs';
import {canonicalPagesUrl} from './hub-project-status.mjs';

export function projectPlayRef(lane, record) {
  let id, fields;
  if (lane === 'listing') {
    if (!record.pagesUrl || canonicalPagesUrl(record.repositoryUrl) !== record.pagesUrl) return;
    id = record.repositoryId;
    fields = [record.accountId, record.repositoryUrl, record.pagesUrl, record.commit, String(record.runId)];
  } else if (lane === 'maintained') {
    if (!maintainedPlayLink(record)) return;
    id = record.id;
    fields = [record.repositoryId, record.ownerId, record.repositoryUrl, record.sourceCommit, record.web.url, record.web.runId];
  } else if (lane === 'release') {
    if (!playLink(record)) return;
    id = record.id;
    fields = [record.version, record.repository.id, record.repository.ownerId, record.repository.url,
      record.source.commit, record.source.folder, record.web.url, record.web.runId];
  } else return;
  const digest = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  return `1.${lane}.${id}.${digest}${lane === 'listing' ? '.' + record.runId : ''}`;
}
