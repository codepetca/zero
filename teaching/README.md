# Continuing learning projects

`projects.mjs` defines three local practice groups. `starters/` contains the empty
Main shells. `scripts/lesson-projects.mjs` assembles the same minimal project bytes
for website ZIPs and the native extension bundle. Optional game assets come from
the canonical `student-template/examples/media-demo/resources/` source.

`checkpoints/` contains completed maintainer programs, outside student starters.
Their directory numbers are stable historical identifiers, not the displayed lesson
numbers. Public comparison links are optional references after students write code.
Current lessons 9–10 refactor the Coin game and practise sharing a harmless
CreditsBadge; duplicates belong in the reserved practice area. Historical Study
checkpoints remain for existing links and are not a current tutorial prerequisite.
Checkpoint 10 has arrow-only PlayerInput; 11 and 12 include the optional WASD
improvement. Media and scrolling preserve that source unchanged, along with CreditsBadge.
`checkpoints/11/practice/` contains three small actual-JAR
check/example sources for the extracted badge; replace their fixture package
import with the student repository namespace. Larger platform/
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
