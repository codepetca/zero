package zero.workshop;

import com.google.gson.*;
import java.nio.file.Files;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.VBox;
import zero.community.HealthBar;

/** Behavior checks exercise ordinary public API and the displayed native controls. */
final class WorkshopChecks {
  static JsonObject report(ComponentProject project) throws Exception {
    return report(project, null);
  }

  static JsonObject report(ComponentProject project, CandidateBuild candidate) throws Exception {
    JsonObject source = ContributionPacket.inspect(project);
    JsonObject report = new JsonObject();
    report.addProperty("schema", 1);
    report.add("sourceDigest", source.get("sourceDigest"));
    JsonObject provenance = new JsonObject();
    provenance.addProperty("generator", "Zero Component Workshop 0.1.0");
    provenance.addProperty(
        "scope",
        "Loaded school.zero.community:zero-community:0.1.2 runtime. Source edits require"
            + " rebuilding; runtime results do not prove edited source behavior.");
    report.add("provenance", provenance);
    JsonArray checks = new JsonArray();
    report.add("checks", checks);
    record(
        checks,
        "source-metadata",
        "passed",
        "Shared metadata, API, example files and declared source inspected; SHA-256 source digest"
            + " recorded.");
    String artifactHash =
        ContributionPacket.sha(
            Files.readAllBytes(
                java.nio.file.Path.of(
                    HealthBar.class.getProtectionDomain().getCodeSource().getLocation().toURI())));
    boolean matches =
        candidate != null
            ? candidate.sourceDigest.equals(source.get("sourceDigest").getAsString())
            : artifactHash.equals(
                    "c071ce860f8d125dc0e82c5e75e81ce2bfe5dfd757ded04c7a0588213d06fca8")
                && ContributionPacket.sha(
                        Files.readAllBytes(
                            project.file("src/main/java/zero/community/HealthBar.java")))
                    .equals("c023d56668b9fa4eb5cd75a0f2be0221c250bc1f2e2b416d065a5f98bbbcb109");
    JsonObject artifact = new JsonObject();
    artifact.addProperty("version", "0.1.2");
    artifact.addProperty("sha256", artifactHash);
    artifact.addProperty(
        "sourceJarSha256", "1440f70ab633be568e9f3b32c1a839500517b4e766158945acef82ceb5e48ae9");
    artifact.addProperty("sourceBinding", matches ? "matched-immutable-source" : "unverified");
    provenance.add("testedArtifact", artifact);
    if (candidate != null) {
      artifact.addProperty("version", "0.1.2");
      artifact.addProperty("kind", "candidate-class");
      artifact.addProperty("sha256", candidate.classHash);
      artifact.remove("sourceJarSha256");
      artifact.addProperty("hashScope", "compiled HealthBar.class");
      artifact.addProperty("sourceBinding", matches ? "built-local-candidate" : "unverified");
      artifact.addProperty("sourceDigest", candidate.sourceDigest);
    }
    record(
        checks,
        "source-runtime-match",
        matches ? "passed" : "unavailable",
        matches
            ? (candidate == null
                ? "Source matches HealthBar in the immutable 0.1.2 sources JAR."
                : "Source digest matches this isolated compiled candidate.")
            : "Source differs from the immutable 0.1.2 sources JAR. Runtime checks describe the old"
                  + " pinned binary; edited source behavior is unverified.");
    Class<?> type = candidate == null ? HealthBar.class : candidate.type;
    // Both constructors and every public method are the supported binary API.
    // Testing only preview behavior would miss a removed constructor/getter.
    try {
      Object defaultBar = type.getConstructor(int.class).newInstance(8);
      type.getConstructor(String.class, int.class);
      requireReturn(type, "view", Node.class);
      requireReturn(type, "setHealth", void.class, int.class);
      requireReturn(type, "getHealth", int.class);
      requireReturn(type, "getMaximum", int.class);
      if (!type.getMethod("getMaximum").invoke(defaultBar).equals(8))
        throw new IllegalArgumentException("getMaximum must retain the configured maximum");
      record(checks,"public-api-compatibility",matches ? "passed" : "unavailable",
          "Both constructors and exact method/return signatures retained; default instance keeps its maximum.");
    } catch (ReflectiveOperationException | IllegalArgumentException failure) {
      record(checks,"public-api-compatibility","failed",
          "Documented HealthBar API is incompatible: " + failure.getMessage());
      return report;
    }
    ComponentPreview health = new ComponentPreview(type, "Energy", 8);
    health.setHealth(7);
    VBox view = (VBox) health.view();
    ProgressBar fill = (ProgressBar) view.getChildren().get(1);
    Label label = (Label) view.getChildren().get(0);
    record(
        checks,
        "fractional-fill",
        Math.abs(fill.getProgress() - 0.875) < 0.000001 && label.getText().equals("Energy: 7 / 8")
            ? "passed"
            : "failed",
        "7/8 must show 87.5% fill and matching numeric label.");
    health.setHealth(-4);
    boolean low = health.getHealth() == 0 && fill.getProgress() == 0;
    health.setHealth(19);
    boolean high = health.getHealth() == 8 && fill.getProgress() == 1;
    record(
        checks,
        "clamping",
        low && high ? "passed" : "failed",
        "Negative values display zero; values above maximum display maximum.");
    ComponentPreview other = new ComponentPreview(type, "Health", 8);
    other.setHealth(3);
    Node first = health.view();
    Node second = other.view();
    VBox parents = new VBox(first, second);
    health.setHealth(2);
    record(
        checks,
        "independent-views",
        first != second
                && first.getParent() == parents
                && second.getParent() == parents
                && other.getHealth() == 3
            ? "passed"
            : "failed",
        "Two instances coexist in a native parent and updates preserve the other instance.");
    boolean invalid = false;
    try {
      new ComponentPreview(type, "Health", 0);
    } catch (IllegalArgumentException expected) {
      invalid = true;
    }
    record(
        checks,
        "invalid-maximum",
        invalid ? "passed" : "failed",
        "Zero maximum rejected with a useful error.");
    record(
        checks,
        "ai-advisory",
        "unavailable",
        "No external AI service configured. Maintainer can request a source-bound advisory review;"
            + " AI cannot approve or publish.");
    if (!matches)
      for (JsonElement element : checks) {
        JsonObject item = element.getAsJsonObject();
        if (java.util.List.of("fractional-fill", "clamping", "independent-views", "invalid-maximum")
            .contains(item.get("id").getAsString())) {
          item.addProperty("status", "unavailable");
          item.addProperty(
              "evidence",
              "Candidate source does not match the immutable loaded artifact. Rebuild and"
                  + " independently verify candidate behavior; old binary results do not certify"
                  + " edited source.");
        }
      }
    return report;
  }

  private static void record(JsonArray checks, String id, String status, String evidence) {
    JsonObject item = new JsonObject();
    item.addProperty("id", id);
    item.addProperty("status", status);
    item.addProperty("evidence", evidence);
    checks.add(item);
  }

  private static void requireReturn(Class<?> type, String method, Class<?> result, Class<?>... arguments)
      throws ReflectiveOperationException {
    var declared = type.getMethod(method,arguments);
    if (declared.getReturnType() != result || java.lang.reflect.Modifier.isStatic(declared.getModifiers()))
      throw new NoSuchMethodException(method + " must remain an instance method returning " + result.getSimpleName());
  }
}
