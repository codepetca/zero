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
        "Loaded school.zero.community:zero-community:0.1.1 runtime. Source edits require"
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
                    "ecde77c90e6d01854c5aa89ad099d40ae1714675edfb9343266050d7c626c36e")
                && ContributionPacket.sha(
                        Files.readAllBytes(
                            project.file("src/main/java/zero/community/HealthBar.java")))
                    .equals("c023d56668b9fa4eb5cd75a0f2be0221c250bc1f2e2b416d065a5f98bbbcb109");
    JsonObject artifact = new JsonObject();
    artifact.addProperty("version", "0.1.1");
    artifact.addProperty("sha256", artifactHash);
    artifact.addProperty(
        "sourceJarSha256", "8e3a2efa4a44f7d6e9433001829a690f654f48baa4212b1b7501cf50e1b1e518");
    artifact.addProperty("sourceBinding", matches ? "matched-immutable-source" : "unverified");
    provenance.add("testedArtifact", artifact);
    if (candidate != null) {
      artifact.addProperty("version", "0.1.1");
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
                ? "Source matches HealthBar in the immutable 0.1.1 sources JAR."
                : "Source digest matches this isolated compiled candidate.")
            : "Source differs from the immutable 0.1.1 sources JAR. Runtime checks describe the old"
                  + " pinned binary; edited source behavior is unverified.");
    Class<?> type = candidate == null ? HealthBar.class : candidate.type;
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
}
