# Assets, recovery and game sharing

These changes are implemented locally for the Grove Guard student-flow follow-up.
This page does not announce a new public release. The original trial used
[Grove Guard](https://github.com/armorup/zero-grove-guard) and its
[ZeroHub entry](https://zero.codepet.ca/hub?kind=game&id=game-r1423346579-grove-guard&version=0.1.0).

## Add images and audio

Open your project and choose **Add assets…** in Zero, or **Zero: Add Assets…**
from the Command Palette. Select local image/audio files. Zero creates
`src/main/resources` when needed and copies the files there; your originals stay
where they were.

For matching names, **Keep both** adds a number, such as `coin (2).wav`.
**Skip existing** keeps the project's existing file. Names are compared without
case, and existing assets are never overwritten. Cancellation can leave files
that already finished copying; the result reports the actual imported/skipped
counts.

The Zero Output channel lists ready-to-paste Java string literals. **Copy asset
paths** or **Zero: Copy Imported Asset Paths** copies the paths from the latest
import in this project. Keep the quotes:

```java
Image player = loadImage("/player.png");
Sound coin = loadSound("/coin (2).wav");
```

Choose at most 100 files, each at most 25 MiB and together at most 100 MiB.
Import accepts PNG, JPEG, GIF, BMP, WebP, WAV, MP3, AIFF, M4A and OGG filenames;
actual decoding depends on the runtime. Use **Run App** to check your media.
Import does not convert files or provide an audio preview player.

## Recover one file

Open one standalone student Git project in its own window. Save or undo unsaved
edits yourself, then open the file and choose **Recovery…**.

- **Review changes** opens native Source Control.
- **Discard changes in current file…** opens Source Control with instructions.
  Find that file under **Changes**, choose its **Discard Changes** action, and
  review VS Code's confirmation. Zero's handoff has not discarded anything.
  Avoid **Discard All Changes** when recovering one file.
- **Restore an earlier file version…** lists up to 40 changes to that path in
  local Git history. Choose a version, review the earlier/current diff, then
  select **Restore file** or cancel. Restoration changes only the editor text
  and supports Undo. Review, save, run the app, then **Commit & push** to record
  the correction. Earlier commits stay intact.

Restoration supports tracked UTF-8 student Java/resource-text files, README and
LICENSE, up to 512 KiB. Toolkit, private/generated files, links, merge conflicts
and partial clones are excluded. Files must already exist; this is not a whole
project rollback or deleted-file recovery tool. Local editor Timeline remains
available separately. Changes to the project, file or Git state during review
require starting Recovery again.

## Share a game

Save your work. For a playable release, finish **Merge to main** first. Choose
**Share project** in Zero or **Zero: Share Game** from the Command Palette.

1. Enter/review the game's details and exact version, then choose **Save details**.
2. If the project has changes, choose **Commit & push** to upload the source and
   sharing details through the usual reviewed upload flow.
3. If this revision has no verified playable app, choose **Publish app and
   continue**, or explicitly choose **Share source only**. Publishing uses its
   normal account, destination and public-visibility checks.
4. Review the title, version, repository, revision, GitHub identity and playable
   link/source-only status. Choose **Open GitHub form**, then review and submit
   the prefilled request on GitHub yourself.

Cancel to keep working; choose Share again to continue from the saved state.
An interrupted upload/publish does not silently become a source-only request.
The form uses a freshly checked uploaded revision, including any commit made
during publishing. **Play latest** can change later; the shared source snapshot
stays at its selected version. Opening the form does not submit it or guarantee
gallery acceptance. Check request status on [Share your work](https://zero.codepet.ca/hub/share).

## Verified browser additions

Students still write ordinary Java and update their own objects explicitly.
These exact additions passed the strict resolved-member gate and real pinned
WebFX/GWT compilation:

| API | Verified members |
| --- | --- |
| `Math` | `hypot(double, double)`, `abs(double)`, `atan2(double, double)`, `sin(double)`, `cos(double)`, `PI` |
| `ArrayList` | `isEmpty()`, `remove(Object)`; existing `remove(int)` remains distinct |
| `KeyCode` | `ESCAPE`, `DIGIT1`, `DIGIT2`, `DIGIT3` |
| `Color` | `rgb(int, int, int)`; opaque channels from 0 through 255 |

Angles use radians. Object removal deletes the first equal item and returns a
boolean; index removal returns the removed item. Approval follows the resolved
declaring type and overload. For example, `Math.abs(long)`, `List.remove(Object)`,
`ArrayList.removeAll(Collection)`, four-argument `Color.rgb(...)` and
`KeyCode.DIGIT4` remain rejected. Other existing members are documented in the
[browser export guide](WEB-EXPORT.md); this is a verified teaching subset of Java
and JavaFX.

## Maintainer acceptance limits

The API evidence includes 15 attribution tests, five real pinned compiler builds,
56 Headless Chrome assertions on macOS, and native JDK math/collection plus
pinned JavaFX RGB checks. Browser checks exercise real key events, RGB pixels,
range errors and the same math/list assertion source used on the JDK.

Asset/recovery/sharing fixtures exercise cancellation, collisions, stale state,
file preservation and handoff boundaries using disposable files/Git repositories
and mocked editor/GitHub surfaces. These do not establish native dialog or live
account-provider behavior. Fresh installed-app UI acceptance, physical Windows,
other browser engines and physical audio remain pending. The original Grove
Guard trial's public deployment is earlier evidence; this follow-up has not
pushed, deployed or republished it.
