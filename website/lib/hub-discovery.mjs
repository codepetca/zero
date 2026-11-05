// Server projection only. Editorial source records must never enter a client bundle.
import projects from '../content/projects.json' with {type:'json'};
import previews from '../content/project-previews.json' with {type:'json'};
import authors from '../content/release-authors.json' with {type:'json'};
import {catalogResponse, readCatalog} from './sharing-catalog.mjs';
import {bindHubProjectDestination, hubProjectId, hubTargetVisible, hubVisibilityDecision, repositoryParts} from './hub-project-status.mjs';
import {maintainedPlayLink} from './sharing-client.mjs';
import {readJamHubVisibility, assertJamVisibilityTime} from './jam-hub-visibility.mjs';
import {projectHeldCatalog} from './jam-held-catalog.mjs';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';

export const MAX_MAINTAINED_DISCOVERY_PROJECTS = 40;
const ERROR = 'ZeroHub is unavailable. Try again shortly.';
const COMMIT = /^[a-f0-9]{40}$/;
const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const text = (value, maximum) => typeof value === 'string' && value.length <= maximum;
const image = value => text(value, 256) && /^\/project-previews\/[a-z0-9-]+\.png$/.test(value);

function maintainedTarget(project) {
  if (!project || !hubProjectId(project.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id) ||
      !text(project.title, 160) || !text(project.description, 4000) || !text(project.author, 100) ||
      !repositoryParts(project.repositoryUrl) || typeof project.sourceCommit !== 'string' || !COMMIT.test(project.sourceCommit) ||
      project.repositoryId !== undefined && (typeof project.repositoryId !== 'string' || !NUMERIC_ID.test(project.repositoryId)) ||
      project.ownerId !== undefined && (typeof project.ownerId !== 'string' || !NUMERIC_ID.test(project.ownerId))) return null;
  let playUrl;
  try { playUrl = maintainedPlayLink(project); } catch { /* Invalid editorial receipt supplies no action. */ }
  return {id:project.id, kind:'game', title:project.title, description:project.description,
    author:project.author, repositoryUrl:project.repositoryUrl, sourceCommit:project.sourceCommit,
    ...(project.repositoryId !== undefined ? {repositoryId:project.repositoryId} : {}),
    ...(project.ownerId !== undefined ? {ownerId:project.ownerId} : {}),
    ...(image(project.image) ? {image:project.image} : {}), ...(playUrl ? {playUrl} : {})};
}

function maintainedDto(bound, original, displayUrl) {
  // The source binding authorizes the card. The separately validated editorial
  // URL is for browser navigation only, never a server-side status request.
  const {kind, playUrl: _statusUrl, ...safe} = bound;
  const playUrl = displayUrl;
  return {...safe, ...(playUrl ? {web:{provider:'github-pages', url:playUrl,
    commit:bound.sourceCommit, runId:original.web.runId}} : {})};
}

function presentationFor(catalog, previewRecords, authorRecords) {
  if (!catalog) return [];
  const result = new Map();
  for (const release of catalog.releases) {
    const preview = release.kind === 'game' && previewRecords.find(item =>
      item.id === release.id && item.sourceCommit === release.source.commit);
    const credit = release.kind === 'library' && authorRecords.find(item =>
      item.id === release.id && Array.isArray(item.sourceCommits) && item.sourceCommits.includes(release.source.commit));
    const fields = {...(image(preview?.image) ? {image:preview.image} : {}),
      ...(text(preview?.description, 4000) ? {description:preview.description} : {}),
      ...(text(credit?.author, 100) ? {author:credit.author} : {})};
    if (Object.keys(fields).length) result.set(`${release.id}/${release.source.commit}`,
      {id:release.id, sourceCommit:release.source.commit, ...fields});
  }
  return [...result.values()];
}

