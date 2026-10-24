# Browser compatibility contract v1

`checkCompatibility` attributes **original** application Java with the existing
local JDK compiler and the four SHA-256 pinned JavaFX 21.0.12 signature jars.
The mac-aarch64 classifier is an attribution data source on every OS: no JavaFX
class or native library is loaded. The checker parses and analyzes with
`-proc:none --release 17`, isolated explicit class/source paths, and never calls
class generation or application/processor entry points. Its process supports
cancellation and a bounded timeout. Real pinned WebFX/GWT compilation must follow.

`contract.json` approves exact external types and **declaring-owner** member
signatures with erased parameter types. Approval of a class does not approve its
other members, overloads or inherited owners. Every original source body, even
unused methods and initializers, is scanned. Constructors, method references,
constructor references, static imports, fields, type references and overrides are
checked through javac Trees/Elements. Unresolved source fails with file, line,
column and javac's error. Compiler-supplied `this`, `super` and actual array length
are language features, not external APIs. Enhanced for, boxing and string
concatenation are compiler language lowering; their implicit implementation is
covered by the pinned GWT compiler and positive ordinary-Java fixtures.

The sixteen canonical helper **bodies** have a narrow exemption only at their exact
source paths and reviewed adapter SHA-256 after CRLF normalization; their public
and protected members are still explicit contract entries. Editing a helper,
spoofing its qualified identity at another path, adding helpers in `zero`, or
subclassing an approved class never gives student code that exemption. Runtime
and interop source namespaces and student native/JSNI methods are prohibited.
Ordinary application packages and additional ordinary `zero` helpers are allowed.

Resource reflection is restricted to `ClassName.class.getResource(...)` and
unqualified `getClass().getResource(...)`, which the adapter maps to packaged
resources. Other class literals/getClass uses and reflection APIs are rejected.
Canvas accessible text uses the exact `canvas().setAccessibleText(...)` bridge.
This is a reviewed subset; a passing attribution check alone does not promise
browser behavior. A contract update needs relevant positive and negative tests
and a fresh real compiler/browser check. In particular the 28 source examples'
semantic tests are attribution coverage, not browser interaction evidence.

The original POM is parsed structurally: only exact native JavaFX base/graphics/
controls/media 21.0.12 dependencies are accepted. Parent/profile/BOM and extra
libraries fail closed. The generated browser POM remains separately pinned.
The two packaged starter-ui example variants still need explicit dependency
support; copying their equivalent composed source remains supported.

`maven-artifacts.json` is a checksum catalogue of the existing reviewed compiler
cache, including build-tool POMs and transitive jars. **It is not an application
API or dependency allowlist.** Every jar/POM present in the dedicated Maven cache
must match this catalogue before and after Maven. Unknown/edited artifacts fail;
missing catalogue entries need not be downloaded. The fixed generated POM controls
which allowed bytes can enter the build. The catalogue hash, attribution jars,
contract and checker hashes are recorded in the manifest; the complete engine
profile also binds the adapters, templates and toolchain lock.

The effective Maven wrapper and its properties must match reviewed normalized
hashes. Export executes frozen copies in its own temporary directory, without
project hooks or a mutable script race. Project originals are captured and
rechecked together with Java, resources and build settings. A failed check/build
cannot become a current validated snapshot or replace the previous export.

Tests: `node --test extension/test/web-export-compatibility.test.js
extension/test/web-export-engine.test.js`. Browser/real compiler acceptance stays
in `npm run verify:web` and the coordinator's Sky Hop fixture run. Physical Windows
and other browser engines require their own evidence.
