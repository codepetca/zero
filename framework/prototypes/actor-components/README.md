# Actor components

Run this standalone prototype with the matching reviewed Zero core. Main owns one
ordinary `Actor[]` and explicitly calls the turning helper and `update(seconds)`
once per actor, then draws each actor. There is no second game loop.

The two actors share frame definitions and an animation source. The first starts
0.25 seconds ahead so the green/red initial frames make their independent clocks
visible. Loop uses `SpriteAnimation`; Once replaces it with the student-owned
`OnceAnimation`, which plays red → green → blue and holds blue. Each factory call
returns a new private playback clock. Drawing reads the frame cached by Actor and
never advances time. The source copies its input array with an ordinary loop.

Static image detaches playback. Procedural also detaches playback before switching
to a local gold circle and heading mark in `DemoActor.draw()`. These choices retain
position, display size, rotation and pause. Restart creates fresh actors, restores
the original geometry and staggered Loop mode, and resumes the game.

`zero.contrib.r12345.actor_tools.TurnTowards` is an ordinary student-owned helper,
not part of Zero core. Main calls it at 45 degrees per second. Positive angles go
clockwise on the canvas; exact 180-degree ties go counterclockwise. It validates
all inputs before mutation, bounds the turn to avoid overshoot and scales before
subtracting extreme coordinates. It never moves the actor. Students can extract,
check and share this helper using the independent core-dependent JAR protocol from
Phase2B; this local example does not claim a published or accepted ZeroHub artifact.

`actor-frames.png` is a deterministic 48×16 RGBA fixture: three solid 16×16 red,
green and blue tiles. The native maintainer driver also checks actual frame-center
pixels, swaps, geometry, invalid-input atomicity, independent clocks, bad-source
conformance and live pause/resume/restart. Browser and native acceptance are
separate recorded verification steps.

[Example core proposal](CORE-PROPOSAL.md) shows how a useful helper can become a
reviewable idea for Zero while preserving its source, attribution and existing
library versions. It does not adopt or publish a new API.
