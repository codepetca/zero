# Actor-owned drawing — active, 2026-10-23

Owner authorized Actor drawing tools and beginner Player/Coin own drawing with
real WebFX proof. Worktree /Users/stew/.codex/worktrees/actor/zero, base
553b266768b4e372aabb7b24074806631ce97266. Local implementation only; no push,
PR/merge/install/release/deploy/account changes. Preserve primary funding and
other tutorial-padding Dev scratch/profile/watcher state. Use source Zero Dev.

Contract: Actor(x,y), draw() callback, GameApp.draw(Actor), ten protected drawing
helpers using zero.Color. Main explicitly draws/updates; no global current app,
automatic registration/update, new World/Screen or public context plumbing.
Legacy sprite constructors/draw(GameApp) retained. Actor has per-instance drawing
context; canvas save/translate/rotate and context restoration in finally. Default
shape size1x1; setSize does not scale custom coordinates. Nested scopes compose
parent transforms. Helpers outside an active rendering scope fail usefully.
Public/protected API target159declarations, same13helper files.

Ownership: retained actor_review Sol/high writes Actor/GameApp and ActorCheck;
actor_docs Sol/medium writes API/guide/website metadata+coverage; actor_browser
Sol/medium owns browser pins/contracts/tests/fixtures, actual builds and browser
proof after runtime/native freeze. Coordinator owns beginner files, assembler,
shared native game harness and completion evidence/review. No recursive workers.

Beginner now has its own Player/Coin extends Actor and draw() methods. Main keeps
all UI and calls draw(actor). Player uses inherited movement (faces travel);
Coin uses x()/y() for collision and skips collected artwork. Shared native driver
supports both ordinary and Actor player; structured game unchanged. Native/WebFX
verification and independent review pending; no new passing claims yet.

Storage273.574GB healthy; weekly0% used at start (shared-account reading, not cost).
DeepSeek remains paused per prior record. Required checks: meaningful native Actor
pixels/state/failure/nesting + framework suite, native prototypes, Dev smoke
(report known focus gap honestly), focused API/browser gates, actual pinned WebFX
and browser helper/navigation/actor/beginner behavior, website tests/build/docs
anchors, npm check/diff and independent source review. Prior browser timeout and
unrelated fixtures can be reused explicitly if unchanged. Known prior Dev focus
assertion fails separately. No physical-input/other-OS/device claims.

Previous beginner accepted b95d89bf, receipt553b2667; earlier game/navigation
proofs and review history in docs/EVIDENCE.md. Next integrate frozen workers,
verify then review a fixed complete diff; record exact revisions and results.
