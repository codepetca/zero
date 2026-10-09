// Developer-only preview from the canonical sibling source catalog. It never
// changes the public download manifest or appears in a Vercel build.
export function communityPreview(metadata, manifest, {enabled = false, hosted = false} = {}) {
  if (!enabled || hosted) return null;
  const exact = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  const text = value => typeof value === 'string' && value.trim() && value.length <= 8000 && !/[\x00-\x1f\x7f]/.test(value);
  const library = metadata?.library;
  if (metadata?.schema !== 1 || library?.groupId !== 'school.zero.community' || library.artifactId !== 'zero-community' || library.javaRelease !== 17 || library.javafxVersion !== '21.0.12' || typeof library.version !== 'string' || !exact.test(library.version) || !Array.isArray(metadata.components) || metadata.components.length < 1 || metadata.components.length > 100 || metadata.discovery !== undefined)
    throw new Error('Unsupported local community preview.');
  const ids = new Set(), classes = new Set();
  const components = metadata.components.map(item => {
    if (!item || Object.keys(item).some(key => !['id','name','className','description','api','examples','status','license','maintainer','category','versions'].includes(key)) || typeof item.id !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(item.id) || ids.has(item.id) || typeof item.className !== 'string' || !/^zero\.community\.[A-Z][A-Za-z0-9]*$/.test(item.className) || classes.has(item.className) || !text(item.name) || !text(item.description) || item.status !== 'experimental' || item.license !== 'MIT' || item.maintainer !== null || !Array.isArray(item.api) || item.api.length < 1 || item.api.length > 100 || !item.api.every(text) || !Array.isArray(item.examples) || item.examples.length > 100 || (item.category !== undefined && (typeof item.category !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(item.category))))
      throw new Error('Invalid local preview component.');
    if (item.versions !== undefined && (!Array.isArray(item.versions) || item.versions.length < 1 || item.versions.length > 100 || new Set(item.versions).size !== item.versions.length || !item.versions.every(value => typeof value === 'string' && exact.test(value)) || !item.versions.includes(library.version))) throw new Error('Invalid local preview versions.');
    ids.add(item.id); classes.add(item.className);
    // Pick only display fields. Contributor paths, scripts and claims are never
    // executable inputs or recommendation authority in this preview.
    return {id:item.id, name:item.name, className:item.className, description:item.description, api:item.api, category:item.category || 'components', status:'experimental', license:'MIT', maintainer:null};
  });
  return {version:library.version, components:components.filter(item => !manifest.components.some(published => published.id === item.id))};
}
