'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {validateDiscovery, discoveryGroups, recommendationFor, componentVersion, componentVersions} = require('../src/component-discovery');
const {loadPublicCatalog, CATALOG_URL} = require('../src/public-components');
const {publicFixture} = require('./helpers/public-catalog.cjs');
function alternatives() {
  const f = publicFixture();
  f.catalog.components[0].category = 'health-bars';
  f.catalog.components[0].versions = ['0.1.2','0.1.3'];
  f.catalog.components.push({...f.catalog.components[0],id:'segmented-health-bar',name:'SegmentedHealthBar',className:'zero.community.SegmentedHealthBar',versions:['0.1.3']});
  f.catalog.discovery = {categories:[{id:'health-bars',name:'Health bars'}],recommendations:[{componentId:'health-bar',version:'0.1.2',reason:'A simple starting choice.'}]};
  return f;
}
test('old catalogs retain Components grouping and all release versions', () => {
  const {catalog} = publicFixture();
  assert.equal(validateDiscovery(catalog),catalog);
  assert.deepEqual(discoveryGroups(catalog),[{id:'components',name:'Components',components:catalog.components}]);
  assert.deepEqual(componentVersions(catalog,catalog.components[0]),['0.1.2','0.1.3']);
  assert.equal(componentVersion(catalog,catalog.components[0]),'0.1.3');
  assert.equal(recommendationFor(catalog,catalog.components[0]),null);
});
test('reviewed recommendation chooses older exact version and precedes alternatives without changing status', async () => {
  const f=alternatives(); f.catalog.components.reverse();
  const {catalog}=await loadPublicCatalog({fetch:f.fetch});
  const [group]=discoveryGroups(catalog);
  assert.equal(group.name,'Health bars'); assert.deepEqual(group.components.map(c=>c.id),['health-bar','segmented-health-bar']);
  assert.equal(componentVersion(catalog,group.components[0]),'0.1.2');
  assert.equal(componentVersion(catalog,group.components[1]),'0.1.3');
  assert.equal(group.components[0].status,'experimental'); assert.equal(group.components[0].maintainer,null);
});
test('nonrecommended versions select newest numeric exact version independent of catalog ordering', () => {
  const catalog={origin:'local-proof',releases:[{version:'0.1.9'},{version:'0.1.10'},{version:'0.1.2'}],components:[{id:'test',versions:['0.1.10','0.1.2','0.1.9']}]};
  validateDiscovery(catalog);
  assert.equal(componentVersion(catalog,catalog.components[0]),'0.1.10');
});
const invalid = [
  ['duplicate category',c=>c.discovery.categories.push(c.discovery.categories[0])],
  ['unknown category',c=>c.components[0].category='unknown'],
  ['unknown release',c=>c.components[1].versions=['0.1.9']],
  ['duplicate component versions',c=>c.components[1].versions=['0.1.3','0.1.3']],
  ['no available versions',c=>c.components[1].versions=[]],
  ['recommended version lacks selected class',c=>c.discovery.recommendations=[{componentId:'segmented-health-bar',version:'0.1.2',reason:'Forged history.'}]],
  ['two starting recommendations in category',c=>c.discovery.recommendations.push({componentId:'segmented-health-bar',version:'0.1.3',reason:'Another starting choice.'})],
  ['component self-promotion',c=>c.components[0].recommended=true],
  ['curation human approval claim',c=>c.discovery.recommendations[0].accepted=true],
  ['category executable metadata',c=>c.discovery.categories[0].command='run'],
  ['duplicate class identity',c=>c.components[1].className=c.components[0].className],
  ['source class path injection',c=>c.components[1].className='zero.community.HealthBar/../Other'],
];
for(const [name,edit] of invalid) test(`public alternatives reject ${name} before artifact downloads`,async()=>{
  const f=alternatives();edit(f.catalog);await assert.rejects(loadPublicCatalog({fetch:f.fetch}));assert.equal(f.requests.length,1);
});
test('local category/version descriptions grant no recommendation authority', () => {
  const {catalog}=alternatives();catalog.origin='local-proof';
  assert.equal(recommendationFor(catalog,catalog.components[0]),null);
  assert.throws(()=>validateDiscovery(catalog),/Local catalogs/);
  delete catalog.discovery;
  validateDiscovery(catalog);assert.equal(componentVersion(catalog,catalog.components[0]),'0.1.3');
  catalog.components[0].recommendation={version:'0.1.2'};
  assert.throws(()=>validateDiscovery(catalog),/cannot recommend itself/);
});


test('new extension requests versioned catalog while accepting legacy schema 1 payloads', async () => {
  assert.equal(CATALOG_URL,'https://zero.codepet.ca/community/catalog-v2.json');
  const legacy=publicFixture(['0.1.2']);assert.equal((await loadPublicCatalog({fetch:legacy.fetch})).catalog.schemaVersion,1);
  const modern=alternatives();modern.catalog.schemaVersion=2;assert.equal((await loadPublicCatalog({fetch:modern.fetch})).catalog.schemaVersion,2);
  modern.catalog.schemaVersion=3;await assert.rejects(loadPublicCatalog({fetch:modern.fetch}),/Only the published/);
});
