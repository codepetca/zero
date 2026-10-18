# Zero — current local delivery, 2026-10-18

Worktree: /Users/stew/.codex/worktrees/release-readiness/zero.
Branch: codex/sidebar-zerohub-actions, based on merged GitHub App/branding
PR102 f719d18. Preserve the dirty /Users/stew/Repos/zero checkout.

Current owner request: repositories created through Zero are public; remove the
Private/Public picker and shorten only the first device-code sign-in modal.
Implementation sends private:false from tutorial/new/local-repository creation,
rejects other creation visibility before credentials/network, and retains response
visibility, account, installation, cancellation and recovery checks. Existing
repository access/clone visibility is unchanged. The name prompt says public.
Modal: Connect Zero to GitHub; Copy this code and paste it on GitHub: CODE.
The existing copy/continue button, clipboard, browser and cancellation flow remain.
Setup/product guidance is aligned. Focused64tests and broader88GitHub tests pass;
root check passes. Independent complete-diff review pending before local delivery.

Previous sidebar refinements remain: current panel height/activity-bar logo only,
text-only ZeroHub menu with eligible Share project, two-line owner/repository menu
with right chevron and no separate username row, Add assets beside Files,
recovery/account actions in the project menu. One Run/Stop control offers Stop
while queued/building/running and focusable unavailable Stopping until settled;
icon-only Open in browser appears beside Stop only for an active browser app.
Current source through3bf21cb had clean code and final metadata review. Prior
714-test lifecycle suite passed with3skips; native VS Code/Windows checks for
these local refinements remain unverified. Branch-history layout remains proposed;
merge semantics unchanged. Detailed history: docs/EVIDENCE.md.

Local-only authority: no source push, merge, preview installation, account change
or release authorized by these refinements. Next: finish review/evidence, then
owner-authorized integration/native preview. Ordinary Java and selected App access
remain. DeepSeek paused through2026-12-31. Weekly remaining38%; storage301.6GB
healthy. Prior temporary sidebar server closed; screenshot fixtures are ignored.
