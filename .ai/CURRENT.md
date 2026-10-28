# MSIX WACK validation — 2026-10-28

Owner requests Windows App Certification Kit validation. Branch codex/msix-wack
starts at mainb6a9acbc (PR228 merged; corrected product0.5.56→Store1.5.56.0).
Prior final Windows run40720138469 passed actual test-signed MSIX deployment,
EXE bootstrap/reopen and JavaFX/offline; source and WebFX also passed. Verified
unsigned candidate is in Downloads/Zero-Store-0.5.56-verified. Partner Center
upload still returns generic errors; no certification submission is authorized.

PR229 adds required WACK execution within temporary signed-copy installation,
actual semantic report validation, report retention and cleanup on failure.
Coordinator Sol High; bounded script/parser implementation Terra High. Root owns
workflow/docs. Missing tooling/session/report must not silently pass. Do not
exclude failing tests or alter installed student environments to obtain success.

Keep existing public releases and prior candidate bytes immutable. No app or
website release, Store submission, beginner-guide or ZeroJams changes belong here.
Native Windows10/11 interactive acceptance and Store updates remain separate.

Actual first run40724961277 executed WACK and retained XML/HTML;24tests,
overallWARNING, required DPI-awareness warning and optional blocked-executables
failure. Installation and cleanup passed. Do not merge while the new gate fails
or call this clean certification. NativeCentennial parsing and summaries are verified by the second real run
40726661389. Owner now authorizes DPI remediation and optional-warning review.
Pending manifest/App.config PerMonitorV2 support and required-config packaging;
optional-only findings are informational under Microsoft guidance, retained with
passed-with-optional-findings. Required non-PASS or unknown/incomplete results
still fail. Rerun actual WACK and complete review/CI before merging PR229.
