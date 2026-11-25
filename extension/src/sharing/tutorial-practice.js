'use strict';

// A reserved library slug labels copied tutorial work without changing the
// immutable sharing schema. It is never an originality or safety endorsement.
const SLUG = 'tutorial-credits-badge';
function isTutorialPractice(item) {
  return item?.kind === 'library' && item.slug === SLUG;
}
function practiceCatalogUrl(catalogUrl) {
  const url = new URL(catalogUrl);
  const route = /^\/api\/sharing\/catalog(?:\/(v[23])(?:\/practice)?|\/web|\/practice)?$/.exec(url.pathname);
  if (url.username || url.password || url.search || url.hash ||
      !route)
    throw new Error('This catalog does not offer tutorial practice. Use the configured ZeroHub catalog.');
  url.pathname = route[1] ? `/api/sharing/catalog/${route[1]}/practice` : '/api/sharing/catalog/practice';
  return url.href;
}
module.exports = {SLUG, isTutorialPractice, practiceCatalogUrl};
