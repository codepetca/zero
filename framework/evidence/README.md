# Exact API evidence (pending)

`api-signatures.json` records all 183 attributed source declarations, including
protected hooks, constants and exact overloads. `coverage-gaps.json` identifies
the 92 declarations still lacking assertion mappings on either target. The 91
mapped declarations have direct Java calls and checked observed state, not a
JavaScript stand-in for invocation. No framework target is counted as executed
by source generation, mapping, compilation, or collector unit tests.

The four mapped native cases are ActorCheck, UiCheck, GameHelpersCheck and
AudioCheck. They run within the existing seven-case native harness. The four
browser families are helpers, zero-ui, audio and lifecycle. A source inventory
change invalidates all old receipts. Native stdout and browser canvas text carry
ordered Java invocation/postcondition events; the trusted harness retains those
bytes, converted events, compiled output, and actual input digests. Reports
recheck current core, contract, producer, fixture/harness and tool bytes.

After an authorized actual run:

```
node scripts/verify-framework.mjs --only=ActorCheck,UiCheck,GameHelpersCheck,AudioCheck --evidence=.verification/api-evidence
node scripts/verify-web-export.mjs --only=helpers,zero-ui,audio,lifecycle --browser --output .verification/web-export-checks
node scripts/api-evidence.mjs --report --receipts .verification/api-evidence
node scripts/api-evidence.mjs --report --receipts .verification/web-export-checks/api-evidence
```

The native and browser receipt directories can be copied into one directory
(their case names differ) for a combined `--require-complete` report. That gate
must continue failing until all 366 target outcomes have current executed proof.
Receipt files are local trusted-harness evidence, not cryptographic attestation
against a hostile writer. Platform/UI/media behavior still requires real runs.

Lifecycle has a UI-only menu, a game first-frame path, and independent setup,
update, draw, UI-callback, shutdown and missing-asset fault controls. Its harness
reloads between faults and injects an actual rejected browser promise. Parent
preview protocol tests establish message-port identity and lifecycle messages;
these fixture assertions establish observed UI/frame/error behavior only.
