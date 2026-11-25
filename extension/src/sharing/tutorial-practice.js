'use strict';

// A reserved library slug labels copied tutorial work without changing the
// immutable sharing schema. It is never an originality or safety endorsement.
const SLUG = 'tutorial-credits-badge';
function isTutorialPractice(item) {
  return item?.kind === 'library' && item.slug === SLUG;
}
function practiceCatalogUrl(catalogUrl) {
  const url = new URL(catalogUrl);
  if (url.username || url.password || url.search || url.hash ||
      !/^\/api\/sharing\/catalog(?:\/web|\/practice)?$/.test(url.pathname))
    throw new Error('This catalog does not offer tutorial practice. Use the configured ZeroHub catalog.');
  url.pathname = '/api/sharing/catalog/practice';
  return url.href;
}
module.exports = {SLUG, isTutorialPractice, practiceCatalogUrl};
