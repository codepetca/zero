// Website-only variants preserve the original Markdown for bundled/offline readers.
// The targets are explicit so a changed lesson fails validation instead of silently
// showing students an outdated copy of a whole paragraph.
const variants = {
  'lesson-15': [
    ['**Cmd+Shift+P** on a Mac or **Ctrl+Shift+P** on Windows', '**[Cmd+Shift+P](#zero-platform-mac)[Ctrl+Shift+P](#zero-platform-windows)**'],
    ['**Cmd+P**', '**[Cmd+P](#zero-platform-mac)[Ctrl+P](#zero-platform-windows)**'],
  ],
  style: [
    ['`./mvnw clean compile javafx:run`, or the Windows wrapper', '[`./mvnw clean compile javafx:run`](#zero-platform-mac)[`.\\mvnw.cmd clean compile javafx:run`](#zero-platform-windows)'],
  ],
  setup: [
    ['These steps apply to the **complete kit ZIP** on Windows,\nor to optional manual setup on a Mac with Apple Silicon. Native Mac setup uses\nthe automatic flow above.', 'These steps apply to the **complete kit ZIP**. [On Mac, native setup uses the automatic flow above.](#zero-platform-mac)'],
    ['**Ctrl+Shift+B** on Windows or **Cmd+Shift+B** on macOS', '**[Cmd+Shift+B](#zero-platform-mac)[Ctrl+Shift+B](#zero-platform-windows)**'],
    ['`./mvnw clean compile javafx:run`\non Mac or `.\\mvnw.cmd clean compile javafx:run` on Windows', '[`./mvnw clean compile javafx:run`](#zero-platform-mac)[`.\\mvnw.cmd clean compile javafx:run`](#zero-platform-windows)'],
    ['`setup/Setup.cmd` on Windows or `setup/Setup.command` on a supported Mac', '[`setup/Setup.command`](#zero-platform-mac)[`setup/Setup.cmd`](#zero-platform-windows)'],
    ['recent projects on this Mac', 'recent projects on this computer'],
    ['Mac 0.5.49\n   opens the Zero Start Page with the next setup action.', 'Look for the Zero Start Page and its next setup action.'],
    ['Mac 0.5.47 uses native JavaFX for Run App.', '[Mac 0.5.47 uses native JavaFX for Run App.](#zero-platform-mac)'],
    ['In Mac 0.5.47, **Start tutorial**', 'In current Zero, **Start tutorial**'],
    ['downloaded kit; native Mac setup installs its bundled extension automatically.', 'downloaded kit. [Native Mac setup installs its bundled extension automatically.](#zero-platform-mac)'],
  ],
};
export function platformMarkdown(id, markdown) {
  const key = id === 'starter' ? 'setup' : id;
  for (const [before, after] of variants[key] || []) {
    if (!markdown.includes(before)) throw new Error(`Missing platform instruction in ${key}: ${before}`);
    markdown = markdown.replace(before, after);
  }
  if (key === 'setup') {
    const replaceBetween = (start, end, replacement) => {
      const first = markdown.indexOf(start), last = markdown.indexOf(end, first + start.length);
      if (first < 0 || last < 0) throw new Error(`Missing platform setup section: ${start}`);
      markdown = markdown.slice(0, first) + replacement + markdown.slice(last);
    };
    replaceBetween('On a supported Mac, use', 'See [verification evidence]',
      '[On a supported Mac, use Zero for automatic setup.](#zero-platform-mac)' +
      '[On Windows, run the unsigned installer preview for x64 Windows 10 build 19041 or later. Zero prepares Java and the editor, then opens it. Internet is required for initial setup. Later, open Zero from the Start menu. Windows may show an unknown-publisher or SmartScreen warning. Follow your school or device policies and ask your teacher or IT if installation is blocked. Automatic updates are off; download a newer installer manually. Interactive Windows installation testing is still pending.](#zero-platform-windows)\n\n' +
      'For manual setup, choose the complete kit ZIP on the download page. It includes the starter, extension, profile and keyboard shortcuts. A separate starter-only ZIP is available from [GitHub releases](https://github.com/codepetca/zero/releases); it does not include the extension or optional profile. Download the extension separately if needed, and use the complete kit ZIP for the optional profile.\n');
    replaceBetween('**Updating Zero:**', '\n## Start here',
      '[Updating Zero: choose Zero: Check for Updates, then Install and Relaunch. Zero reopens and loads the updated extension when its editor work is idle. The first upgrade from 0.5.33 or earlier needs one manual Zero reopen/editor reload.](#zero-platform-mac)' +
      '[Updating Zero: download and install a newer Windows installer when available. Automatic Windows updates are off.](#zero-platform-windows)\n');
  }
  return markdown;
}
