# Your independent ZeroJam

This is the complete editable ZeroJams template, version **1.0.0**. It is plain
HTML, CSS, JavaScript and local SVG, with no package install or build step. Your
repository owns every file. Zero updates do not replace them. Guided preparation fills in `zero-jam.json` with your details. Plain Game Jam
and App Jam downloads use example details instead.

The template source uses the included MIT license. Keep its notice with reused
template code; your repository owns your additions and custom content.

## GitHub is required for every jam

Both Game Jams and App Jams require participants to use GitHub: sign in on Zero
to join, then submit their own public GitHub repository at an exact commit.
Creator eligibility rules add to this platform requirement. Preparing or
browsing a website does not require sign-in; joining and submitting do.

## Make it yours

1. Download and unzip the Game Jam or App Jam template from
   https://zero.codepet.ca/hub/jams/create. There is currently no separately
   published GitHub template repository; this ZIP is the creation path.
2. Create your own public GitHub repository. Copy **all** files, including the
   hidden `.github` folder, into its root. Commit and push using your normal
   GitHub tools. The download does not create, connect or write a remote repository.
3. Edit `zero-jam.json`: choose `type` (`game` or `app`), title, summary, theme,
   rules, eligibility, actual public `websiteUrl`, IANA timezone and schedule.
   If you used guided preparation, your chosen dates and details are already set.
   Plain templates use example 2030 dates. Replace any example.com website URL
   with your actual address after hosting; it is a placeholder.
   Dates are exact UTC instants ending in `Z`; the page displays them in your
   chosen timezone, including daylight-saving changes. Registration and submission
   windows include their opening instant and exclude their closing instant.
4. Customize `index.html`, `assets/jam.css`, `assets/jam.js` and the local mark.
   The JSON supplies text content safely; line breaks in rules are preserved.
   Add local images under `assets/`. Do not include secrets or private data.

## Preview and host

Serve this folder through any static web server (for example, if Python is
installed, `python3 -m http.server 8080`) and open http://localhost:8080.
Opening index.html as a file may prevent loading the JSON. Check phone and desktop
sizes, keyboard focus, light/dark appearance and your schedule before publication.

For GitHub Pages, use a `main` default branch and choose **Settings → Pages →
Build and deployment → Source: GitHub Actions** in your own repository. The
included workflow uses commit-pinned actions and copies only the public page
files. Enabling and running it publishes your page and included assets publicly.
Push a change to main or manually run **Publish your jam page**. Check the actual
Pages URL and update `websiteUrl` before proposing. A custom domain requires your
own separate configuration. You may host these same files elsewhere instead.

## Request official approval

Sign in at https://zero.codepet.ca/hub/jams/create with the GitHub account that
owns your public repository. Submit its HTTPS GitHub URL and the full 40-character
commit SHA containing `zero-jam.json`. A Zero maintainer reviews that exact source;
your site being live does not approve an event. Review/service availability is
separate from static hosting. If the service is unavailable, retain your source
and try the same request again later.

After approval, copy the event ID shown by Zero (for example `jam-12345`) into
the `zero-jam-id` meta element in `index.html`, commit and publish your page.
The official status panel can be embedded only on your approved website origin.
Its links always open Zero directly; a plain link also works if a panel fails or
a popup is blocked. No GitHub credentials, session tokens, joins or submissions
are handled by your website. Participants can browse signed out and sign in
directly on Zero when they choose to participate.

Changing your hosted page does not change approved rules. To change official
details, edit the manifest, commit it and propose the exact new SHA on the
official detail page. The accepted revision stays active while an update is
reviewed. Participants review the accepted rules and revision on Zero before
joining or submitting. Keep your hosted page consistent with that version.
Publishing source and approval are separate operations. Nothing in this template
promises approval, prizes or that a creator's page is an official Zero service.
