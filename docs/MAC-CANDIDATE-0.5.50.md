# Mac0.5.50 candidate — 2026-10-25

Owner authorized mergePR198, signed50preparation, installed sign-in/upgrade tests
and publication after normal gates. SourcePR198 merged73847c88 with11green checks
and complete independent security/UI/integration coverage. The change removes
new code-sign-in options; saved older sessions keep renewal. Signed-out main
Start Page action says Sign in to GitHub; tutorial creation remains access-gated.
No framework API, project pins, credential schema, PKCE or permission changes.

## Immutable preparation

- Kit/extension0.5.50, nativebuild50, core0.3.0.
- Clean build source ecf95cd0367522fe0edb1c92c38b43770787026a.
- Preparation fc7001e4c165c9ae6ccfa972f552c5aa4e936be4; protected build inputs equivalent.
- Sealed `dist/candidates/mac-0.5.50-fc7001e4c165/`,13checksum entries.
- DMG `Zero-0.5.50-macos.dmg`: 5,918,773bytes.
- SHA256 `8120ada9ad2c999117615e0f6b7e4de67ccc4ea43f4d833005c2dc9220fe41b1`.
- Apple Accepted `e880824d-30a3-48ef-912e-878d861d441b`; staple validation and real
  app/DMG Developer ID/Gatekeeper assessments pass. Final DMG was remeasured after
  stapling. Exact signed update feed and DMG Ed25519 verification pass during seal.
- Existing49/48 sealed artifacts and published49download/feed remain unchanged
  during preparation. Manualkit17 and Windows21 retain separate versions.

Root checks and34release/installer/updater tests pass; two optional signer cases
skip, separately covered by actual signed50artifact operations. Kit/source/license/
archive/extracted Maven checks and actual signed installer payload checks pass.
Version review (Luna/medium) found obsolete code-flow prose, corrected in current
and bundled guides before clean build. The final two host-wording clarifications
were coordinator-checked and included in the sealed-artifact review scope.

## Installed acceptance and delivery gates

Preparation is separate from installed-runtime acceptance. Private rollback copies
of the49app, kit and isolated editor were made without reading credential values;
live IPC sockets were excluded. An earlier partial copy is retained separately.
No existing `~/Zero Projects` root was present at baseline, so this trial cannot
claim preservation of those earlier deleted repositories. A hash-checked49starter
copy (249files) and a disposable unsaved48character note provide explicit local
preservation fixtures; settings are separately hashed. Installed49was observed
with its old code-sign-in command before replacement.

The source and promotion PR descriptions and ignored `.verification/mac50/`
receipts record exact-headCI, independent candidate review, installed49→50
results, live browser sign-in and eventual anonymous public/download/feed checks.
Do not infer those runtime or publication results from this preparation record.
No student repository write, new credentials/permissions, ZeroJams activation,
separate manual-kit/Windows release or old-asset replacement is authorized.
Fresh-Mac/school-network/novice/physical-gameplay and actual Sparkle-delivery
acceptance remain separately unproven; owner continues that pilot.
