# Microsoft Store package correction — 2026-10-28

Owner authorizes correcting the Store package and validating actual MSIX behavior;
coordinator Sol High, suitable bounded work/review Terra Medium or High. Keep
beginner guide and ZeroJams held. Public Mac/Windows preview/kit0.5.55 and updated
tutorials/templates are released; PRs223,224,226 merged. Store upload0.5.55 failed
with generic transfer/processing errors, not a specific validation diagnosis.

Audit found actual manifest version0.5.55.0 violates documented Store positive-major
requirements, despite Windows SDK packing/unpacking and exact archive/block hashes
passing. Existing Windows install/JavaFX receipts exercised EXE, not MSIX. Assigned
identity/publisher match Partner Center. Package remains unsigned and uncertified.

Branch codex/store-package-version starts from main5cddd93d (license PR227,
next local kit0.5.56 already prepared there). Map product major+1 for Store
versions:0.5.56→1.5.56.0,1.0.0→2.0.0.0; enforce upper bound and ordering tests.
Do not overwrite prior artifacts. No new Mac release is part of this correction.

In progress: real disposable Windows MSIX installation check, independently
reviewed source, required CI and new source-bound candidate. Keep original unsigned
candidate immutable; any ephemeral test signing uses a separate copy only in a
throwaway hosted runner. Store certification, physical Windows/school acceptance
and Store-delivered upgrades remain distinct. No final certification submission
without explicit user instruction.
