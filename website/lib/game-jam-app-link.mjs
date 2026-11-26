export function gameJamAppLink(id) {
  if (typeof id !== 'string' || /^jam-(?:[1-9][0-9]{0,19}|zero-[a-f0-9]{32})$/.exec(id)?.[0] !== id) return null;
  return `zero-studio://jam/${id}`;
}
