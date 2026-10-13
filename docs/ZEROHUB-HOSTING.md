# Sharing hosting

The adopted architecture is [GitHub sharing](GITHUB-SHARING-PLAN.md): Vercel for the website, a public GitHub registry branch for durable metadata, and immutable public Blob files for Maven artifacts, game projects and catalog snapshots. Neon and the former `/api/hub` runtime are removed from this replacement.

See [website configuration](../website/README.md) for fixed registry and artifact origin settings. Missing configuration reports unavailability without inventing releases. Publisher credentials belong only to the publication job. The website reads public metadata and needs no write credentials.

Source changes remain local until reviewed and deliberately deployed. The existing public deployment and released kit bytes are not changed by a local build. Provisioning a registry branch, Blob store, secrets and jobs is a separate rollout step. Retiring the old Neon resource requires an explicit resource inventory and retention decision; removing its code does not delete hosted data.

Generic submitted-library checking is still held by the earlier provider-rejected independent acceptance assignment. No equivalent retry, provider switch or public execution bypass is authorized. The replacement's game packaging path does not execute candidate Java. Local library checks are developer checks, not hosted admission evidence. Do not describe the full contribution service as activated.
