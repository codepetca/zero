# Zero Collector

A complete small top-down game built with Zero and ordinary Java. Collect eight
coins while three drones chase you. Your robot has three health. Fire pulses to
disable a drone for 2.5 seconds and open a route to the next coin. Collect every
coin while surviving to win; losing all health ends the round.

Start with a separate copy of the current Zero starter. Copy the five Java files
in this folder into `src/main/java/`, replacing the starter's `Main.java`. Copy
this folder's `resources/media-demo/` into `src/main/resources/media-demo/`.
Run App, then choose **Play new round**. This example needs the current local
Zero source with letter keys and primary-pointer input; older published kits
may need an explicit framework update. Browser export uses the same Java source.

| Action | Control |
| --- | --- |
| Move and turn | Arrow keys or W A S D |
| Fire in the facing direction | Hold Space |
| Aim and fire at a point | Hold the primary mouse button on the arena |
| Pause | Escape or Pause |
| Resume | Resume button (updates and gameplay keys stop while paused) |
| New round | Restart button or R while the arena is active |
| Read the title and help | Help button; Play starts a fresh round |

Click the arena if a UI control has keyboard focus. Tab still reaches the native
buttons. A white outline marks 1.2 seconds of protection after damage. Disabled
drones turn gray and display a dash, then recover in the same place. Coins count
once; disabling a drone does not change the coin score. A fatal hit on the same
frame as the last coin ends in a loss. Restart clears health, coins, drones,
pulses, timers, and any pause.

`Main` owns the round's explicit state, score, collision rules, and update order.
Each frame it calls `update(seconds)` once on the player, each drone, and each
pulse. Static coins need no update. Each actor draws itself around local `0, 0`;
`draw(actor)` applies its position and rotation without updating it. `Player`
uses `face` and `moveForward`, and `Enemy` uses `moveToward`. Pulse collision checks
the segment travelled during the frame so a fast shot cannot skip a drone.
Movement uses seconds, and diagonals keep the same speed. There is no automatic
world, game engine, or second update loop hidden in this example.

Try one change at a time: move a coin, adjust a drone's speed, change the player's
health or fire interval, add a new drone to the array, or replace an actor's
drawing. For a larger extension, build a second level with its own coin/enemy
arrays, or extract the HUD into a reusable Zero component. Keep `Main` as the
single owner of updates while experimenting.

The 32 × 32 robot and short PCM chime are the existing original Zero media-demo
assets, covered by the repository MIT license. `loadImageRegion` and `loadSound`
load them once. Sound is feedback only; all game state is visible without it.
This source uses only `zero.*` and `java.*`; no JavaFX bridge is needed.
