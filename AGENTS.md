# Zero

Read `.ai/CURRENT.md` and `docs/PRODUCT.md` before changing code. Read
`docs/DEVELOPMENT.md` for commands and verification when it exists.
Use `docs/AI-WORKFLOW.md` for bounded delegation, independent review and durable
handoffs. Keep CURRENT short; archived phase records are not active instructions.
For UI work, start with `design.md`, then read the canonical
`docs/UI-UX-GUIDELINES.md`. Preserve approved designs; shared light/dark playground
proposals require owner review before production visual changes.
The remembered website preferences in `design.md` are continuing owner defaults;
preserve them in future UI work unless the owner asks to change them.

- Zero is a local Java teaching kit: a VS Code extension/profile and a small
  JavaFX library. Preserve ordinary Java and explicit object updates.
- Students own their GitHub repositories and submit links separately in Pika.
- Never publish, push, deploy, or alter account credentials without explicit
  user authorization. Student GitHub actions default to live through explicit commands and guarded plans;
  optional simulation remains available for testing. Tutorials require students to create their own repository from the
  matching template and clone it; local running works offline after that setup.
- Keep the option-2 sidebar minimal. Use supported VS Code extension APIs.
- Preserve readable source and useful errors. Run the relevant checks; report
  untested operating systems and interactive flows accurately.
- Keep public API documentation synchronized with additions, removals, renames
  and behavior changes in the same PR. Update `student-template/API.md`,
  `student-template/APP-GUIDE.md`, website API metadata/examples in
  `website/lib/api-reference.mjs`, and the relevant API coverage tests. Run the
  API-reference checks and verify the website `/docs` entry reflects the change.
  Distinguish local/PR documentation updates from a published website update.
- One writer per component. Coordinate shared contracts before edits. Keep
  dependencies pinned and generated files out of Git.
