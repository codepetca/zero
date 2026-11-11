# Setup and troubleshooting

Use this guide to install Zero and start your first project. Follow the tutorials
to build in Java, learn to read documentation, practice GitHub workflows, and
publish an app others can open in their browser.

## Start here

1. Download Zero from the [downloads page](https://zero.codepet.ca/downloads).
2. On Mac, open the downloaded DMG and drag **Zero** into **Applications**. On Windows, open the installer and follow its prompts.
3. Open **Zero** and allow it to finish setting up. An internet connection is needed for the first setup and to download project dependencies.
4. Choose **Zero Docs** on the Start Page to open the latest lessons without signing in.
5. When you are ready to create a project, choose **Sign in to Zero** separately and follow the browser prompts. If asked to install the Zero GitHub App, choose the repositories Zero may access.
6. Choose **Project → New**, then follow the lesson to add its starting code.

In an older released Zero, choose **Tutorial options → Tutorial docs** to open the lessons without signing in.

Already have a project? On the Start Page, choose **Project → Open** to open a local project, or **Project → Clone** to download your GitHub repository.

## Before lesson 0: GitHub and privacy

[Lesson 0: Back to Zero](https://zero.codepet.ca/tutorials/15) can be read without a project or account. To create and save a tutorial project, use your own [GitHub account](https://github.com/signup). Follow any applicable device and network policies. Keep passwords, tokens and other private information out of your project files.

Repositories created through Zero are public. Publishing an app also makes the app and its included assets public. Review what you share first.

## One-time setup

Zero prepares its editor and Java tools when you open the app. If setup cannot finish, check your internet connection and open Zero again. On a managed device, your device administrator can help with installation or network access.

For other installation options, use the instructions included with the download you chose.

## Edit and run

1. Open a project and select a file in **Project Explorer**.
2. Make a change and choose **Run**. For a game, click its canvas before using the keyboard.
3. If a build fails, read the message in Zero or the terminal, fix the code and try again.

To find Zero again, open the Command Palette with **Cmd+Shift+P** on a Mac or **Ctrl+Shift+P** on Windows. Type **Zero: Show Sidebar**, **Zero: Show Project Explorer**, **Zero: Start Page**, or **Zero: Tutorial docs**. [Back to Zero](https://zero.codepet.ca/tutorials/15) walks through these steps.

## Your GitHub repository

Check the repository and branch shown in Zero. Save your files, enter a
message and choose **Commit** to save a checkpoint on this computer.
Choose **Sync** to send your saved commits to GitHub. Open your repository
and check that the matching branch shows your commit.

If sign-in or access fails, check your internet connection, sign in again and follow Zero's prompts. If GitHub asks which repositories the Zero GitHub App can access, include the repository you want to use.

## Your individual workflow

1. In the **Project** panel, click the current branch name and choose
   **New branch…**. Enter a name for the change.
2. Edit and **Run**. When the change works, choose **Commit**, then **Sync**.
   The first Sync creates the matching branch on GitHub.
3. Choose **Merge** beside the branch name and confirm the merge into
   **main**. Zero sends the merged **main** to GitHub and keeps the feature
   branch. If there is a conflict, resolve it in Source Control and test again.

The [Pet tutorial](../student-template/lessons/17-pet-class.md) practises this
flow with a small experiment you can discard before committing.

## Publish your playable app

Run and test your app first. To share it, choose **Publish & open app** from the arrow beside **Run** and follow the prompts. The published app and its included assets are public. Wait for the browser to open, then test the published version.

## Troubleshooting

- **Can't find the sidebar or Start Page?** Follow [Back to Zero](https://zero.codepet.ca/tutorials/15).
- **Zero won't open or finish setup?** Check your internet connection, close Zero and open it again. If needed, download the installer again.
- **Run fails?** Read the error in Zero or the terminal and check the code and project files. Use **Troubleshooting → Test installation** to check the bundled example separately.
- **GitHub actions fail?** Check that you are signed in, the repository is accessible, and your connection is working. Zero displays the next action when it can identify the problem. If Git asks for your name or email, follow [GitHub’s guide to setting your commit name](https://docs.github.com/en/get-started/git-basics/setting-your-username-in-git) and [commit email](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).
- **Need to update Zero?** On Mac, use **Zero: Check for Updates**. On Windows, follow the update instructions for the installer you used.
