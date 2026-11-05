/** Construct a GitHub App installation link from a trusted server configuration. */
export function jamPagesInstallLink(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  return `https://github.com/apps/${slug}/installations/new`;
}
