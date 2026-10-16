# Zero 0.5.17

This release includes the canonical `zero.App` and `zero.GameApp` APIs.
`App` builds event-driven JavaFX interfaces; `GameApp extends App` adds a canvas,
`update(seconds)` and `draw()`. Ordinary objects remain explicitly updated by
student code. The framework version is 0.2.0.

`SimpleApp` and `SketchApp` have been removed without compatibility aliases.
Existing projects migrating their framework source should change imports, base
classes and filenames to `App` and `GameApp`. Starter, lesson and example source,
website reference and all eight public templates already use the new names.
Maintainer starter preparation preserves edited legacy files and rejects linked
output paths before changing owned files.

The complete kit, standalone starter and VSIX are published together as v0.5.17.
The signed, notarized Mac installer is published separately as setup-v0.5.17 and
uses native build 17 with the existing signed automatic-update feed. It embeds
the same complete kit bytes. Existing 0.5.14 and earlier Mac apps require one
manual replacement to gain automatic updates.

This release uses the reviewed two-class framework on main. Browser-first
execution and the separate sidebar/tutorial redesign are outside this release.
Physical Windows, fresh-machine Mac setup and novice usability remain untested;
Intel Macs are outside the current support target. No Windows EXE is published.
