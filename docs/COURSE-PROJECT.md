# New Project

Build a project around your own idea: a study tool, game, drawing app, simulation
or another small interface. Start with the [minimal Zero starter template](https://github.com/codepetca/zero-starter/generate).
It supplies a working Hello, world! app, the Zero library, pinned build tools and
Run App configuration. You choose the interface, data and behaviour.

Before starting a tutorial project, complete [GitHub account, school access and privacy setup](GETTING-STARTED.md#before-lesson-0-github-and-privacy).
Use your own verified account and Git 2.31+. Repositories created through Zero
are public, including source and included files; keep private material out.
Existing or GitHub-created repositories may be private according to school policy;
invite the intended reviewer as a collaborator when needed and check access. Publishing a
playable game remains optional.

## Create your own repository and clone it

1. Open the [minimal starter template](https://github.com/codepetca/zero-starter/generate).
   On GitHub, select
   your personal account as the owner, give the project your own name and follow
   school privacy and visibility policies. Create the repository.
2. In **your new repository**, choose **Code → HTTPS** and copy its URL.
   Return to Zero, sign in, and choose **Project → Clone**. Paste
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
3. The cloned root opens in Zero; choose **Run**. If you cloned it earlier,
   use **Project → Open** to open its existing Zero folder in a
   new window without cloning again. Your repository
   already contains the starting files on main; its origin points to your own
   repository. Check that Zero shows your own repository.
4. In the README, describe who your project is for, what it should do and the
   first small feature you will build. Use **Commit**, then **Sync**, to save the
   plan on **main** before starting a branch. See [repository setup](GETTING-STARTED.md#your-github-repository)
   for sign-in and access.

After the build dependencies are cached, **Run** works offline. **Commit**
saves on your computer. **Sync** sends commits to GitHub. Publishing is a
separate action that makes the playable version available in a browser.

## Tutorial repositories

Follow the [tutorial guide](../student-template/lessons/README.md) for the
Greeting, Coin and Pet sequences. Start each project with **Project → New**
and follow its first lesson's starting-code instructions. Continue in the
same repository for the rest of that project's lessons. Use **Project → Open**
to return to a local clone.

Configure your Git name and email in each repository. The early lessons
practise **Commit** and **Sync** on **main**. Pet adds a local branch, a
discard exercise and **Merge** into **main**. Use your own repository for
the lessons and keep private material out of public projects.

Ordinary ZeroHub contributions remain for separate original work. Lesson
11 has one explicit exception: the copied `tutorial-credits-badge` library from
the Coin repository belongs only in Tutorial practice, when hosted library
acceptance is enabled. Other tutorial games/libraries stay out of the community
catalogue. Submit tutorial
repository links in Pika if your course uses it and requests them; nothing is submitted
automatically.

## Build one feature at a time

1. Write one small task in your README or as a GitHub issue. State what someone
   should be able to do when it works.
2. Start from a working checkpoint on **main**. Click the current branch name,
   choose **New branch…**, and enter a descriptive name.
3. Implement the feature and choose **Run**. Check the usual result and one likely
   edge case. Update the README to describe the working feature.
4. Save your files and choose **Commit** with a message explaining the change.
   Choose **Sync** to create or update your GitHub branch, then check its commit.
5. Choose **Merge** beside the branch name and confirm the merge into **main**.
   If GitHub **main** has newer changes, choose **Update from main** in the
   branch menu. Resolve any conflicts, run the combined app and try **Merge**
   again. Check the completed files on GitHub **main**.

Repeat this loop in the same repository. A new feature does not need a new
repository. Submit **your own repository link** separately in Pika if your course uses it, and give
the intended reviewer access if it is private. A source-example link, a simulated push
or a branch push alone is not the completed project on main.

## Pull request practice

Once you are comfortable with branches and commits, practise the review step on
GitHub: open a pull request from your change branch, explain what changed and how
you checked it, respond to feedback, then merge the pull request. Follow
[GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow).

Back in Zero, click the current branch name, select **main** from the local
branch list, then choose **Sync** to get the merged commits. Run the updated
project before starting another change.

## Explore Drawing Pad

[Drawing Pad](https://github.com/codepetca/zero-drawing-pad) is a Codepet project
in ZeroHub's Projects collection. Draw with the mouse and explore its Java on
GitHub. Create your own repository from its template if you want to change it.
The tutorial projects remain with their lessons.
