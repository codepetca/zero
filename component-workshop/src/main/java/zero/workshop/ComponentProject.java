package zero.workshop;

import com.google.gson.*;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;

/** Reads only declared metadata, component source, docs, tests and examples. */
final class ComponentProject {
  final Path root;
  final JsonObject metadata;
  JsonObject component;
  private final Set<String> owned = new TreeSet<>(List.of("pom.xml", "catalog/components.json"));

  ComponentProject(Path directory) throws IOException {
    root = directory.toRealPath();
    metadata = JsonParser.parseString(read("catalog/components.json")).getAsJsonObject();
    if (metadata.get("schema").getAsInt() != 1)
      throw new IOException("Unsupported component metadata schema.");
    validateMetadata(metadata);
    String version = version();
    if (!version.matches("0\\.1\\.[0-9]+") || Integer.parseInt(version.substring(4)) < 2)
      throw new IOException("Workshop requires an exact library version from 0.1.2.");
    for (JsonElement item : metadata.getAsJsonArray("components")) {
      JsonObject declared = item.getAsJsonObject();
      String name = declared.get("name").getAsString();
      if (!List.of("HealthBar", "SegmentedHealthBar").contains(name)
          || !declared.get("className").getAsString().equals("zero.community." + name))
        throw new IOException("Unsupported local preview API: " + name);
      owned.add("src/main/java/zero/community/" + name + ".java");
      owned.add("src/test/java/zero/community/" + name + "Test.java");
      owned.add("docs/" + name + ".md");
      if ("MIT".equals(declared.get("license").getAsString())) owned.add("LICENSE");
      for (JsonElement example : declared.getAsJsonArray("examples")) {
        JsonObject e = example.getAsJsonObject();
        String id = e.get("id").getAsString();
        String path = e.get("path").getAsString();
        if (!id.matches("[a-z][a-z0-9-]*") || !path.equals("examples/" + id + "/Main.java"))
          throw new IOException("Example path is outside its owned app.");
        owned.add(path);
      }
    }
    component = metadata.getAsJsonArray("components").get(0).getAsJsonObject();
  }

  static void validateMetadata(JsonObject metadata) throws IOException {
    if (!Set.of("schema", "library", "components").containsAll(metadata.keySet()))
      throw new IOException("Contributor metadata cannot declare curation or recommendation authority.");
    if (!Set.of("groupId", "artifactId", "version", "javaRelease", "javafxVersion").containsAll(metadata.getAsJsonObject("library").keySet()))
      throw new IOException("Contributor library cannot declare curation or recommendation authority.");
    Set<String> ids = new HashSet<>();
    for (JsonElement item : metadata.getAsJsonArray("components")) {
      JsonObject c = item.getAsJsonObject();
      if (!Set.of("id", "name", "className", "description", "api", "examples", "status", "license", "maintainer", "category", "versions").containsAll(c.keySet()))
        throw new IOException("Contributor component cannot declare curation or recommendation authority.");
      if (!ids.add(c.get("id").getAsString())) throw new IOException("Duplicate component ID.");
      if (c.has("category") && !c.get("category").getAsString().matches("[a-z][a-z0-9-]*"))
        throw new IOException("Invalid component category.");
      if (c.has("versions")) {
        Set<String> versions = new HashSet<>();
        for (JsonElement v : c.getAsJsonArray("versions"))
          if (!v.getAsString().matches("[0-9]+\\.[0-9]+\\.[0-9]+") || !versions.add(v.getAsString()))
            throw new IOException("Component versions must be distinct exact releases.");
        if (!versions.contains(metadata.getAsJsonObject("library").get("version").getAsString()))
          throw new IOException("Component must be available in current library.");
      }
    }
  }

  String version() { return metadata.getAsJsonObject("library").get("version").getAsString(); }
  String value(String key) { return component.get(key).getAsString(); }
  void select(String id) throws IOException {
    for (JsonElement item : metadata.getAsJsonArray("components"))
      if (item.getAsJsonObject().get("id").getAsString().equals(id)) {
        component = item.getAsJsonObject(); return;
      }
    throw new IOException("Unknown component: " + id);
  }
  List<String> files() { return List.copyOf(owned); }
  Path file(String relative) throws IOException {
    if (!owned.contains(relative)) throw new IOException("File is outside the contribution scope: " + relative);
    Path candidate = root.resolve(relative);
    Path current = root;
    for (Path part : root.relativize(candidate)) {
      current = current.resolve(part);
      if (Files.isSymbolicLink(current)) throw new IOException("Symlink is outside contribution scope: " + relative);
    }
    if (!candidate.toRealPath().startsWith(root) || !Files.isRegularFile(candidate))
      throw new IOException("Missing project file: " + relative);
    if (Files.size(candidate) > 1_000_000) throw new IOException("Project file exceeds 1 MB: " + relative);
    return candidate;
  }
  String read(String relative) throws IOException { return Files.readString(file(relative)); }
  String examples() throws IOException {
    StringBuilder result = new StringBuilder();
    for (JsonElement item : component.getAsJsonArray("examples")) {
      JsonObject e = item.getAsJsonObject(); String path = e.get("path").getAsString();
      result.append(e.get("id").getAsString()).append(" — ").append(e.get("description").getAsString())
          .append("\n").append(path).append("\n\n").append(read(path)).append("\n\n");
    }
    return result.toString();
  }
}
