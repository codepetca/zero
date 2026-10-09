'use strict';
const {createHash} = require('node:crypto');
const {CATALOG_URL, REPOSITORY_URL} = require('../../src/public-components');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function publicFixture(versions = ['0.1.2','0.1.3']) {
  const catalog = {schemaVersion:1, origin:'public-release', publication:{status:'published',repository:'codepetca/zero-community'},
    repositoryUrl:REPOSITORY_URL, latest:versions.at(-1), library:{groupId:'school.zero.community',artifactId:'zero-community',version:versions.at(-1),javaRelease:17,javafxVersion:'21.0.12'},
    components:[{id:'health-bar',name:'HealthBar',className:'zero.community.HealthBar',description:'App-owned health.',api:['HealthBar(int maximum)','Node view()','void setHealth(int health)'],
      examples:[{id:'adventure',path:'examples/adventure/Main.java',description:'Damage and reset.'}],status:'experimental',license:'MIT',maintainer:null}], releases:[]};
  const artifacts = new Map(), requests = [], hooks = {};
  for (const version of versions) {
    const workshopName = `zero-community-workshop-${version}.zip`;
    const release = {version,sourceRevision:'a'.repeat(40),sourceDigest:'b'.repeat(64),notes:`HealthBar ${version}: explicit updates and MIT notices.`,artifacts:{},
      workshop:{filename:workshopName,size:200,sha256:'c'.repeat(64),url:`https://github.com/codepetca/zero-community/releases/download/v${version}/${workshopName}`}};
    for (const [kind,suffix] of Object.entries({jar:'.jar',pom:'.pom',sources:'-sources.jar',javadoc:'-javadoc.jar'})) {
      const name = `zero-community-${version}${suffix}`;
      const relative = `school/zero/community/zero-community/${version}/${name}`;
      const bytes = Buffer.from(kind === 'pom' ? `<project><groupId>school.zero.community</groupId><artifactId>zero-community</artifactId><version>${version}</version><licenses><license><name>MIT License</name><url>https://opensource.org/licenses/MIT</url></license></licenses></project>` : `fixture ${version} ${kind} MIT`);
      artifacts.set(`${REPOSITORY_URL}/${relative}`,bytes);
      release.artifacts[kind] = {path:relative,size:bytes.length,sha256:digest(bytes),url:`https://github.com/codepetca/zero-community/releases/download/v${version}/${name}`};
    }
    catalog.releases.push(release);
  }
  async function fetch(url, options) {
    requests.push({url,options});
    if (hooks.fetch) {const result = await hooks.fetch(url,options); if (result !== undefined) return result;}
    const bytes = url === CATALOG_URL ? Buffer.from(JSON.stringify(catalog)) : artifacts.get(url);
    if (!bytes) throw new Error(`Unexpected request: ${url}`);
    return new Response(bytes,{headers:{'content-length':String(bytes.length)}});
  }
  function replace(kind, version, text) {
    const release = catalog.releases.find(item => item.version === version), artifact = release.artifacts[kind];
    const bytes = Buffer.from(text);
    artifacts.set(`${REPOSITORY_URL}/${artifact.path}`,bytes);
    artifact.size = bytes.length; artifact.sha256 = digest(bytes);
  }
  return {catalog,artifacts,requests,hooks,fetch,replace};
}
module.exports = {publicFixture};
