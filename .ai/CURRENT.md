# Actor prototype and game-system references — 2026-10-22

Owner agreed to an Actor superclass; implemented locally in this actor worktree
from origin/main bf2083a3. Player/Enemy extend Actor; Main explicitly updates and
draws instances. Centre coordinates, clockwise rotation, movement/aiming helpers,
images/regions/animation and synchronized API docs are in scope. No release,
push, PR, merge or website publication is authorized by this conversation.

Latest direction: use established game systems for reference before adding
World/UI abstractions. Greenfoot is the primary Java teaching reference; FXGL,
libGDX Scene2D and Godot inform UI/world/camera/input boundaries. Proposals and
links are in docs/GAME-SYSTEMS.md. World, camera and screen APIs are not implemented.

Native framework/Actor pixels and Zero Dev smoke pass. Website typecheck,
163tests and production build pass; local /docs search/entry verified. Guide
Player/Enemy/Main extracted for compilation. Full source tests and real WebFX
browser checks are running; independent review follows the stable snapshot.
Worker ownership finished: actor_docs owns five API/guide/reference files;
actor_browser owns browser contracts/adapters/fixtures/verifier/docs. Coordinator
owns Actor, native checks, assembly and final acceptance. Requested workers:
GPT6.1Sol/medium; effective configuration/time/tokens unknown. No rework reported.

Preserve primary funding checkout and tutorial-padding Dev scratch/profile/watcher
and unrelated edits. Last release reference: docs/EVIDENCE.md (Mac0.5.47).
