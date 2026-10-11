'use strict';
// Curation is authored only in the reviewed public catalog, never a component claim.
const fail = message => { throw new Error(message); };
const idPattern = /^[a-z][a-z0-9-]{0,79}$/;
function fields(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(`Invalid discovery ${label} fields.`);
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 8000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) fail(`Invalid discovery ${label}.`);
}
function compareVersions(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}
function componentVersions(catalog, component) {
  return [...(component.versions || catalog.releases.map(release => release.version))].sort(compareVersions);
}
function recommendationFor(catalog, component) {
  if (catalog.origin !== 'public-release') return null;
  return catalog.discovery?.recommendations?.find(item => item.componentId === component.id) || null;
}
function componentVersion(catalog, component) {
  return recommendationFor(catalog, component)?.version || componentVersions(catalog, component).at(-1);
}
function validateDiscovery(catalog) {
  const publicSource = catalog.origin === 'public-release';
  if (!publicSource && (catalog.discovery !== undefined || catalog.recommendation !== undefined || catalog.recommendations !== undefined || catalog.recommended !== undefined)) fail('Local catalogs cannot claim discovery recommendations.');
  const releases = new Set(catalog.releases.map(release => release.version));
  const categories = new Map([['components', {id:'components', name:'Components'}]]);
  if (catalog.discovery !== undefined) {
    fields(catalog.discovery, ['categories','recommendations'], 'root');
    if (!Array.isArray(catalog.discovery.categories) || catalog.discovery.categories.length > 100 || !Array.isArray(catalog.discovery.recommendations) || catalog.discovery.recommendations.length > 100) fail('Discovery needs category and recommendation lists.');
    const seen = new Set();
    for (const category of catalog.discovery.categories) {
      fields(category, ['id','name'], 'category');
      if (typeof category.id !== 'string' || !idPattern.test(category.id) || seen.has(category.id)) fail('Invalid or duplicate discovery category.');
      seen.add(category.id); text(category.name, 'category name'); categories.set(category.id, category);
    }
  }
  const components = new Map();
  for (const component of catalog.components) {
    if (component.recommended !== undefined || component.recommendation !== undefined || component.recommendations !== undefined || component.discovery !== undefined) fail('A component cannot recommend itself.');
    components.set(component.id, component);
    if (component.category !== undefined && (typeof component.category !== 'string' || !idPattern.test(component.category))) fail('Invalid component category.');
    // Local source can describe its category; only public curation declares groups.
    if (publicSource && component.category !== undefined && !categories.has(component.category)) fail('The component category is not declared in discovery.');
    if (component.versions !== undefined && (!Array.isArray(component.versions) || !component.versions.length || component.versions.length > 100 || new Set(component.versions).size !== component.versions.length || component.versions.some(version => typeof version !== 'string' || !releases.has(version)))) fail('Component versions must identify distinct indexed releases containing its class.');
  }
  const recommendedCategories = new Set();
  for (const recommendation of catalog.discovery?.recommendations || []) {
    fields(recommendation, ['componentId','version','reason'], 'recommendation');
    const component = components.get(recommendation.componentId);
    if (!component || !componentVersions(catalog, component).includes(recommendation.version)) fail('The recommendation must select a version containing that component.');
    const category = component.category || 'components';
    if (recommendedCategories.has(category)) fail('Only one starting recommendation is allowed per category.');
    recommendedCategories.add(category); text(recommendation.reason, 'recommendation reason');
  }
  return catalog;
}
function discoveryGroups(catalog) {
  const groups = new Map();
  const declared = new Map((catalog.origin === 'public-release' ? catalog.discovery?.categories || [] : []).map(category => [category.id, category.name]));
  for (const component of catalog.components) {
    const id = component.category || 'components';
    if (!groups.has(id)) groups.set(id, {id, name:declared.get(id) || (id === 'components' ? 'Components' : id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')), components:[]});
    groups.get(id).components.push(component);
  }
  for (const group of groups.values()) group.components.sort((a,b) => Number(Boolean(recommendationFor(catalog,b))) - Number(Boolean(recommendationFor(catalog,a))));
  return [...groups.values()];
}
module.exports = {validateDiscovery, discoveryGroups, recommendationFor, componentVersion, componentVersions};
