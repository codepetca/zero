# New Project

Build a project around your own idea: a study tool, game, drawing app, simulation
or another small interface. Start with the [minimal Zero starter template](https://github.com/codepetca/zero-starter/generate).
It supplies a working Hello, world! app, the Zero library, pinned build tools and
Run App configuration. You choose the interface, data and behaviour.

Before tutorial lesson 0, complete [GitHub account, school access and privacy setup](GETTING-STARTED.md#before-lesson-0-github-and-privacy).
Use your own verified account and Git 2.31+. Repositories created through Zero
are public, including source and included files; keep private material out.
Existing or GitHub-created repositories may be private under your teacher's policy;
invite the teacher as a collaborator when needed and check access. Publishing a
playable game remains optional.

## Create your own repository and clone it

1. Open the [minimal starter template](https://github.com/codepetca/zero-starter/generate).
   On GitHub, select
   your personal account as the owner, give the project your own name and follow
   your teacher's visibility instructions. Create the repository.
2. In **your new repository**, choose **Code → HTTPS** and copy its URL.
   Return to Zero, sign in, and choose **Project → Clone from GitHub…**. Paste
   your URL in **Clone from GitHub**. In **Clone location**, keep `~/Zero Projects`
   or choose another folder outside any Git repository, then choose **Clone here**.
   Newer VS Code versions open the clone in a new window automatically; the
   VS Code 1.95 fallback may ask you to choose **Open in New Window**.

   Terminal alternative with your own username and project name:

   ```sh
   git clone https://github.com/YOUR-USERNAME/YOUR-PROJECT.git
   cd YOUR-PROJECT
   ```

   Replace the username and project name with your own. The same commands work
   in macOS Terminal and Windows PowerShell when Git is installed.
3. The cloned root opens in Zero; choose **Run App**. If you cloned it earlier,
   use **Project → Open local project…** to open its existing Zero folder in a
   new window without cloning again. Your repository
   already contains the starting files on main; its origin points to your own
   repository. Check that Zero shows your own repository.
4. In the README, describe who your project is for, what it should do and the
   first small feature you will build. Commit & push this plan on main before starting
   a change branch. Follow [repository setup](GETTING-STARTED.md#your-github-repository)
   for native sign-in, per-repository commit identity and access.

Local Run App works without GitHub. GitHub actions are live by default. Commit & push
and branch changes keep explicit reviews; publishing is a separate action. First
Publish confirms its destination; later Publish actions update that approved site.
Follow [the individual workflow](GETTING-STARTED.md#your-individual-workflow)
when you are ready to push. Students develop and submit their own repositories.

## Tutorial repositories

The continuing tutorials use three empty templates: Greeting for lessons0–2,
Study for3–7 and Game for8–12. At each group's first lesson, choose **Start
tutorial** from Zero’s welcome or **…** menu and select the matching project.
Enter a name and choose a clone location (default `~/Zero Projects`). Zero creates
a public repository in your GitHub account from the verified template, then clones
and opens it. Its source and included files are public. The lesson page's
**Use template** action offers a separate GitHub creation route; follow your
teacher's visibility instructions there, then clone your own repository with
**Project → Clone from GitHub…**. Use **Project → Open local project…** for an
already-cloned Zero folder. Do not clone the teacher's shared repository directly. Open
`src/main/java/Main.java`, write the lesson’s ordinary Java and choose **Run App**.
Template links follow verified publication metadata; unavailable templates show
that state rather than an invented working link.

Sign in through Zero for pushes, check the connected account/repository, and
configure Git name/email in each repository. Personalize README, then Commit & push that
initial plan on main. For each lesson change: **New branch → edit and Run App →
Commit & push → Merge to main**. Keep the same repository across that group's
lessons. No mode switch is needed. Local Run after cloning uses read-only local
repository checks and needs no active GitHub session or network after caching.

Tutorials have no ZIP or unconnected local-folder alternative. Opening an
already-cloned tutorial repository with **Open local project…** keeps its Git
history and own GitHub origin. A ZIP, a folder inside another
Git repository or a clone still pointing at the shared template receives setup
guidance. This is teaching workflow validation, not tamper-proof provenance.
Publish app is available as an explicit optional action; its game/assets are
public. Ordinary ZeroHub contributions remain for separate original work. Lesson
11 has one explicit exception: the copied `tutorial-credits-badge` library from
the Coin repository belongs only in Tutorial practice, when hosted library
acceptance is enabled. Other tutorial games/libraries stay out of the community
catalogue. Submit tutorial
repository links in Pika only when the teacher assigns them; nothing is submitted
automatically.

## Build one feature at a time

1. Write one small task in your README or as a GitHub issue. State what someone
   should be able to do when it works.
2. Choose **New branch** (**Start a change** in older kits) and give it a descriptive name.
   Current source creates it locally from main; use **Update from main** first
   when you want newer completed work. New branch does not require sign-in.
3. Implement the feature and **Run App**. Check the usual result and one likely
   mistake or edge case. Update the README to describe the working feature.
4. **Commit & push** with a commit message explaining the change. Read your
   files and commit on GitHub so you can see what was pushed.
5. **Merge to main** merges your current branch into main and pushes main
   through Zero's reviewed individual workflow. If GitHub refuses a stale-main
   push, use **Update from main** to bring main into your feature without
   uploading. Resolve conflicts if needed, run the combined app and retry.
   Check the completed files on GitHub main.

Repeat this loop in the same repository. A new feature does not need a new
repository. Submit **your own repository link** separately in Pika, and give
your teacher access if it is private. A source-example link, a simulated push
or a branch push alone is not the completed project on main.

## Pull request practice

Once you are comfortable with branches and commits, practise the review step on
GitHub: open a pull request from your change branch, explain what changed and how
you checked it, respond to feedback, then merge the pull request. Follow
[GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow).

For this exercise, use GitHub's pull request merge **instead of Zero's Merge to
main**. Merge to main merges the current branch into main and pushes main; it
does not create a pull request. After merging on GitHub, use ordinary Git or VS Code Source
Control to switch to main, then choose **Update from main** to download the
updated main before starting another change (use ordinary Git pull in older kits). Zero currently has no team or pull request mode.

## Explore Drawing Pad

[Drawing Pad](https://github.com/codepetca/zero-drawing-pad) is a Codepet project
in ZeroHub's Projects collection. Draw with the mouse and explore its Java on
GitHub. Create your own repository from its template if you want to change it.
The tutorial projects remain with their lessons.
