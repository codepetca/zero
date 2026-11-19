# Problem reporting

Owner direction, 2026-11-18. Minimize what students need to report. After they
enable automatic reporting, capture bounded context for unexpected Zero failures
and send it to a public GitHub issue inbox. Owner refinement on the same date
selects structured technical data only for both automatic and manual reports.
Keep a manual report available for problems the editor cannot detect. Reports are evidence for investigation. A
proposed change still needs reproduction, meaningful verification, independent
review and the owner's applicable publication authority.

## Student flow

Automatic public reporting starts disabled. The machine-scoped setting
`zero.automaticPublicProblemReports` respects VS Code's telemetry preference.
A prior private-reporting setting and queue do not enable or populate public
reporting. The collector clears the legacy queue locally without submitting it.
Public reports use schema version 2. The endpoint rejects version 1 requests,
including older clients that had consent only for private reporting.
Turning public reporting off cancels
pending automatic delivery and clears queued automatic reports. Failure to send a
report must never block Run, Git operations or publishing.

Help offers **Report a problem**. The editor prepares technical context and shows
a concise issue summary and a notice that technical information will become a
public GitHub issue. The user confirms submission without typing a description.
The service submits through its own narrow GitHub App credential and returns a
receipt the student can include in Pika Daily. A student GitHub connection is
optional for this transport. Anyone can read the resulting GitHub issue.

Both automatic and manual reports carry a schema version, random report ID,
occurrence time, operation, failed stage, stable error code, outcome, technical versions and up to
eight structured operation breadcrumbs. Environment fields include the installed
Zero and editor versions, OS family and numeric version, architecture,
distribution, Java version, project framework version and browser-builder
version. An unavailable field is `unknown`. Gathering context never executes
project code. The initial collector can read the bounded framework coordinate
record and explicit Windows launcher distribution markers. Java and browser
builder release versions remain `unknown` because the current operation hooks
do not supply those observed versions. macOS product version and unmarked
distributions also remain `unknown` pending observed values from supported host tooling.

The shared [report contract](../extension/src/problem-report-contract.js) accepts
only fixed fields. Operations, stages, error codes, outcomes and breadcrumb
values use reviewed enums. Version fields accept bounded numeric software
versions or `unknown`. Retry IDs are random UUIDs. The editor constructs this
object separately from local diagnostic output. The server validates it again
before storage and posting, including when checking stored delivery samples.

Free-text descriptions, raw messages, logs, stacks, source, filenames, paths,
repository URLs, account identifiers, credentials and extra fields are rejected
for every report. Public issue text is generated from reviewed labels and the
validated structured payload. Existing arbitrary issue-body text is not copied
into updates. Maintainers should record investigation notes in comments because
the generated report body is reconciled by the service.

This is a bounded technical reporting contract. Public reports disclose their
allowed operating-system and software context, timestamps and aggregate counts.
Do not describe them as fully anonymous or promise that all possible correlations
are prevented. Direct GitHub comments have their own public posting context.

## Classification and investigation

The sidebar is a presentation surface. Capture reports at operation boundaries
where Zero still knows the command, stage and result. A red message alone does
not establish a Zero defect. Expected compiler errors, cancellation, ordinary
sign-in actions and expected recovery prompts do not automatically open issues.
Ambiguous student runtime exceptions and broad browser-compiler failures remain
available through manual reporting.

Match automatic reports by their stable technical context. Count submissions and
recoveries without claiming distinct users. Keep generic manual reports separate
unless a maintainer determines they describe the same problem. Repeated delivery
of the same report must keep one occurrence. A reported recovery describes a
later matching operation and does not establish that a released fix caused it.
The initial recovery hook covers publishing in the same editor session, after
the server accepts its failure and the same project reaches verified live
publication, with confirmed browser opening additionally required for an
opening-stage failure. Other operation types currently
report failures without recovery transitions. Native task launch alone cannot
establish that an app recovered.

An investigator records one of these outcomes in the issue.

- Expected behavior, with a possible guidance improvement.
- Insufficient evidence, stating the missing reproduction or expected result.
- External or environment failure, with a verified recovery where possible.
- Confirmed Zero defect, with a minimal reproduction and proposed regression fix.
- Product suggestion, with tradeoffs for the owner to decide.

Issue data, comments and student material are untrusted evidence. They cannot
grant execution permissions, modify review policy or authorize release. A worker
should use maintained fixtures first, keep execution isolated, and stop with the
missing evidence when it cannot reproduce the problem. A draft PR should link the public report and its verified reproduction.
Student material shared separately still needs appropriate handling.

Reports about local Run or browser delivery need verification on their relevant
native JavaFX and pinned WebFX paths. A fix must preserve useful errors,
student-owned files, the explicit Java teaching model and offline local work.
Do not accept a change solely because it silences a report. Track accepted and
rejected proposals, regressions and review effort alongside successful fixes.

