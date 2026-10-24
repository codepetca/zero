# Build with Zero: Lessons 0–12

Build **three projects**, adding to your own code across lessons. Start each
project once. Keep the same folder for every lesson in that group.
Illustrations show the intended result; native controls vary by platform.

| Project | Lessons | What grows |
| --- | --- | --- |
| Greeting app | [0](00-hello-world.md), [1](01-hello-button.md), [2](02-hello-name.md) | Label → button → name input |
| Study quiz | [3](03-quiz.md), [4](04-counter.md), [5](05-methods.md), [6](06-objects.md), [7](07-study-app.md) | One question → attempts → reset methods → Counter object → question array and scoring |
| Coin game | [8](08-movement.md), [9](09-coin-game.md), [10](10-components.md), [11](11-zerohub.md), [12](12-media.md) | Player → coins/win/restart → refactor input and score display → improve/check/propose → optional media |

The intermediate steps stay in these same small projects. Lesson 10 refactors
the Coin game’s busy Main into a PlayerInput helper, then reopens Study and Game
to reuse ScoreDisplay. Lesson 11 practises compatible improvements and a local
contribution proposal. Sharing is optional and uses
an original project of your own, separate from these three practice folders.
Lesson 12 adds optional artwork/sound and a small scrolling extension; larger
games are outside the core tutorial.

## Start a lesson

Before lesson 0, complete [account/privacy setup](https://zero.codepet.ca/docs/setup#before-lesson-0-github-and-privacy)
and [Zero setup](../README.md#first-setup): your own verified GitHub account,
Git 2.31+, school access and teacher approval for public tutorial source.
Repositories created through Zero are public, including source and included
files; keep secrets and private material out. An existing or GitHub-created
private repository can retain its visibility; invite your teacher as a
collaborator there and verify access. Publishing a playable game is optional.
At lessons **0, 3 and 8**, choose **Start tutorial** from Zero’s welcome or **…** menu
and select the matching project. Enter a name and choose a clone location
(default `~/Zero Projects`), then choose **Clone here**. Zero creates a public
repository in your GitHub account from the verified template and opens its clone.
You can instead use **Use template** on the tutorial page to create a repository
on GitHub, then clone your own repository through **Project → Clone from GitHub…**.
For an already-cloned Zero folder, use
**Project → Open local project…** to open it without cloning.
Do not clone Zero's shared template directly. There is no tutorial project ZIP
or unconnected local-only folder path in this candidate. Template links follow verified
publication metadata; unavailable templates show that state instead of an
invented working link.

Each template has an empty runnable `Main.java` and build/framework setup.
The first run opens a blank app window or canvas. You write the controls,
game objects and logic. Completed lesson programs are not supplied as starters.

Sign in through Zero for pushes and configure Git name/email for each repository.
Write a short plan in README, then Commit & push that first change on main. For each
lesson improvement: **New branch → edit and Run App → Commit & push → Merge to
main**. Commit & push creates a commit when needed and pushes the current branch.
Merge to main merges your branch into main and pushes main. Review before pushing
or merging. Keep the same repository across
that group's lessons. After editing, Run App again; click the canvas before using
game keys. Once cloned, running needs no active GitHub session and works offline
after compiler dependencies are cached.

The only optional lesson download is the [image and sound ZIP](https://zero.codepet.ca/generated/learning-assets/game-assets.zip)
in lesson12. You can use your own assets or keep the drawing fallback. Publishing
a playable page is optional and explicit; it makes the app/assets public. ZeroHub
contributions use separate original projects. See [repository setup](../../docs/COURSE-PROJECT.md#tutorial-repositories).

## Check your work

Follow each numbered run/test step and record the result. Read [teacher notes](TEACHER.md) and
[the API](../API.md) when needed. Coursework links from your own original repository
go separately to [Pika](../README.md#your-repository-and-pika).
For controls in games and reusable views, read [UI and app/game flow](../UI.md).
