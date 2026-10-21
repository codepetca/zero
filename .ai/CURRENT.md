# Start Page Project dropdown and Tutorials link — local source

Owner requested a Tutorials link and one Project button containing New, Clone,
and Open. Implemented in the managed start-page-project-menu worktree from
main a59662f4. No merge/publication request for these new controls; released Mac
remains0.5.38. Preserve primary education-funding changes.

Tutorials uses existing zero.openFirstLesson and opens the reader without a
project or GitHub sign-in. Start tutorial remains the guided project action.
Project opens an anchored accessible menu; New/Clone retain readiness checks,
Open works signed out. Arrow/Home/End navigation, Escape/Tab, outside dismissal,
busy/account transitions and status-update focus behavior are covered.

99affected tests and root configuration checks passed. Browser fixture checks
cover actual generated HTML in Chromium: light1000px, dark320px, keyboard/pointer,
signed-out/busy state and high-contrast/enlarged text. Review and acceptance
receipts are retained in .verification/start-page-menu; the final review receipt
records the reviewed revision and verdict. No native VSCode launch after the
previous Code Key popup; actual editor/Windows acceptance remains untested.

Keep this worktree available for a subsequent authorized release. Before any
publication, require the completed independent review, matching PR CI and a new
immutable installer version. Prior0.5.38 release completion evidence is preserved
in the primary .verification/keep-start-page-release0.5.38/completion.json.
