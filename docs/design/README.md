# Selected design

The website's selected ultra-minimal landing design and theme are recorded in
[WEBSITE.md](WEBSITE.md), with [the saved mockup](selected-landing.png).
The owner selected the first minimal revision on 2026-10-09: centered Zero
wordmark, one sentence, Download Zero and Learn more. Supporting information
lives on a separate page.

The user selected the light **small project sidebar** concept on 2026-10-07.
The saved [screen](selected-sidebar.png) and [storyboard](student-storyboard.png)
were generated with the built-in image-generation tool for discussion. They
are design references, not screenshots of functioning software.

The screen-generation brief: retain native VS Code menus, editor and tabs;
hide minimap/activity bar/chat/extra panels; add a small supported sidebar with
Run/Stop/Upload, repository status, a copy-link action and native-style files.
The storyboard-generation brief: first-launch setup, ready-to-code view,
separate JavaFX app, line-linked compiler error, upload then separate Pika link.

Actual bootstrap differs intentionally in one important state: upload is
labelled simulation by default; a guarded upload engine is implemented behind
the opt-in live setting, but actual GitHub authentication/upload is unverified. Local
running is available independently of GitHub sign-in. Framework method names
in the mockups were illustrative; the Java source defines the implemented API.

[Actual editor screenshot](actual-zero-editor.png) shows the functioning sidebar
in a user-selected dark theme, captured during Mac verification. The profile
starts light and follows the selected VS Code theme.
