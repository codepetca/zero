# Tutorial pathway: implementation plan

Status: local work in progress. This plan does not claim a published tutorial,
template or release. Existing student projects retain their own source and builds.
The public original-project starter currently lacks APIs and browser tooling used
by lesson 14; its updated draft needs separate publication and verification.

## Student path

1. **Greeting:** make a small interactive app; commit and push; publish and test.
2. **Coin:** move a player, collect coins and keep score; save checkpoints;
   publish and test the game.
3. **Pet:** show an animated pet, move it and play a sound. Save the working
   version on main, make a branch, refactor into a Pet class, test unchanged
   behavior, commit/push and merge. Publish. Confirm source and assets on GitHub,
   protect untracked/ignored work, move the local folder to Trash and re-clone
   the student's own repository; run the recovered game.
4. **Make your own:** use Project → New for an original project; build and
   personalize a pleasant title screen and a simple scene with Start/Back.
   Offer a HUD as an optional extension. Commit/push, publish and test.

Optional tutorials: the Study quiz and a clearly labelled tutorial-practice
component contribution. Preserve the existing legacy lessons and accessible
addresses; explain any prerequisite projects rather than silently changing them.
Publication of personal work is public and requires school/teacher permission;
provide an appropriate alternative where a school account cannot use Pages.

## Delivery and acceptance

1. **Lessons and reference projects:** Write incremental instructions and
   runnable checkpoints using Zero and ordinary Java. Supply permitted assets;
   Pet must use real sprite animation and sound. Compile each checkpoint.
2. **Integration:** Connect the main and optional paths to the editor and website,
   original-project creation and tutorial starters. Keep old links and project
   markers valid. Never infer public template verification from a local build.
3. **Verification:** Test progression, native and real WebFX browser output,
   animation, navigation and audio where observable; check Git instructions
   against the current interface and independently review the full change.
4. **Delivery:** Source PR/CI/merge, public template publication and verification,
   website deployment and application releases each require their own applicable
   authorization and acceptance checks. A local draft is not a published lesson.
