# Build with Zero: Lessons 0–12

Build **three projects**, adding to your own code across lessons. Start each
project once. Keep the same folder for every lesson in that group.
Illustrations show the intended result; native controls vary by platform.

| Project | Lessons | What grows |
| --- | --- | --- |
| Greeting app | [0](00-hello-world.md), [1](01-hello-button.md), [2](02-hello-name.md) | Label → button → name input |
| Study quiz | [3](03-quiz.md), [4](04-counter.md), [5](05-methods.md), [6](06-objects.md), [7](07-study-app.md) | One question → attempts → reset methods → Counter object → question array and scoring |
| Coin game | [8](08-movement.md), [9](09-coin-game.md), [10](10-components.md), [11](11-zerohub.md), [12](12-media.md) | Player → coins/win/restart → shared score display → optional media and larger world |

Lesson 10 reopens both Study and Game to reuse the class you wrote. Lesson 11
practises a compatible component change locally. Sharing is optional and uses
an original project of your own, separate from these three practice folders.
Lesson 12's larger game stages are optional extensions of the same Game project.

## Start a lesson

Complete [setup](../README.md#first-setup), including Git and a GitHub account.
At lessons **0, 3 and 8**, use **Use template** on the tutorial page or choose
**Zero: Start project**. Create a repository in **your own account**, then use
**Git: Clone** in VS Code to clone **your repository** and open its root folder.
Do not clone Zero's shared template directly. There is no tutorial project ZIP
or local-only folder path in this candidate. The new templates still require
verified publication before this candidate is released; unavailable templates
show that state instead of an invented working link.

Each template has an empty runnable `Main.java` and build/framework setup.
The first run opens a blank browser preview or canvas. You write the controls,
game objects and logic. Completed lesson programs are not supplied as starters.

Sign in through Zero for uploads and configure Git name/email for each repository.
Write a short plan in README, then Upload that first change on main. For each
lesson improvement: **New branch → edit and Run App → Upload changes → Finish
change**. Review before uploading or merging. Keep the same repository across
that group's lessons. After editing, Run App again; click the canvas before using
game keys. Once cloned, running needs no active GitHub session and works offline
after compiler dependencies are cached.

The only optional lesson download is the [image and sound ZIP](https://zero.codepet.ca/generated/learning-assets/game-assets.zip)
in lesson12. You can use your own assets or keep the drawing fallback. Publishing
a playable page is optional and explicit; it makes the app/assets public. ZeroHub
contributions use separate original projects. See [repository setup](../../docs/COURSE-PROJECT.md#tutorial-repositories).

## Check your work

Try each Done check and record the result. Read [teacher notes](TEACHER.md) and
[the API](../API.md) when needed. Coursework links from your own original repository
go separately to [Pika](../README.md#your-repository-and-pika).
For controls in games and reusable views, read [UI and app/game flow](../UI.md).
