import { createHash } from 'node:crypto';
import contracts from '../extension/src/sharing/contracts.js';
import practice from '../extension/src/sharing/tutorial-practice.js';
import { canonical, digest, releaseKey, appendAttempt } from './registry.mjs';
import { byteHash } from './file-storage.mjs';
import { reportAttempt } from './requests.mjs';
import { validateAdoption } from './adoption.mjs';
import sourceDiagnostics from '../extension/src/sharing/source-diagnostics.js';

const artifactKinds = {library: ['jar', 'sources', 'pom', 'preview'], game: ['zip', 'preview']};
const stableRelease=release=>({...release,repository:{id:release.repository.id,ownerId:release.repository.ownerId},contributor:{githubId:release.contributor.githubId}});
function sameBinding(item, request) {
  return item.repositoryId === request.repository.id && item.contributorId === request.requester.githubId && item.folder === request.folder && item.kind === request.kind && item.slug === request.slug;
}
function currentOwner(request, metadata) {
  if (!metadata || metadata.id !== request.repository.id || metadata.ownerId !== request.requester.githubId || metadata.visibility !== 'public' || metadata.ownerType !== 'User') throw new Error('Repository ownership/visibility changed; deliberate migration required');
}

function changeAvailability(state, key, status) {
  if (state.releases[key]?.delivery !== 'ready') throw new Error('Only delivery-ready releases have public availability');
  const previous = state.availability.filter(event => event.key === key).at(-1);
  if (previous?.status !== status) state.availability.push({sequence:state.sequence + 1,key,status});
}

