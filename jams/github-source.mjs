import {createHash} from 'node:crypto';
import {actorIdentity, fail, manifestData, repositoryData, repositoryUrl, SHA} from './schema.mjs';
import {credential, githubRequest} from './github-transport.mjs';

export function decodeGitHubBlob(data,maxBytes) {
  if (!data || data.type !== 'file' || !SHA.test(data.sha||'') || data.encoding !== 'base64' || typeof data.content !== 'string' || !/^[A-Za-z0-9+/=\r\n]*$/.test(data.content) || !Number.isSafeInteger(data.size) || data.size < 1 || data.size > maxBytes) fail(503,'Jam source contents are unavailable.');
  const bytes = Buffer.from(data.content.replace(/[\r\n]/g,''),'base64');
  if (bytes.length !== data.size || bytes.length > maxBytes || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== data.sha) fail(503,'Jam source integrity could not be verified.');
  return bytes;
}
/** Fixed GitHub API requests only; never builds source or fetches websiteUrl. */
export function createGitHubSourceVerifier({token,fetchImpl=fetch,timeoutMs=8000}={}) {
  return async function verifySource({repositoryUrl:url,commit,actor,manifest=false}) {
    credential(token);
    actor = actorIdentity(actor);
    const parts = repositoryUrl(url);
    if (!SHA.test(commit||'')) fail(400,'Choose an exact 40-character source commit.');
    const route = `/repos/${parts.owner}/${parts.repo}`;
    const request = async (suffix,maxBytes=32768) => {
      const result = await githubRequest(route+suffix,{token,fetchImpl,timeoutMs,maxBytes});
      if (result.status === 404) fail(400,'The public source repository or commit was not found.');
      if (result.status !== 200) fail(503,'The public source could not be verified.');
      return result.data;
    };
    const repo = await request('');
    if (!Number.isSafeInteger(repo?.id) || !Number.isSafeInteger(repo?.owner?.id) || repo.private !== false || repo.visibility && repo.visibility !== 'public' || repo.owner.type !== 'User' || repo.full_name?.toLowerCase() !== `${parts.owner}/${parts.repo}`.toLowerCase()) fail(403,'Use a public repository owned by your personal GitHub account.');
    const repository = repositoryData({id:String(repo.id),ownerId:String(repo.owner.id),fullName:repo.full_name,commit},actor,commit);
    const exact = await request(`/git/commits/${commit}`,32768);
    if (exact?.sha !== commit) fail(400,'The exact source commit could not be verified.');
    if (!manifest) return {repository};
    const content = await request(`/contents/zero-jam.json?ref=${commit}`,100000);
    if (content.path !== 'zero-jam.json') fail(503,'Jam manifest source is unavailable.');
    let parsed; try { parsed = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decodeGitHubBlob(content,32768))); }
    catch(error) { if(error?.status)throw error; fail(400,'The jam manifest is not valid UTF-8 JSON.'); }
    return {repository,manifest:manifestData(parsed)};
  };
}
