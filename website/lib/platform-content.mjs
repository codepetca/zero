// Website-only variants preserve the original Markdown for bundled/offline readers.
// The targets are explicit so a changed lesson fails validation instead of silently
// showing students an outdated copy of a whole paragraph.
const variants = {
  'lesson-15': [
    ['**Cmd+Shift+P** on a Mac\n\n**Ctrl+Shift+P** on Windows', '**[Cmd+Shift+P](#zero-platform-mac)[Ctrl+Shift+P](#zero-platform-windows)**'],
    ['**Cmd+P**', '**[Cmd+P](#zero-platform-mac)[Ctrl+P](#zero-platform-windows)**'],
  ],
  style: [
    ['`./mvnw clean compile javafx:run`, or the Windows wrapper', '[`./mvnw clean compile javafx:run`](#zero-platform-mac)[`.\\mvnw.cmd clean compile javafx:run`](#zero-platform-windows)'],
  ],
  setup: [
    ['On Mac, open the downloaded DMG and drag **Zero** into **Applications**. On Windows, open the installer and follow its prompts.', '[On Mac, open the downloaded DMG and drag **Zero** into **Applications**.](#zero-platform-mac)[On Windows, open the installer and follow its prompts.](#zero-platform-windows)'],
    ['**Cmd+Shift+P** on a Mac or **Ctrl+Shift+P** on Windows', '**[Cmd+Shift+P](#zero-platform-mac)[Ctrl+Shift+P](#zero-platform-windows)**'],
    ['On Mac, use **Zero: Check for Updates**. On Windows, follow the update instructions for the installer you used.', '[On Mac, use **Zero: Check for Updates**.](#zero-platform-mac)[On Windows, follow the update instructions for the installer you used.](#zero-platform-windows)'],
  ],
};
export function platformMarkdown(id, markdown) {
  const key = id === 'starter' ? 'setup' : id;
  for (const [before, after] of variants[key] || []) {
    if (!markdown.includes(before)) throw new Error(`Missing platform instruction in ${key}: ${before}`);
    markdown = markdown.replace(before, after);
  }

  return markdown;
}
