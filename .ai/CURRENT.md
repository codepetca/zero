# Store MSIX validation — 2026-10-28

User authorizes package corrections and Windows validation to deliver a ready-to-
upload MSIX. Store submission and public app/site releases remain separate.
Branch codex/msix-wack, draft PR229, base mainb6a9acbc. Product0.5.56 maps to
Store1.5.56.0. Preserve existing public releases and prior candidate bytes.
Beginner guide and ZeroJams remain held.

WACK gate, strict Centennial identity/result parsing, required-test enforcement,
optional-only informational results and retained reports are implemented/reviewed.
Launcher has PMv2 WinForms config,96-DPI form baselines, paired legacy/modern DPI
manifest declarations, and an explicit x64 Store target with locked win-x64 restore.
Normal EXE updater/dependency selection is preserved. Actual Windows EXE install,
bootstrap/reopen, HWND PMv2, JavaFX/offline and signed-copy MSIX install/integrity/
cleanup pass. WACK still reports required DPIWARNING despite valid embedded
manifest/resource1 and AMD64 PE; the optional blocked-executablesFAIL is retained.
No required warning is waived; no candidate is declared WACK-ready or certified.

Latest product source371aa6cf, Windows run40742412970. Ignored exact artifacts/
reports: .verification/wack-40742412970. Candidate SHA256
73423da90df584b6b989f3a4ac9f742160de5bf32a3e477385cb2f20ae27530d.
Next: diagnostic-only hosted Windows run, original candidate plus a minimal
known-DPI-aware control, retained SDK manifest extraction and bounded WACK logs.
SolHigh worker wack_diagnostics owns only new diagnostic script/workflow; root
owns integration/docs; SolHigh dpi_gate_review provides independent delta review.
DPI follow-up has five targeted fix batches. Existing task-scoped owner workflow-
cap waiver applies; correctness/CI/merge gates remain. Avoid speculative product
changes. Physical Windows10/11, Store certification/update and school-policy tests
remain separate acceptance, not established by the hosted Server2022 run.
