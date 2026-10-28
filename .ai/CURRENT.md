# Store MSIX — required WACK validation unresolved, 2026-10-28

User authorizes package corrections/Windows validation for a ready-to-upload MSIX.
Store submission/public app/site releases are separate; beginner guide/ZeroJams held.
Branch codex/msix-wack, draft PR229, mainbaseb6a9acbc. No merge while gate fails.
Product0.5.56→Store1.5.56.0. Existing releases/prior candidate bytes immutable.

Corrected Store x64 PE + config, PMv2/96-DPI launcher setup, explicit locked
win-x64 restore, strict WACK execution/report binding/retention are reviewed.
Windows SDK pack/unpack/hash/block-map and test-signed MSIX deploy/integrity/
cleanup pass. Shared EXE launcher actual HWNDPMv2, real install/bootstrap/reopen,
private-Java JavaFX window/offline rebuild pass. Do not claim installed-MSIX
runtime, physical scaled/multimonitor or Windows10/11 desktop acceptance.

Required WACK DPIWARNING persists; detailed traces show infrastructure COM E_FAIL
in BinaryInfoClass.IsPerMonitorV2DPIAwarenessSet for Zero AND both minimal controls.
Controls prove livePMv2 (checked APIcontrol alsoTRUE). Reproduced native x64
Server2022 andServer2025, tool26100.7705/.9457. All required non-PASS still fail;
optional blocked-executables finding retained separately. Windows11ARM image lacks
WACK and its emulatedcontrol startup timedout: NOcertification proof there.

Exact candidate from run40742412970, cleancheckout20cc47e5/producthead371aa6cf:
73423da90df584b6b989f3a4ac9f742160de5bf32a3e477385cb2f20ae27530d.
Downloads/Zero-Store-0.5.56-validation-pending contains immutable MSIX, receipts,
reports,checksums, nextcheck instructions and unsentMicrosoftsupportdraft.
Latest native diagnostic40751347336/source431ccad4 retained ignored in
.verification/wack-40751347336; prior diagnostics indexed in docs/EVIDENCE.md.

Next requires native Intel/AMD Windows10/11 WACK or Microsoft's guidance on the
shared COM error. Avoid speculative product changes or weakening the gate.
SolHigh implementation/review receipts and cumulative corrections are in EVIDENCE;
existing owner task-scoped workflow-cap waiver retained, correctness gates intact.
Current diagnostic helpers are manual-only, guarded disposable hosts, read-only
artifact credentials, exact package binding, temporary signing/control cleanup.
No Store submission, release, public website change or certification success.
