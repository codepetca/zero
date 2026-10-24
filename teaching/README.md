# Continuing learning projects

`projects.mjs` defines three local practice groups. `starters/` contains the empty
Main shells. `scripts/lesson-projects.mjs` assembles the same minimal project bytes
for website ZIPs and the native extension bundle. Optional game assets come from
the canonical `student-template/examples/media-demo/resources/` source.

`checkpoints/` contains completed maintainer programs for the end of each lesson,
with separate Study/Game consumers at 10 and 11, and optional media/scrolling at 12.
They are outside every practice download. Public source comparison links are
optional references after students write their code. Keep narrative snippets and
these checkpoints aligned; do not use a completed checkpoint as a student scaffold.
Lessons 10–11 refactor input/score presentation in the existing small projects,
then improve and propose a component. Main keeps game rules and explicit updates.
Checkpoint 10 has arrow-only PlayerInput; 11 and 12 include the optional WASD
improvement. Media and scrolling preserve that source unchanged. Larger platform/
level/endings examples remain reference material outside the core tutorial.

Verification uses temporary projects built from the actual minimal scaffolds:

```sh
node scripts/verify-lesson-projects.mjs
node scripts/verify-project-progression.mjs
```

The first compiles empty starts. The second runs finite JavaFX assertions against
reviewed maintainer source only, including both media-absent and media-present
modes. It needs a JavaFX-capable display/audio environment; CI supplies Xvfb and
virtual audio. `--compile-only` explicitly limits it to compilation, and
`--only=7` selects a checkpoint. No student files, Git operations or public
contribution executor are inputs. Automated state checks do not establish novice
usability, physical Windows behavior, native editor click-through or audible sound.
