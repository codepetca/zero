package zero.workshop;

import java.net.*;
import java.nio.file.*;
import java.util.*;
import javax.tools.*;
import zero.community.HealthBar;

/** An explicit local run: compile only the declared source, never its POM or build hooks. */
final class CandidateBuild implements AutoCloseable {
  final Path directory;
  final String sourceDigest;
  final String classHash;
  final Class<?> type;
  private final URLClassLoader loader;

  CandidateBuild(ComponentProject project) throws Exception {
    sourceDigest = ContributionPacket.inspect(project).get("sourceDigest").getAsString();
    directory = Files.createTempDirectory("zero-health-bar-candidate-");
    Path source = directory.resolve("src/zero/community/HealthBar.java");
    Files.createDirectories(source.getParent());
    Files.write(
        source, Files.readAllBytes(project.file("src/main/java/zero/community/HealthBar.java")));
    Path output = directory.resolve("classes");
    Files.createDirectory(output);
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    if (compiler == null)
      throw new IllegalStateException("Run Workshop with a JDK, not a JRE, to build local source.");
    DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
    try (StandardJavaFileManager files =
        compiler.getStandardFileManager(
            diagnostics, null, java.nio.charset.StandardCharsets.UTF_8)) {
      List<String> options =
          new ArrayList<>(
              List.of(
                  "--release",
                  "17",
                  "-proc:none",
                  "-implicit:none",
                  "-d",
                  output.toString(),
                  "-classpath",
                  System.getProperty("java.class.path")));
      String modules = System.getProperty("jdk.module.path");
      if (modules != null && !modules.isBlank())
        options.addAll(List.of("--module-path", modules, "--add-modules", "javafx.controls"));
      boolean success =
          compiler
              .getTask(null, files, diagnostics, options, null, files.getJavaFileObjects(source))
              .call();
      if (!success) {
        StringBuilder message = new StringBuilder("Candidate compilation failed:\n");
        for (Diagnostic<?> diagnostic : diagnostics.getDiagnostics())
          message
              .append("Line ")
              .append(diagnostic.getLineNumber())
              .append(": ")
              .append(diagnostic.getMessage(Locale.ROOT))
              .append('\n');
        cleanup(directory);
        throw new IllegalArgumentException(message.toString());
      }
    }
    classHash =
        ContributionPacket.sha(
            Files.readAllBytes(output.resolve("zero/community/HealthBar.class")));
    loader =
        new URLClassLoader(new URL[] {output.toUri().toURL()}, HealthBar.class.getClassLoader()) {
          @Override
          protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
            if (!name.equals("zero.community.HealthBar")
                && !name.startsWith("zero.community.HealthBar$"))
              return super.loadClass(name, resolve);
            Class<?> loaded = findLoadedClass(name);
            if (loaded == null) loaded = findClass(name);
            if (resolve) resolveClass(loaded);
            return loaded;
          }
        };
    type = loader.loadClass("zero.community.HealthBar");
    if (!sourceDigest.equals(
        ContributionPacket.inspect(project).get("sourceDigest").getAsString())) {
      close();
      throw new IllegalStateException(
          "Source changed during candidate compilation; rebuild again.");
    }
  }

  @Override
  public void close() throws Exception {
    loader.close();
    cleanup(directory);
  }

  private static void cleanup(Path directory) throws Exception {
    try (var paths = Files.walk(directory)) {
      for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
    }
  }
}
