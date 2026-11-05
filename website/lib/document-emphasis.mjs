// Style explicit keyboard shortcuts, palette commands and known menu paths;
// ordinary bold labels and Java code keep their existing presentation.
export function documentEmphasisKind(node) {
  const text = n => n?.type === 'text' ? n.value : (n?.children || []).map(text).join('');
  const value = text(node).trim();
  if (/^(?:Cmd|Ctrl|Option|Alt|Shift)\+/.test(value)) return 'shortcut';
  if (/^(?:Zero|View|Preferences|Profiles|Extensions):\s/.test(value)) return 'command';
  if (value === 'New branch…') return 'selection';
  if (/^(?:Project(?:\s*▾)?|Libraries(?: and games)?|Add library|java)\s*→\s*\S/.test(value)) return 'selection';
  return null;
}
