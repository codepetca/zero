# Bundled tools and source materials

Zero Portable includes unmodified upstream distributions of VSCodium,
Eclipse Temurin Java, Node.js, MinGit, and Red Hat Java language support.
Their licenses, third-party notices and credits remain inside the tools folder
and Java extension archive. Zero's license applies to Zero's own files.

The release's **SOURCE-INDEX.json** lists the exact source archives and
corresponding build materials, with versions and SHA-256 checksums. They are
available alongside the ZIP at:

https://github.com/codepetca/zero/releases/tag/windows-portable-bundled-v0.5.78

The editor is VSCodium 1.143.17232, the MIT-licensed community distribution of
Code - OSS. Its source archive and bundled component notices cover the editor.
Java is Eclipse Temurin 21.0.12.1+1, licensed under GPLv2 with the Classpath
Exception and the notices included in tools/jdk/legal.
Node.js is version 22.23.4, under its MIT license and bundled third-party terms.
MinGit 2.56.1.windows.1 includes Git and additional components under their own
licenses. tools/git/etc/package-versions.txt records their exact versions.
Red Hat Java 1.57.0 is the universal extension under EPL-2.0 with bundled
Eclipse/JDT language-server components. Their notices remain in tools/java.vsix.
Newtonsoft.Json 13.0.4 is under MIT, with its license beside the launcher.

For source rebuilds, use the upstream build instructions, patches and package
recipes supplied in the source archives. Source material is offered with the
same public access as the binary ZIP.
