# Native setup packaging direction

Owner agreed to a single-download setup flow that checks existing installations,
reuses compatible tools and repairs missing/outdated items before opening Zero.
The local 0.5.4 ZIP currently contains shell setup launchers; native installer
packages are planned and must not be represented as delivered.

## Student flow

1. Open Zero Setup and check this laptop.
2. Review detected versions and selected paths. Compatible tools are retained.
3. Choose missing-tool installation or a managed update. If an existing tool is
   outside the package manager, use its official update/manual repair path.
4. Recheck after repair; restart setup/editor when environment changes need it.
5. Prepare the Zero profile/extensions and place a fresh starter in a writable
   folder. Never replace an existing student project during setup or an update.
6. Open Zero, run the first app and confirm its window. GitHub setup is separate.

## Implementation sequence

First strengthen the existing checkers: VS Code engine compatibility and known
stable locations, explicit update actions, selected-path reporting, broken Java
configuration guidance and cancelled/failed repair behavior. Runtime policy comes
from canonical extension metadata; unknown versions never count as compatible.
Detection is bounded to effective command paths and documented install locations;
it is not an exhaustive disk inventory. Honour explicit JAVA_HOME even if invalid.

Next build a thin native wrapper reusing that policy. Windows: per-user EXE,
with installation prompts for dependencies that need additional permissions.
macOS: setup app in a DMG, keeping orchestration in the student's user session.
Do not run profile/extension configuration as root. Downloads must use reviewed
vendor sources and verify selected installer bytes before execution. A fixed
package identifier alone does not prove that a tool update changed the active PATH.

Before public distribution, build/test each platform artifact, sign appropriate
packages and notarize the macOS app/container. Owner signing/account access and
publication require explicit authorization. Keep unsigned development artifacts
clearly labelled; never guide students to disable security controls. Interrupted
or failed installs leave a truthful checklist that can be resumed.

## Boundaries

No custom IDE engine, persistent agent, account/token manager or installer platform.
No automatic package-manager installation, school-policy workaround, downgrade,
uninstall of shared tools or overwritten student work. Git remains optional for
local Run. A newer installation is retained only when it satisfies declared
compatibility; an unknown future major version needs policy review.

The native wrapper is not acceptance evidence by itself. Fake-tool tests must
cover existing/missing/old/new/unknown versions, multiple known installations,
paths with spaces, cancellation, failed update and recheck. Physical Windows,
clean-machine macOS, managed school policy, network restrictions and novice
interaction remain separate verification limits. Keep any broader installer
implementation/release scope in the current handoff rather than inferring it
from this plan or old grants.