export class PublicationService {
  constructor({registry, storage, artifactOrigin, verifyEvidence, resolveRepositoryMetadata, publishCatalog, beforeAccept}) {
    if (!registry || !storage || typeof verifyEvidence !== 'function' || typeof resolveRepositoryMetadata !== 'function') throw new Error('Trusted registry, object store, evidence verifier and ownership resolver required');
    this.registry = registry; this.storage = storage; this.artifactOrigin = artifactOrigin;
    this.verifyEvidence = verifyEvidence; this.resolveRepositoryMetadata = resolveRepositoryMetadata;
    this.publishCatalog = publishCatalog;
    this.beforeAccept=beforeAccept;
  }
  async publish({requestId, evidence, artifacts, components, adoption}) {
    const record = (await this.registry.read()).state.requests[requestId];
    if (!record) throw new Error('Unknown request');
    if (record.status === 'cancelled') throw new Error('Request cancelled');
    if (record.releaseKey) return this.deliver(record.releaseKey);
    const request = record.frozen;
    if(adoption!==undefined){
      if(request.kind!=='game')throw new Error('Only game publications have adoption observations');
      adoption=validateAdoption(adoption);
    }
    if (!evidence || evidence.status !== 'passed' || evidence.requestFingerprint !== requestId || evidence.sourceDigest !== request.sourceDigest || evidence.commit !== request.commit || evidence.policyRevision !== request.policyRevision) throw new Error('Evidence is not bound to the frozen request/source/policy');
    if (await this.verifyEvidence(evidence, structuredClone(request)) !== true) throw new Error('Trusted managed evidence verification failed');
    if (canonical(evidence.web??null)!==canonical(request.web??null))throw new Error('Web publication is not bound to trusted evidence');
    if ((adoption===undefined?undefined:digest(adoption)) !== evidence.adoptionDigest) throw new Error('Adoption observation is not bound to trusted evidence');
    if (components && evidence.componentsDigest !== digest(components)) throw new Error('Generated component metadata is not bound to trusted evidence');
    if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) throw new Error('Trusted artifacts required');
    const ident = contracts.identity(request.kind, request.repository.id, request.slug);
    const required = request.kind === 'library' ? ['jar', 'sources', 'pom'] : ['zip'];
    if (required.some(kind => !artifacts[kind])) throw new Error('Required artifact missing');
    const manifest = {}, staged = {};
    for (const kind of Object.keys(artifacts).sort()) {
      if (!artifactKinds[request.kind].includes(kind)) throw new Error('Unknown artifact kind');
      const bytes = Buffer.from(artifacts[kind]);
      const maximum = kind === 'zip' ? contracts.LIMITS.gameArchiveBytes : contracts.LIMITS.artifactBytes;
      if (!bytes.length || bytes.length > maximum) throw new Error('Artifact exceeds limits');
      const checksum = byteHash(bytes);
      if (evidence.artifacts?.[kind]?.sha256 !== checksum || evidence.artifacts[kind].size !== bytes.length) throw new Error('Artifact is not bound to trusted evidence');
      const stage = `staging/${requestId}/${checksum}/${kind}`;
      await this.storage.putImmutable(stage, bytes);
      await this.storage.verify(stage, {size: bytes.length, sha256: checksum});
      const destination = contracts.artifactPath(ident, request.version, kind);
      manifest[kind] = {path: destination, url: this.artifactOrigin + '/' + destination, size: bytes.length, sha256: checksum};
      staged[kind] = stage;
    }
    if (Object.keys(evidence.artifacts || {}).sort().join(',') !== Object.keys(manifest).sort().join(',')) throw new Error('Evidence artifact set differs from publication');
    const metadata = await this.resolveRepositoryMetadata(request.repository.id,{requestId});
    currentOwner(request, metadata);
    const descriptor = request.descriptor;
    const release = {
      schema: 1, kind: ident.kind, id: ident.id, slug: ident.slug, version: request.version,
      title: descriptor.title, description: descriptor.description, license: descriptor.license,
      repository: contracts.validateRepository(Object.fromEntries(['id','ownerId','owner','name','url'].map(key => [key, metadata[key]]))),
      contributor: {githubId:request.requester.githubId,login:metadata.owner}, source: {commit: request.commit, folder: request.folder, sha256: request.sourceDigest},
      policyRevision: request.policyRevision, status: 'available', artifacts: manifest,
      ...(request.web?{web:structuredClone(request.web)}:{}),
      ...(request.kind === 'library' ? {namespace: ident.namespace, coordinate: {...ident.coordinate, version: request.version}, libraryKind: descriptor.libraryKind, ...(components ? {components} : {})} : {controls: descriptor.controls})
    };
    contracts.validateRelease(release, {artifactOrigin: this.artifactOrigin});
    if(this.beforeAccept)await this.beforeAccept({requestId,request:structuredClone(request)});
    const key = releaseKey(ident, request.version);
    await this.registry.update(state => {
      const live = state.requests[requestId];
      if (!live || live.status === 'cancelled') throw new Error('Request cancelled before acceptance');
      const item = state.items[ident.id];
      if (item && !sameBinding(item, request)) throw new Error('Established owner/source binding changed; deliberate migration required');
      const existing = state.releases[key];
      if (existing && (existing.requestId !== requestId || canonical(stableRelease(existing.release)) !== canonical(stableRelease(release)) || canonical(existing.adoption??null)!==canonical(adoption??null))) throw Object.assign(new Error('Immutable version conflict; use a new version'),{kind:'source-failure'});
      if (!existing) {
        state.items[ident.id] = {kind: ident.kind, slug: ident.slug, repositoryId: request.repository.id, contributorId: request.requester.githubId, folder: request.folder};
        state.releases[key] = {requestId, release, staged, delivery: 'pending', evidenceDigest: digest(evidence), ...(adoption?{adoption}:{})};
        // Reserve generated-catalog capacity for pending deliveries too. A
        // capacity failure occurs before acceptance and leaves the inbox intact.
        contracts.validateCatalog({schema: 1, revision: '0'.repeat(40), releases: Object.values(state.releases).map(value => ({...value.release,status:'withdrawn'}))}, {artifactOrigin:this.artifactOrigin});
      }
      live.releaseKey = key;
      live.status = state.releases[key].delivery === 'ready' ? 'available' : 'delivery-pending';
    });
    return this.deliver(key);
  }
  async deliver(key) {
    const accepted = (await this.registry.read()).state.releases[key];
    if (!accepted) throw new Error('Unknown accepted release');
    // Recovery deliberately uses accepted manifests/staged bytes. It never
    // fetches the student's current source or reruns their POM or Java.
    for (const [kind, artifact] of Object.entries(accepted.release.artifacts)) {
      let bytes;
      try { bytes = await this.storage.verify(accepted.staged[kind], artifact); }
      catch (error) {
        if (error.code !== 'ENOENT' || accepted.delivery !== 'ready') throw error;
        bytes = await this.storage.verify(artifact.path, artifact);
      }
      await this.storage.putImmutable(artifact.path, bytes);
      await this.storage.verify(artifact.path, artifact);
      if (['jar','sources','pom'].includes(kind)) {
        for (const algorithm of ['sha256','sha1']) {
          const sidecar = Buffer.from(byteHash(bytes, algorithm) + '\n');
          await this.storage.putImmutable(artifact.path + '.' + algorithm, sidecar);
          await this.storage.verify(artifact.path + '.' + algorithm, {size: sidecar.length, sha256: byteHash(sidecar)});
        }
      }
    }
    await this.registry.update(state => {
      const current = state.releases[key];
      if (current.delivery !== 'ready') {
        current.delivery = 'ready';
        state.availability.push({sequence: state.sequence + 1, key, status: 'available'});
        const record = state.requests[current.requestId];
        record.status = 'available';
        appendAttempt(record, {kind: 'published', message: 'Accepted immutable files verified and available'});
      }
    });
    await this.refreshCatalog();
    return (await this.registry.read()).state.releases[key];
  }
  async pruneStaging(key, {retentionEligible}) {
    if (typeof retentionEligible !== 'function') throw new Error('Explicit operator recovery-retention decision required');
    const accepted = (await this.registry.read()).state.releases[key];
    if (!accepted || accepted.delivery !== 'ready' || await retentionEligible(structuredClone(accepted)) !== true) throw new Error('Release is not eligible for staging cleanup');
    for (const [kind, artifact] of Object.entries(accepted.release.artifacts)) {
      await this.storage.verify(artifact.path, artifact);
      await this.storage.removeVerified(accepted.staged[kind], artifact);
    }
    await this.registry.update(state => { state.releases[key].stagingCleaned = true; });
  }
  async setAvailability(key, status) {
    if (!['available','withdrawn'].includes(status)) throw new Error('Invalid availability');
    await this.registry.update(state => {
      changeAvailability(state,key,status);
    });
    return this.refreshCatalog();
  }
  /** Withdraw an explicitly reviewed finite list. No source, staging or artifact
   * deletion: availability and the normal immutable catalog are the only writes. */
  async cleanupPracticeListings(keys, {execute = false} = {}) {
    if (!Array.isArray(keys) || keys.length < 1 || keys.length > 150 ||
        keys.some(key => typeof key !== 'string') || new Set(keys).size !== keys.length)
      throw new Error('Choose 1–150 distinct exact practice release keys');
    const {state} = await this.registry.read();
    const catalog = generateCatalog(state, {artifactOrigin:this.artifactOrigin});
    const candidates = new Map(catalog.releases.map(release => [releaseKey(release, release.version), release]));
    const selected = keys.map(key => {
      const release = candidates.get(key);
      if (!release || !practice.isTutorialPractice(release))
        throw new Error('Only exact delivery-ready tutorial practice releases can be cleaned up');
      const availability = state.availability.filter(event => event.key === key).at(-1);
      return {key, id:release.id, version:release.version, repositoryUrl:release.repository.url, previousStatus:release.status,
        availabilitySequence:availability?.sequence ?? null, releaseDigest:digest(state.releases[key])};
    });
    if (execute) {
      await this.registry.update(current => {
        // Retry against the current CAS state without broadening the selected set.
        // Even a withdraw/restore cycle requires a fresh operator review.
        for (const entry of selected) {
          const live = current.releases[entry.key];
          const latest = current.availability.filter(event => event.key === entry.key).at(-1);
          if (!live || live.delivery !== 'ready' || !practice.isTutorialPractice(live.release) ||
              digest(live) !== entry.releaseDigest || (latest?.sequence ?? null) !== entry.availabilitySequence ||
              (latest?.status ?? 'available') !== entry.previousStatus)
            throw new Error('Practice availability changed; review the exact selection again');
        }
        for (const entry of selected) changeAvailability(current,entry.key,'withdrawn');
      });
      await this.refreshCatalog();
    }
    return {mode:execute?'execute':'dry-run',action:'library-practice-cleanup',
      selected:selected.map(({releaseDigest,...entry})=>entry),status:execute?'withdrawn':'unchanged',retained:'source and all accepted artifacts'};
  }
  async refreshCatalog() {
    for (let retries = 0; retries < this.registry.maxRetries; retries++) {
      const {state, revision} = await this.registry.read();
      const catalog = generateCatalog(state, {artifactOrigin: this.artifactOrigin});
      const bytes = Buffer.from(canonical(catalog) + '\n');
      const objectPath = `catalog/snapshots/${digest(bytes)}.json`;
      await this.storage.putImmutable(objectPath, bytes);
      await this.storage.verify(objectPath, {size: bytes.length, sha256: digest(bytes)});
      // Pointer is part of the same CAS ledger. An older builder cannot advance
      // it after a release/withdrawal committed on a newer revision.
      const next = structuredClone(state);
      const pointer = {path: objectPath, url: this.artifactOrigin + '/' + objectPath, revision: catalog.revision, sequence: state.sequence};
      if (state.catalog?.path === objectPath) {
        if (this.publishCatalog) await this.publishCatalog(pointer, bytes, revision);
        return catalog;
      }
      next.catalog = pointer;
      next.sequence++;
      if (await this.registry.compareAndSwap(revision, next)) {
        // External adapters must CAS their public pointer against this sequence;
        // a plain blind object overwrite is not an accepted implementation.
        const committed = await this.registry.read();
        if (committed.state.catalog?.path !== objectPath) continue;
        if (this.publishCatalog) await this.publishCatalog(pointer, bytes, committed.revision);
        return catalog;
      }
    }
    throw new Error('Catalog changed repeatedly; retry reconciliation');
  }
  async reconcile({prepare, limit = 150} = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 150) throw new Error('Reconciliation limit must be 1–150');
    const state = (await this.registry.read()).state;
    const results = [];
    for (const record of Object.values(state.requests).filter(value => ['queued','delivery-pending'].includes(value.status)).slice(0,limit)) {
      try {
        if (record.releaseKey) results.push({requestId: record.id, release: await this.deliver(record.releaseKey)});
        else if (prepare) results.push({requestId: record.id, release: await this.publish({requestId: record.id, ...await prepare(structuredClone(record))})});
        else results.push({requestId: record.id, status: 'queued'});
      } catch (error) {
        await reportAttempt(this.registry, record.id, {kind: error.kind === 'source-failure' ? 'source-failure' : 'infrastructure-failure', message: error.kind==='source-failure'?'Source checks failed; prepare a corrected request':'Platform unavailable; durable request retained',...(error.kind==='source-failure'?{sourceDiagnostic:sourceDiagnostics.diagnosticFromError(error)}:{})});
        results.push({requestId: record.id, error: error.message});
      }
    }
    await this.refreshCatalog();
    return results;
  }
}

export function generateCatalog(state, {artifactOrigin} = {}) {
  const status = new Map(state.availability.map(event => [event.key,event.status]));
  const releases = Object.entries(state.releases).filter(([,value]) => value.delivery === 'ready').sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => ({...structuredClone(value.release), status: status.get(key) || 'available'}));
  const revision = createHash('sha1').update(canonical({releases, availability: state.availability})).digest('hex');
  return contracts.validateCatalog({schema: 1, revision, releases}, {artifactOrigin});
}
