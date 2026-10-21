# Native Explorer — implementation and authorized Mac release

Owner authorized replacing the custom file tree with native VS Code Explorer,
keeping Zero controls/teaching helpers together, then merging and publishing.
Base 9ad376d955957d392c832ff463bb142f8d65e375 (published Mac0.5.39).
Worktree native-explorer; primary funding work remains untouched.

Zero controls now contribute to Explorer under a new view ID so existing custom
view placement cannot retain the old container. Native file tree owns selection,
editor tracking and file operations. Teaching New menu and guarded commands remain.
Supported APIs cannot force built-in view ordering; drag Zero above files once,
then VS Code remembers. No private APIs or workbench storage edits.

Next: affected/root/browser checks, independent source review, new clean signed
Mac0.5.40 build, notarize/seal, exact-head CI/merge, public DMG and reviewed feed
promotion, live verification, preserve evidence and retire owned worktree.
No native VS Code QA after prior Code Key popup; no keychain/credential changes.
Windows21/manualkit17 and immutable prior releases stay unchanged.
