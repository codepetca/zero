# This project's saved browser builder

Keep this complete `.zero-build` directory in your repository. It retains the
reviewed exporter, rules, adapters, dependency locks, notices and configuration.
An editor update must not replace it. Hashes identify bytes; review and trust the
project before explicitly running any code. No registry of historical Zero kits
is needed. This is not a full offline archive of upstream dependencies.

Use a standalone Node 22 and JDK 21. Zero Setup can supply private runtimes for
its editor; there is no global npm requirement. When rebuilding outside Zero,
obtain compatible tools from their official publishers and set JAVA_HOME to the
JDK. `runtime-lock.json` records exact reviewed archive
pins and the compatible tooling family. Pins are informational; this CLI never
downloads or installs runtimes. Linux JDK archive pins have no verified evidence.
Maven/WebFX dependencies still come from their recorded normal upstream sources.
No global npm packages, VS Code, or parent Zero source checkout is required.

From your project directory, explicitly run:

    echo '{"protocol":1,"operation":"inspect"}' | node .zero-build/run.cjs
    echo '{"protocol":1,"operation":"export"}' | node .zero-build/run.cjs
    echo '{"protocol":1,"operation":"validate"}' | node .zero-build/run.cjs

The project defaults to the directory containing `.zero-build`. Optional absolute
`projectRoot` and `cacheRoot` fields select locations. The builder must remain
that project's `.zero-build`; caches must be outside the project. One bounded
JSON request on stdin produces one JSON response on stdout; progress uses stderr.
Errors have `ok:false` and a message; success has `ok:true` and a result. This
protocol has no shell command, environment, URL, credential or arbitrary module
fields. Explicit `compatibility` preparation may fetch verified attribution and
exact library inputs, then checks sources without generating a finished site.
A deliberate unsupported-source result still leaves verified dependencies ready.
`compatibilityCached` uses only prepared, hash-verified cache entries, never
falls back to downloading, Maven, annotation processors or app class generation.
It reports compatible, unsupported, unavailable or stale with exact input/tool
identities. Missing cache/tools are unavailable, not an unsupported-API verdict.
An editor must approve this exact saved builder explicitly in a trusted workspace
before automatic saved-source checks; opening/saving alone grants no authority.
`capture` returns current input hashes for a host's separate commit verification.
`validate` checks a build against current source and builder bytes; it is not the
separate retained-output rehosting operation.

Explicit build actions may execute the project's Maven wrapper. Only run trusted
projects. Host integration must independently verify tools, clear injection
variables, withhold credentials, enforce cancellation/deadlines, and verify frozen
inputs before accepting output. A manifest check performed by this project-owned
CLI is not a trusted editor authorization boundary. Unchanged bytes do not prove
that a project is safe. No GitHub publication happens here.