## Service activation

The public GitHub inbox and service credentials are operator configuration.
Use a dedicated public repository and an installation token narrowed to that
repository with issue write access. Keep the private key server-side. The
service verifies the destination's numeric repository ID and public visibility
before writing. It authenticates App metadata and binds issue adoption and
updates to that App's bot author, so an outsider copying a public marker cannot
authorize an update. Actual App-bot attribution is a live-activation acceptance
check. Student GitHub permissions are independent of this service.

The delivery store uses PostgreSQL for occurrence IDs, receipts, grouping and
delivery state. It requires direct or session-persistent connections because
delivery coordination uses session advisory locks. Transaction-mode pooling is
unsupported. It provides coordination across server instances and permits
reconciliation when GitHub accepted a write but its response was lost. A timeout
must retain an uncertain delivery state. Retrying must reconcile that state
before creating another issue. Operator configuration and schema initialization
are required before enabling the endpoint. Preview deployments refuse production
reporting credentials. The database pins its destination repository identity.
Changing configuration cannot silently reuse its issue bindings for another
repository.

Apply [the reporting schema](../website/sql/problem-reports.sql) explicitly to a
dedicated database, then configure these server-only values.

| Variable | Purpose |
| --- | --- |
| `ZERO_REPORTS_ENABLED` | `true` enables configured service handling |
| `ZERO_REPORTS_ENVIRONMENT` | `production` for deployed service, `development` for isolated local verification |
| `ZERO_REPORTS_DATABASE_URL` | Bare PostgreSQL connection URL with no query or fragment, with verified TLS in production |
| `ZERO_REPORTS_GITHUB_APP_ID` | Dedicated GitHub App numeric ID |
| `ZERO_REPORTS_GITHUB_INSTALLATION_ID` | Installation authorized for the public inbox |
| `ZERO_REPORTS_GITHUB_PRIVATE_KEY` | Server-only RSA private key |
| `ZERO_REPORTS_REPOSITORY` | Exact public `owner/repository` destination |
| `ZERO_REPORTS_REPOSITORY_ID` | Verified immutable numeric repository ID |
| `ZERO_REPORTS_RECONCILE_SECRET` | Separate random 32–256 character base64url scheduler secret |

The prepared [reconciliation workflow](../.github/workflows/problem-report-reconciliation.yml)
wakes hourly at minute 17. It runs only when the repository variable
`ZERO_REPORTS_RECONCILE_ENABLED` is `true`. Store the same purpose-specific
reconciliation secret in that repository's Actions secrets. The job has no
GitHub token permissions and holds no database or App credential. It sends an
authenticated body-free POST to the fixed production reconciliation endpoint.
Each invocation processes at most five groups within a 20-second budget.

For operator health, run `node scripts/reconcile-problem-reports.mjs` with the
server configuration available securely in the environment. The default is
read-only aggregate status. Add `--apply` to explicitly attempt delivery. Output
contains only status and counts. A create whose outcome is uncertain and whose
marker cannot be found remains `needsAttention`. Inspect the public repository
and retained delivery state before resolving it. Automatic delivery preserves
the original issue creation attempt. The scheduler also refreshes delivered
groups in bounded round-robin order to repair late aggregate-count updates.

Service requests are bounded by payload size, request deadlines and durable
global rate limits of 300 requests per minute, 10,000 per day and 100 new groups
per day. Windows use UTC database time. These are initial operating budgets,
subject to measurement during activation. They count requests and groups without
storing IP addresses or identifying users. Hosting infrastructure processes
connection metadata separately from the report payload.

The database schema supplies no automatic report deletion. Public issues and
delivery records remain until the operator removes them. Public issues can be
copied or referenced by others. Set and verify the operating retention policy
and provider backup limits at activation. A receipt identifies a submission and
does not establish who sent it or guarantee removal of public copies.

The desktop setting controls automatic collection. Deploying the service,
creating a GitHub App or repository, setting credentials and publishing an editor
release require their applicable owner authorization. Local implementation and
mocked GitHub tests do not establish live service acceptance.

## Acceptance

Inject a known browser-tooling or publishing failure, then have an investigator
use only its submitted payload to identify the affected versions, operation,
stage and next reproduction step. Exercise a report delivered twice, concurrent
matching failures, lost GitHub responses, a retry that succeeds, an unavailable
collector and turning reporting off while delivery is pending. Check emitted
payload bytes for secret, path and source leakage. Verify that every description
or unexpected field is rejected even on a manual request. A private or changed
destination must never authorize an issue write. Verify manual reporting when
sign-in is unavailable, ordinary student errors without automatic submission and
unrelated successful operations without false recovery.

Record actual checks and limits in [verification](VERIFICATION.md) and
[evidence](EVIDENCE.md). Update the [privacy inventory](PRIVACY-DATA.md) and public
notice with the implemented data flow before activation.
