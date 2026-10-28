# MSIX WACK validation — 2026-10-28

Owner requests Windows App Certification Kit validation. Branch codex/msix-wack
starts at mainb6a9acbc (PR228 merged; corrected product0.5.56→Store1.5.56.0).
Prior final Windows run40720138469 passed actual test-signed MSIX deployment,
EXE bootstrap/reopen and JavaFX/offline; source and WebFX also passed. Verified
unsigned candidate is in Downloads/Zero-Store-0.5.56-verified. Partner Center
upload still returns generic errors; no certification submission is authorized.

Current work: required WACK execution within temporary signed-copy installation,
actual semantic report validation, report retention and cleanup on failure.
Coordinator Sol High; bounded script/parser implementation Terra High. Root owns
workflow/docs. Missing tooling/session/report must not silently pass. Do not
exclude failing tests or alter installed student environments to obtain success.

Keep existing public releases and prior candidate bytes immutable. No app or
website release, Store submission, beginner-guide or ZeroJams changes belong here.
Native Windows10/11 interactive acceptance and Store updates remain separate.
