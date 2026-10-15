# New Project

Build a project around your own idea: a study tool, game, drawing app, simulation
or another small interface. Start with the [minimal Zero starter](https://zero.codepet.ca/hub?kind=example&example=zero-starter).
It supplies a working Hello, world! app, the Zero library, pinned build tools and
Run App configuration. You choose the interface, data and behaviour.

The four practice projects in ZeroHub are examples to explore and modify. You do
not need to complete all four or base your course project on a finished example.
The optional advanced projects can wait until you need their techniques.

## Create your own repository and clone it

1. On the [minimal starter page](https://zero.codepet.ca/hub?kind=example&example=zero-starter),
   choose **Use template** when that action is available. If the page instead
   offers **Get starter**, follow the ZIP alternative below. On GitHub, select
   your personal account as the owner, give the project your own name and follow
   your teacher's visibility instructions. Create the repository.
2. In **your new repository**, choose **Code → HTTPS** and copy its URL.
   In a terminal, clone it into a folder outside any other Git repository:

   ```sh
   git clone https://github.com/YOUR-USERNAME/YOUR-PROJECT.git
   cd YOUR-PROJECT
   ```

   Replace the username and project name with your own. The same commands work
   in macOS Terminal and Windows PowerShell when Git is installed.
3. Open that cloned root folder in Zero and choose **Run App**. Your repository
   already contains the starting files on main; its origin points to your own
   repository. Connect that same repository in Zero if prompted.
4. In the README, describe who your project is for, what it should do and the
   first small feature you will build. Upload this plan on main before starting
   a change branch. Follow [repository setup](GETTING-STARTED.md#your-github-repository)
   for native sign-in, per-repository commit identity and access.

Local Run App works without GitHub. GitHub actions are live by default. Upload
and branch changes keep explicit reviews; publishing is a separate action. First
Publish confirms its destination; later Publish actions update that approved site.
Follow [the individual workflow](GETTING-STARTED.md#your-individual-workflow)
when you are ready to upload. Students develop and submit their own repositories.

## Tutorial repositories

The continuing tutorials use three empty templates: Greeting for lessons0–2,
Study for3–7 and Game for8–12. At each group's first lesson, choose its verified
Use template action, create your own repository, then clone your repository using
**Git: Clone** in VS Code or `git clone` with your own HTTPS URL. Do not clone the
teacher's shared repository directly. Open the clone's root folder in Zero.
These new tutorial templates require publication before the candidate is released;
pending templates are unavailable rather than presented as working links.

Sign in through Zero for uploads, check the connected account/repository, and
configure Git name/email in each repository. Personalize README, then Upload that
initial plan on main. For each lesson change: **New branch → edit and Run App →
Upload changes → Finish change**. Keep the same repository across that group's
lessons. No mode switch is needed. Local Run after cloning uses read-only local
repository checks and needs no active GitHub session or network after caching.

Tutorials have no ZIP/local-folder alternative. A ZIP, a folder inside another
Git repository or a clone still pointing at the shared template receives setup
guidance. This is teaching workflow validation, not tamper-proof provenance.
Publish app is available as an explicit optional action; its game/assets are
public. ZeroHub contributions remain for separate original work. Submit tutorial
repository links in Pika only when the teacher assigns them; nothing is submitted
automatically.

## ZIP alternative for original example projects

Choose **Download ZIP** in ZeroHub, extract it into a new standalone folder and
open it in Zero. A ZIP has no Git history. Create an **empty repository in your
own GitHub account**, leaving GitHub's README, license and .gitignore options
unchecked, connect that repository in Zero and make the initial **Upload changes**
on main. This is the alternative to creating and cloning from a template.

## Build one feature at a time

1. Write one small task in your README or as a GitHub issue. State what someone
   should be able to do when it works.
2. Choose **New branch** (**Start a change** in older kits) and give it a descriptive name.
3. Implement the feature and **Run App**. Check the usual result and one likely
   mistake or edge case. Update the README to describe the working feature.
4. **Upload changes** with a commit message explaining the change. Read your
   files and commit on GitHub so you can see what was uploaded.
5. **Finish change** using Zero's reviewed individual workflow. If Zero pauses
   after combining updated main with your branch, run the combined app before
   continuing. Check the completed files on GitHub main.

Repeat this loop in the same repository. A new feature does not need a new
repository. Submit **your own repository link** separately in Pika, and give
your teacher access if it is private. A source-example link, a simulated upload
or a branch upload alone is not the completed project on main.

## Pull request practice

Once you are comfortable with branches and commits, practise the review step on
GitHub: open a pull request from your change branch, explain what changed and how
you checked it, respond to feedback, then merge the pull request. Follow
[GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow).

For this exercise, use GitHub's pull request merge **instead of Zero's Finish
change**. Finish change merges the individual change directly and does not create
a pull request. After merging on GitHub, use ordinary Git or VS Code Source
Control to switch to main and pull the updated main before starting another
change. Zero currently has no team or pull request mode.

## Practice project templates

Each project page offers its verified template link or a complete source ZIP.
Choose one to practise
making a small change; you do not need to clone one large collection.

| Template | Starting point |
| --- | --- |
| [Minimal starter](https://zero.codepet.ca/hub?kind=example&example=zero-starter) | Your original course project |
| [Hello, Java](https://zero.codepet.ca/hub?kind=example&example=hello-app) | Greeting and styling |
| [Study session](https://zero.codepet.ca/hub?kind=example&example=study) | Questions and scoring |
| [Collect the coins](https://zero.codepet.ca/hub?kind=example&example=coin-game-component) | Movement and game rules |
| [Drawing pad](https://zero.codepet.ca/hub?kind=example&example=drawing) | Mouse input and a brush |

Use a template to create your own repository, then clone that repository. The
teacher's template remains the starting point; your changes belong in your copy.
For an advanced project or tutorial checkpoint, the standalone ZIP remains available.
