# Recovering a blocked Zero connection lock

This procedure applies to the local, unreleased GitHub App connection. It repairs
an abandoned lock after a crash; it does not activate or authorize the registered
Codepet Zero App.
Local editing and Run remain available without the connection.
The diagnostic links to this canonical GitHub guide so installed kits need no
checkout of Zero's source. Publish this guide before activating or releasing the
connection. The App is registered and its public IDs are pinned, while live
acceptance, production activation and an authorized native release remain pending.

`connection-busy` normally means another Zero editor is using the connection.
Wait for it to finish. `connection-lock-repair-required` means the bounded wait
found an existing recovery guard or ownership that Zero could not safely verify.
Zero does not automatically remove a live or unknown recovery guard. An empty
guard can be left if an editor crashes immediately after reserving the file.

1. Save your work. Copy the **Lock directory** from the diagnostic in Zero Output;
   use that exact local extension-storage directory, not a project folder or a
   guessed profile path. The directory contains no token in its name.
2. **Quit every Zero and VS Code editor instance and confirm their extension-host
   processes have stopped.** Include other profiles/windows that use Zero.
   On macOS, use Quit and check Activity Monitor. On Windows, exit all editor
   windows and check Task Manager. Do not move locks while any editor/extension
   host remains or when you cannot establish that it has stopped; ask your
   device administrator or IT for help instead.
3. With all editors closed, open the exact diagnostic directory in Finder or
   File Explorer. Rename each of these files, if present, by appending a unique
   suffix such as `.closed-editor-backup-20261018-143000`:

   - `github-app-refresh.lock`
   - `github-app-refresh.recovery.lock`

   Preserve the renamed files as diagnostic backups. Move or rename only these
   two files. Do not delete the storage directory, edit credential state, clear
   VS Code SecretStorage/Keychain/Credential Manager, or change any project files,
   Git history or repository settings. These lock files contain ownership
   metadata only; no credential backup or export is needed.
4. Reopen one Zero editor and try its connection again. A still-valid active
   credential record can resume. A saved `refreshing` or `reconnect` marker means
   renewal had an uncertain outcome: **complete fresh GitHub authorization**.
   Repairing the lock must not reset that marker or retry the old refresh token.
   The same applies when the refresh token has expired.

If the diagnostic returns, preserve the backups and share the error code and
lock filenames with the maintainer. Do not paste SecretStorage contents, access
tokens or refresh tokens into an issue. Keep all project contents and credentials
intact while the cause is investigated.
