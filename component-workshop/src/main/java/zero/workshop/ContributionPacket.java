package zero.workshop;

import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;

/** Local data-only export. No contributor commands, tools or arbitrary files are executed. */
final class ContributionPacket {
  private static final Gson JSON =
      new GsonBuilder().disableHtmlEscaping().serializeNulls().create();

  static String sha(byte[] data) throws Exception {
    return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
  }

  static JsonObject inspect(ComponentProject project) throws Exception {
    JsonObject metadata =
        JsonParser.parseString(project.read("catalog/components.json")).getAsJsonObject();
    if (metadata.getAsJsonArray("components").size() != 1)
      throw new IOException("This Workshop exports one HealthBar component.");
    JsonObject component = metadata.getAsJsonArray("components").get(0).getAsJsonObject();
    String api = project.read("docs/HealthBar.md");
    for (JsonElement signature : component.getAsJsonArray("api"))
      if (!api.contains(signature.getAsString()))
        throw new IOException("API documentation is missing " + signature.getAsString());
    JsonArray examples = component.getAsJsonArray("examples");
    if (examples.size() != 2) throw new IOException("Declare both app examples.");
    Set<String> paths = new HashSet<>();
    Set<String> examplesHashes = new HashSet<>();
    for (JsonElement element : examples) {
      JsonObject example = element.getAsJsonObject();
      String path = example.get("path").getAsString();
      paths.add(path);
      examplesHashes.add(sha(Files.readAllBytes(project.file(path))));
    }
    if (!paths.equals(Set.of("examples/adventure/Main.java", "examples/study/Main.java"))
        || examplesHashes.size() != 2)
      throw new IOException("Reuse requires two distinct app examples.");
    JsonArray files = new JsonArray();
    for (String path : ComponentProject.FILES.stream().sorted().toList()) {
      JsonObject file = new JsonObject();
      file.addProperty("path", path);
      file.addProperty("sha256", sha(Files.readAllBytes(project.file(path))));
      files.add(file);
    }
    JsonObject result = new JsonObject();
    result.addProperty("schema", 1);
    result.addProperty("sourceDigest", sha(JSON.toJson(files).getBytes(StandardCharsets.UTF_8)));
    result.add("files", files);
    result.add("metadata", metadata);
    result.add("dependencies", dependencies(project.read("pom.xml")));
    return result;
  }

  private static JsonArray dependencies(String pom) throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    factory.setXIncludeAware(false);
    factory.setExpandEntityReferences(false);
    Element root =
        factory
            .newDocumentBuilder()
            .parse(new ByteArrayInputStream(pom.getBytes(StandardCharsets.UTF_8)))
            .getDocumentElement();
    Map<String, String> properties = new HashMap<>();
    Element props = child(root, "properties");
    for (Node node = props.getFirstChild(); node != null; node = node.getNextSibling())
      if (node instanceof Element element)
        properties.put(element.getTagName(), element.getTextContent().strip());
    JsonArray result = new JsonArray();
    Element declared = child(root, "dependencies");
    for (Node node = declared.getFirstChild(); node != null; node = node.getNextSibling())
      if (node instanceof Element dependency && dependency.getTagName().equals("dependency")) {
        JsonObject item = new JsonObject();
        for (String key : List.of("groupId", "artifactId", "version")) {
          String value = child(dependency, key).getTextContent().strip();
          if (value.startsWith("${") && value.endsWith("}"))
            value = properties.get(value.substring(2, value.length() - 1));
          if (value == null
              || !value.matches("[A-Za-z0-9][A-Za-z0-9_.+-]*")
              || value.toUpperCase(Locale.ROOT).contains("SNAPSHOT"))
            throw new IOException("Dependency must have an exact pinned version");
          item.addProperty(key, value);
        }
        Element scope = childOrNull(dependency, "scope");
        item.addProperty("scope", scope == null ? "compile" : scope.getTextContent().strip());
        result.add(item);
      }
    return result;
  }

  private static Element child(Element parent, String tag) throws IOException {
    Element element = childOrNull(parent, tag);
    if (element == null) throw new IOException("Missing POM " + tag);
    return element;
  }

  private static Element childOrNull(Element parent, String tag) {
    for (Node node = parent.getFirstChild(); node != null; node = node.getNextSibling())
      if (node instanceof Element element && element.getTagName().equals(tag)) return element;
    return null;
  }

  static Path prepare(ComponentProject project, Path parent, JsonObject report) throws Exception {
    JsonObject manifest = inspect(project);
    if (!manifest.get("sourceDigest").equals(report.get("sourceDigest")))
      throw new IOException("Source changed since checks; run checks again.");
    Map<String, byte[]> contents = new TreeMap<>();
    for (JsonElement element : manifest.getAsJsonArray("files")) {
      JsonObject file = element.getAsJsonObject();
      String path = file.get("path").getAsString();
      byte[] data = Files.readAllBytes(project.file(path));
      if (!sha(data).equals(file.get("sha256").getAsString()))
        throw new IOException("Source changed while preparing packet");
      contents.put(path, data);
    }
    manifest.add("checks", report.get("checks"));
    JsonObject provenance = new JsonObject();
    provenance.addProperty("generator", "Zero Component Workshop 0.1.0");
    provenance.addProperty("sourceManifest", "catalog/components.json");
    provenance.add("sourceRevision", JsonNull.INSTANCE);
    provenance.addProperty(
        "sourceDigestAlgorithm", "sha256(canonical-json(sorted path+sha256 records))");
    provenance.addProperty(
        "scope", "local contribution; authored status is not community approval");
    manifest.add("provenance", provenance);
    byte[] packet = JSON.toJson(manifest).getBytes(StandardCharsets.UTF_8);
    byte[] receipt = JSON.toJson(report).getBytes(StandardCharsets.UTF_8);
    contents.put("packet.json", packet);
    contents.put("checks/report.json", receipt);
    Path output = parent.toRealPath().resolve("health-bar-contribution-" + UUID.randomUUID());
    Files.createDirectory(output);
    try {
      Files.createDirectory(output.resolve("checks"));
      Files.write(output.resolve("packet.json"), packet, StandardOpenOption.CREATE_NEW);
      Files.write(output.resolve("checks/report.json"), receipt, StandardOpenOption.CREATE_NEW);
      try (ZipOutputStream zip =
          new ZipOutputStream(
              Files.newOutputStream(output.resolve("packet.zip"), StandardOpenOption.CREATE_NEW))) {
        for (var entry : contents.entrySet()) {
          ZipEntry member = new ZipEntry(entry.getKey());
          member.setTime(1791504000000L);
          zip.putNextEntry(member);
          zip.write(entry.getValue());
          zip.closeEntry();
        }
      }
      return output;
    } catch (Exception failure) {
      try (var paths = Files.walk(output)) {
        for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
      }
      throw failure;
    }
  }
}
