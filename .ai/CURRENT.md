# Study class-refactoring tutorial — 2026-10-28

Owner asks for clearer use of classes to simplify Study tutorial Main. Local
implementation only; source PR/merge, template publishing and releases remain
separate. Branch codex/study-quiz-classes from main6d40f99b in this coordinator.
Do not touch the separate beginner-editor-guide worktree or parked ZeroJams.

Lesson6 first extracts Counter, then moves existing quiz controls/actions into
ordinary StudyQuiz. Main creates/shows its retained Column;7 grows StudyQuiz and
adds Question while Main stays unchanged. Lessons10–11 Study ScoreDisplay edits
now target StudyQuiz. No new framework API or inheritance. Checkpoints6/7/10study/
11study and finite harness stay aligned; behavior/independent views must pass.
No shared project-builder/template-byte or publication-record edits intended.

Native finite6/7/10study/11study,53 focused tests, source checks, website prepare
and all3 pinned-template checks pass. Checkpoint7 real WebFX/GWT build and actual
browser wrong/right/Next/3-of-3/restart pass. Next: independent teaching/correctness
review, then report student code. No installed editor/Windows/publication claim.
Keep all prior source delivery receipts in .verification/publish-fast/; PR221 is
merged6d40f99b with11checks passed; those changes are still separate from releases.
Evidence for this local work: .verification/study-classes/. Source/installedMac54
seals preserved; ordinary usage currently available; no credits/reset purchases.
