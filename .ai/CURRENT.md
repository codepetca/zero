# Website GitHub profile photo — 2026-10-24

Owner requests the GitHub user image for the website profile. Use GitHub’s
public avatar CDN with the existing numeric account ID, retain the initial
while loading/on failure, keep circular44px sizing/full accessible username,
and reset image state when the account changes. No auth/session schema change,
extra API lookup, image proxy/service, credential or permission change.

Branch codex/zerohub-profile-photo, base b376a903 (includes the separately
reviewed desktop endpoint PR190), attached zerohub-interest worktree. Root owns
AccountMenu and its CSS. Preserve primary funding work and other worktrees.
Existing website publication authority continues; all Free services unchanged.

Next: website tests/build/root checks; Playwright real public-avatar load,
loading/error fallback, account switch, sign-out, light/dark/mobile checks;
one independent standard-risk UI review, PR/CI/merge and production verification.
Evidence stays in .verification/zerohub-profile-photo/ and output/playwright/.
