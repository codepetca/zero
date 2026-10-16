# Hello, Java checks

From the repository root, after ensuring no other finite JavaFX check owns the
native GUI:

```sh
python3 student-template/examples/hello-app/checks/verify.py
```

The verifier copies the exact canonical Main into a temporary standalone starter
whose path contains spaces, without copying a stylesheet. The pinned wrapper
compiles and opens a finite native JavaFX harness. It checks blank and whitespace
input, trimmed names, greeting button and Enter action, reset, scene focus after
reset, a second greeting, disabled-button behavior, heading typography, ordinary
control focus traversal, wrapping text, layout spacing/padding and initial layout
containment. The original starter Main remains byte-identical.

Native snapshots of the initial, greeting and reset-focus views are written to
ignored `.verification/hello-app/`, or `ZERO_HELLO_EVIDENCE` when provided.
Temporary project classes are deleted. The check adds no runtime dependencies.

Controls use the platform theme. Custom stylesheet colours, hover/pressed rules
and a missing-stylesheet error are not default app requirements. The adjacent
`theme.css` remains an optional native reference, outside the browser profile.

Action events are synthetic. Scene focus and focus-traversable checks do not
prove physical Tab/Space/Enter delivery or operating-system window focus.
Rendered snapshots support visual inspection; they do not establish accessibility
conformance. Windows, school restrictions, VS Code Run/Stop and novice classroom
interaction need their separate acceptance checks. Browser checks compile and
exercise the actual canonical example through the release verifier.

Earlier 2026-10-09 CSS-based native results applied to the previous Hello source;
they do not verify this browser-compatible revision. Current check receipts are
kept under the active ignored release-readiness evidence directory.