/** UI-only discovery envelope; not a sharing/catalog protocol replacement.
 * Every request owns one deadline and fresh authority. Lanes run serially so
 * catalog and maintained destination concurrency never add together. Readers
 * are injectable for offline tests; production always uses the fixed readers.
 */
export async function hubDiscoveryResponse(request, {catalogReader=readCatalog,
  visibilityReader=readJamHubVisibility, destinationReader, pagesBindingReader, env=process.env, projects:projectRecords=projects,
  previews:previewRecords=previews, authors:authorRecords=authors, responseBudgetMs=18_000, decisionNow=Date.now}={}) {
  const deadline = createHubRequestDeadline({budgetMs:responseBudgetMs, signal:request.signal});
  const empty = {schema:1, maintained:[], catalog:null, catalogError:ERROR, presentation:[]};
  const reply = (body, status=200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
  try {
    const query = new URL(request.url).searchParams;
    // The final browser generation uses the same complete trusted projection.
    // An active page cannot downgrade to inactive source checks on revalidation.
    const revalidate = query.has('revalidate');
    if (revalidate && (query.size !== (query.get('practice') === '1' ? 2 : 1) || query.getAll('revalidate').length !== 1 || query.get('revalidate') !== '1'))
      return reply({error:'Invalid discovery request.'}, 400);
    const practiceOnly = query.get('practice') === '1';
    let initial, modeChanged = false;
    const readVisibility = async ({signal}={}) => {
      const value = await hubVisibilityDecision({visibilityReader, env, signal});
      assertJamVisibilityTime(value, decisionNow, env);
      if (initial !== undefined && (value === null) !== (initial === null)) modeChanged = true;
      if (modeChanged) throw new Error(ERROR);
      return value;
    };
    initial = await deadline.run(signal => readVisibility({signal}));
    if (revalidate && initial === null) throw new Error(ERROR);

    let maintained = [];
    if (!practiceOnly) {
      if (!Array.isArray(projectRecords) || projectRecords.length > MAX_MAINTAINED_DISCOVERY_PROJECTS) throw new Error(ERROR);
      const candidates = projectRecords.map(original => ({original, target:maintainedTarget(original)})).filter(item => item.target);
      const results = new Array(candidates.length); let next = 0;
      await deadline.run(async signal => {
        await Promise.all(Array.from({length:Math.min(4, candidates.length)}, async () => {
          while (next < candidates.length) {
            deadline.check(); const index = next++, {target, original} = candidates[index];
            const bound = await bindHubProjectDestination(target, initial, {signal,
              visibilityReader:readVisibility, destinationReader, pagesBindingReader, env, decisionNow, check:deadline.check});
            if (bound) results[index] = maintainedDto(bound, original, target.playUrl);
          }
        }));
      });
      maintained = results.filter(Boolean);
    }

    // Keep maintained independent of a failed shared source. Cap this lane so
    // a stalled catalog normally leaves time for the final authority read.
    const response = await deadline.run(signal => catalogResponse(new Request(request, {signal}), {
      includeWeb:true, practiceOnly, reader:catalogReader, visibilityReader:readVisibility,
      destinationReader, pagesBindingReader, env, decisionNow, responseBudgetMs:Math.min(8000, responseBudgetMs)}));
    let catalog = response.ok ? await deadline.run(() => response.json()) : null;
    let finalVisibility;
    {
      const fresh = await deadline.run(signal => readVisibility({signal}));
      finalVisibility = fresh;
      maintained = maintained.filter(project => hubTargetVisible({...project, kind:'game'}, fresh));
      if (catalog && fresh !== null) catalog = projectHeldCatalog(catalog, fresh);
    }
    const body = {schema:1, maintained, catalog, ...(!catalog ? {catalogError:ERROR} : {}),
      presentation:presentationFor(catalog, previewRecords, authorRecords)};
    deadline.check();
    assertJamVisibilityTime(finalVisibility, decisionNow, env);
    return reply(body);
  } catch { return reply(empty, 503); }
  finally { deadline.dispose(); }
}
