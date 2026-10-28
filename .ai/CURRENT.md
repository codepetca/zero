# Zero Store and combined release — 2026-10-28

Owner asks for a Microsoft Store MSIX matching current Mac functionality, then
release the current app and website/tutorials. Store upload/submission is for
the owner; leave beginner guide and ZeroJams outside scope. Branch
`codex/store-release` starts at merged main bd350b19. Public tutorial website
and Pet asset from that merge now return HTTP 200; Pet and original starter
templates are published and exact-archive verified. Mac and unsigned Windows
preview 0.5.54 remain public, with faster publishing and new lessons absent from
installed apps. Version 0.5.55/build 55 is the planned new line; never overwrite
published bytes or the ignored sealed 0.5.54 candidates.

Terra/medium worker owns Store-specific native, extension, scripts and MSIX
documentation; coordinator owns release metadata and integration. Partner Center
assigns Name `Codepet.zerostudio`, Publisher
`CN=DC9AEBC0-4CAE-4681-9E52-20B0B1C14919`, publisher display `Codepet`, and
PFN `Codepet.zerostudio_g62pw1js6rhjp`. Port selected old feasibility changes,
not its old branch; preserve current Windows Java isolation. Store-managed update
channel is separate from EXE Velopack. The new installer must be tested honestly;
Mac host/hosted Windows are not proof of interactive Store installation,
Windows update, certification, audible audio or school-network compatibility.

Plan: implement and review Store support; build and inspect an identity-correct
MSIX with pinned tooling and real Windows CI when available; align 0.5.55 source,
PR and required checks; prepare/sign/notarize and test Mac candidate, verify
Windows candidate and any kit metadata; publish authorized exact reviewed bytes,
promote feed/website and verify live. No Store submission without explicit user
instruction. Retain held beginner worktree and ZeroJams. Prior merged tutorial
PR222: bd350b19, all 11 checks passed; prior evidence in docs/EVIDENCE.md.
