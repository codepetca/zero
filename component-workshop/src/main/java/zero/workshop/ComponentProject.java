package zero.workshop;

import com.google.gson.*;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;

/** Reads the editable project's shared metadata, docs and named examples. */
final class ComponentProject {
  final Path root;
  final JsonObject metadata;
  final JsonObject component;
  static final List<String> FILES =
      List.of(
          "pom.xml",
          "src/main/java/zero/community/HealthBar.java",
          "examples/adventure/Main.java",
          "examples/study/Main.java",
          "docs/HealthBar.md",
          "catalog/components.json",
          "src/test/java/zero/community/HealthBarTest.java");

  ComponentProject(Path directory) throws IOException {
    root = directory.toRealPath();
    metadata = JsonParser.parseString(read("catalog/components.json")).getAsJsonObject();
    if (metadata.get("schema").getAsInt() != 1)
      throw new IOException("Unsupported component metadata schema.");
    component = metadata.getAsJsonArray("components").get(0).getAsJsonObject();
    if (!component.get("className").getAsString().equals("zero.community.HealthBar")
        || !metadata.getAsJsonObject("library").get("version").getAsString().equals("0.1.1"))
      throw new IOException("This local Workshop supports HealthBar from zero-community 0.1.1.");
  }

  String value(String key) {
    return component.get(key).getAsString();
  }

  Path file(String relative) throws IOException {
    if (!FILES.contains(relative))
      throw new IOException("File is outside the contribution scope: " + relative);
    Path candidate = root.resolve(relative);
    Path current = root;
    for (Path part : root.relativize(candidate)) {
      current = current.resolve(part);
      if (Files.isSymbolicLink(current))
        throw new IOException("Symlink is outside the contribution scope: " + relative);
    }
    if (!candidate.toRealPath().startsWith(root) || !Files.isRegularFile(candidate))
      throw new IOException("Missing project file: " + relative);
    if (Files.size(candidate) > 1_000_000)
      throw new IOException("Project file exceeds 1 MB: " + relative);
    return candidate;
  }

  String read(String relative) throws IOException {
    return Files.readString(file(relative));
  }

  String examples() throws IOException {
    StringBuilder result = new StringBuilder();
    for (JsonElement item : component.getAsJsonArray("examples")) {
      JsonObject example = item.getAsJsonObject();
      String path = example.get("path").getAsString();
      result
          .append(example.get("id").getAsString())
          .append(" — ")
          .append(example.get("description").getAsString())
          .append("\n")
          .append(path)
          .append("\n\n")
          .append(read(path))
          .append("\n\n");
    }
    return result.toString();
  }
}
