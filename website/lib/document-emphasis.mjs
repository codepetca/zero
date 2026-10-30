// Only style explicit keyboard shortcuts and Command Palette commands; ordinary
// bold labels and Java code keep their existing meaning and presentation.
export function documentEmphasisKind(node) {
  const text = n => n?.type === 'text' ? n.value : (n?.children || []).map(text).join('');
  const value = text(node).trim();
  if (/^(?:Cmd|Ctrl|Option|Alt|Shift)\+/.test(value)) return 'shortcut';
  if (/^(?:Zero|View|Preferences|Profiles|Extensions):\s/.test(value)) return 'command';
  return null;
}
