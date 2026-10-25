# ZeroJams controlled pilot registry

Operator-owned public-safe test state for the invited ZeroJams pilot.

Only event records named jams/jam-<numeric-repository-id>.json belong in the jams namespace. This branch has a separate orphan root and contains no application source or workflows. No private student information or secrets belong here. Preserve record history during recovery.

`website/vercel.json` disables automatic Vercel deployments only for this state branch. Preserve that guard when recovering or resetting the registry. The website directory contains configuration only, not application source.
