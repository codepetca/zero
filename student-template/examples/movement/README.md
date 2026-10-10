# Move a square

Stop the app and save your current source outside `src/`. Copy **Main.java** and
**Player.java** from this folder into `src/main/java/`, replacing Main and any
old Player. Keep `src/main/java/zero/`. No Maven or resource changes are needed.
Choose one example Main at a time. Run App and click the canvas before using arrows.

Main reads the arrows, calls Player.update, then calls Player.draw. Player keeps
the 24 × 24 square inside the fixed 640 × 400 canvas. Its speed is 180 pixels per
second on each axis; diagonal movement is faster overall. Release stops movement;
losing canvas/window focus clears input. See [Lesson 8](../../lessons/08-movement.md)
for the progressive build.

`checks/MovementCheck.java` is a finite maintainer harness. It is not part of the
student copy; it controls frames deterministically and does not prove physical typing.
