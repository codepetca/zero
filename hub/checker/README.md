# Local isolated hub checker

The checker accepts the generic `hub/CONTRACT.md` bundle. It runs no contributor
Java, Maven, build scripts or submitted processes on the host. This is a local
Linux worker proof; production provisioning and hardening are separate work.

## Build and check

Requirements: Node 22+, Docker Engine/Desktop with Linux containers, 512 MiB per
container, and outbound HTTPS **only when building the trusted image**. The
compiler/runtime is Temurin Java 17.0.16+8 on Ubuntu 24.04 and JavaFX 21.0.12. Ubuntu 24.04 supplies the glibc version required by these JavaFX ARM64 natives. A digest pins the
multi-architecture base image; an authenticated Ubuntu snapshot dated
2025-10-02 pins native/Xvfb dependencies; `dependencies.json` pins all JavaFX
JARs by SHA256. Candidate work has no network access and never pulls an image.

```sh
node hub/checker/build-image.mjs           # native arm64/amd64
node hub/checker/build-image.mjs amd64     # explicit alternative
node --test hub/checker/test/validation.test.mjs
ZERO_DOCKER_TEST=1 node --test hub/checker/test/docker.test.mjs
```

Building deliberately writes the ignored local `image-lock.json` with the immutable local Docker
image ID, platform and trusted checker-policy source digest. Review/retain that
lock with the image; it is not a portable registry URL. The runner verifies
image labels, exact image ID, Linux architecture, and current trusted source
hash (compiler/harness, image/dependency pins, host runner, validation and build tool) before accepting any submission. A missing/stale image is an infrastructure
error. Building may use Docker's trusted image cache. No candidate is present in
the image build context. Scratch directories are uniquely allocated below ignored
`.verification/hub-checker/` and deleted after every check/build. Tests require the actual returned Linux ARM64/AMD64 platform. The current local
proof was run on Linux ARM64; AMD64 requires a separate actual run.

`policy.mjs` is pure validation/digest/POM logic suitable for the website or
publisher. `runner.mjs` reexports it and adds `checkSubmission(bundle, options)`.
The result contains `policyDigest` binding the exact trusted checker source and Buffers only after every required stage passes. `expectedPolicyDigest()` is a synchronous independent export for the publisher to compare against stale or forged reports. Invalid
bundles throw; valid submissions with compile/runtime/policy failures return a
failed report; missing Docker/image/configuration throws. Options are trusted
worker configuration: immutable `image`, `scratchRoot`, and bounded
`buildTimeoutMs` (250–30000) / `runTimeoutMs` (250–15000). Defaults are 30 and 15
seconds. Never populate them from contributor request fields.

## Fixed policy and evidence

A separate read-only, offline container parses all Java with the trusted JDK AST
parser and compiles library source with `javac --release 17 -proc:none`, only
JavaFX controls/swing modules, no candidate classpath, and no Maven. Each source
file has exactly one public top-level class matching its filename and the exact
reserved namespace. Default-package finite tests/examples are separate source
units. JAR packaging accepts only the declared classes and their compiler-created
nested classes; fixed deterministic ZIP dates and ordering produce exact source,
license and binary artifacts. The POM is generated independently on the host.
Submitted build settings/hooks are excluded by the exact file allowlist.

Separate runtime containers mount only the input directory (including the exact
built JAR), read-only. The API stage loads declared classes without initialization,
checks the exact built-JAR origin and public, nonstatic, zero-argument
`javafx.scene.Node view()` signature. This stage does not instantiate arbitrary
constructors or execute `view()`; it establishes the API boundary.

The behavior check and each example compile with **only** the built JAR and
JavaFX. A hub-owned launch wrapper executes them under Xvfb, waits for finite
completion, detects uncaught errors, requires a component class to load from the
exact JAR, and rejects premature `System.exit`, `Runtime.halt`, replacement of
its guard and direct private-state reflection. The process's exit status and
parent-controlled timeout/output limits determine the result; stdout strings,
submitted JSON receipts and flags have no verdict authority. The loader probe
establishes actual JAR class use, not meaningful coverage of every component.
Contributor checks remain contributor claims; arbitrary behavior correctness is
not automatically proven. Applications may use `Platform.exit()` and return
normally. The completion guard is tied to Java 17's supported SecurityManager;
this implementation must be reconsidered before changing JDK versions.

Every stage has network `none`, UID/GID 10001, read-only root filesystem, only a
96 MiB noexec/nosuid/nodev `/tmp` tmpfs, all capabilities dropped, no new
privileges, 512 MiB RAM/no swap, 1 CPU, 96 PIDs, 256 file descriptors and disabled
core dumps. Runtime output is capped at 64 KiB, build output at 4 MiB. No Docker
socket, host project/home directories, credentials or publisher data are mounted.
A named container is forcibly removed on success, timeout, failure and output
limit; input directories are deleted in a finalizer.

The PNG validator checks canonical base64, size, signature, chunk CRCs,
non-interlaced 8-bit grayscale/RGB/gray-alpha/RGBA dimensions (up to one megapixel),
bounded zlib pixel bytes and row filters. Indexed-color/interlaced PNGs are outside
this initial narrow policy; export an RGB/RGBA image.

These restrictions reduce exposure; Docker, the host kernel, JVM/compiler and
native JavaFX dependencies remain part of the trust boundary. They do not prove
protection against every kernel/JVM/native exploit, denial of service beyond the
configured resources, or harmful behavior after students download a JAR. The
local test checks network/host-path/secret-environment/read-only isolation and
selected common verdict bypasses, not total sandbox security. Windows, macOS
native UI, Linux AMD64 and physical input are not established by an ARM64 Xvfb
run.

## Current verification receipt (2026-10-12)

Pure validation tests passed 3/3; Node syntax and trusted Python syntax checks
passed. Earlier Linux ARM64 containers actually completed the fixed compiler,
source AST, binary/source packaging and API stages, and rejected compile errors,
extra top-level classes and a wrong `view()` signature. Runtime negative cases
rejected exit/halt, output/timeout abuse and a spoofed pass marker without loading
a component. These observations do not establish a valid JavaFX success path.

The full JavaFX success/isolation suite has **not passed**. Initial trusted images
exposed a guard recursion bug (corrected), JavaFX native extraction on noexec tmpfs
(corrected with an image-native cache), and JavaFX ARM64 requiring glibc 2.38
(corrected in source by using Ubuntu 24.04 and libXtst). The corrected image now
includes a trusted finite JavaFX build preflight. Its build was interrupted after
Docker's VM filesystem became read-only while host disk space was low. Docker
restart/recovery is held by the coordinator because unrelated containers are
running. The generated prior `image-lock.json` is stale and the current checker
fails closed against it. Rebuild and run all Docker tests plus the Starter UI
integration after the authorized environment recovery before accepting this work.
