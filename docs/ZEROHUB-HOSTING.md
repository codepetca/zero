# Sharing hosting

The adopted architecture is [GitHub sharing](GITHUB-SHARING-PLAN.md): Vercel for the website, a public GitHub registry branch for durable metadata, and immutable public Blob files for Maven artifacts, game projects and catalog snapshots. Neon and the former `/api/hub` runtime are removed from this replacement.

See [website configuration](../website/README.md) for fixed registry and artifact origin settings. Missing configuration reports unavailability without inventing releases. Publisher credentials belong only to the publication job. The website reads public metadata and needs no write credentials.

Source changes remain local until reviewed and deliberately deployed. The existing public deployment and released kit bytes are not changed by a local build. Provisioning a registry branch, Blob store, secrets and jobs is a separate rollout step. Retiring the old Neon resource requires an explicit resource inventory and retention decision; removing its code does not delete hosted data.

The owner explicitly reopened the earlier held checker acceptance work on
2026-10-17 to complete the Flap Motion sample's public sharing/consumption flow.
The old widget-only checker is not acceptance for the adopted helper/widget
contract. Current-format source review, real isolated Linux checks, managed
workflow provenance and separate publisher verification must pass before deliberate
activation. Public library execution stays disabled until those gates pass; local
Check receipts are not hosted admission evidence. Game packaging does not execute
candidate Java. This authorization does not permit bypassing a provider rejection
or weakening the execution/publication boundary.
