# Move a square

To run the completed example, create a new local project from a fresh Zero starter and copy **Main.java** and **Player.java** into its `src/main/java/`. Keep this sample off GitHub. Click Run App, then click the canvas before using arrows.

Main reads the arrows, calls Player.update, then calls Player.draw. Player keeps
the 24 × 24 square inside the fixed 640 × 400 canvas. Its speed is 180 pixels per
second on each axis; diagonal movement is faster overall. Release stops movement;
losing canvas/window focus clears input. See [Lesson 8](https://zero.codepet.ca/tutorials/8)
for the progressive build.

`checks/MovementCheck.java` is a finite maintainer harness. It is not part of the
student copy; it controls frames deterministically and does not prove physical typing.
