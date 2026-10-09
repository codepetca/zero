package zero.workshop;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.ZipFile;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import zero.community.HealthBar;

/** Checks every declared alternative through its ordinary public API and native controls. */
final class WorkshopChecks {
  static JsonObject report(ComponentProject project) throws Exception { return report(project, null); }
  static JsonObject report(ComponentProject project, CandidateBuild candidate) throws Exception {
    JsonObject source = ContributionPacket.inspect(project), report = new JsonObject();
    report.addProperty("schema", 1); report.add("sourceDigest", source.get("sourceDigest"));
    JsonObject provenance = new JsonObject(), artifact = new JsonObject();
    report.add("provenance", provenance); provenance.add("testedArtifact", artifact);
    provenance.addProperty("generator", "Zero Component Workshop");
    provenance.addProperty("scope", "Finite local JavaFX checks of every declared health bar; contributor receipts cannot grant recommendation, acceptance or publication.");
    JsonArray checks = new JsonArray(); report.add("checks", checks);
    record(checks, "source-metadata", "passed", "Declared source, APIs and distinct examples inspected; both alternatives participate in source digest.");
    Path runtime = Path.of(HealthBar.class.getProtectionDomain().getCodeSource().getLocation().toURI());
    String artifactHash = ContributionPacket.sha(Files.readAllBytes(runtime));
    String version = System.getProperty("zero.communityVersion", "0.1.2");
    boolean matches;
    if (candidate != null) matches = candidate.sourceDigest.equals(source.get("sourceDigest").getAsString());
    else {
      matches = artifactHash.equals(System.getProperty("zero.workshopArtifactSha256", "c071ce860f8d125dc0e82c5e75e81ce2bfe5dfd757ded04c7a0588213d06fca8"));
      String sources = System.getProperty("zero.workshopSources", "");
      if (!sources.isBlank()) {
        Path file = sources.startsWith("file:") ? Path.of(java.net.URI.create(sources)) : Path.of(sources);
        matches &= ContributionPacket.sha(Files.readAllBytes(file)).equals(System.getProperty("zero.workshopSourcesSha256"));
        try (ZipFile jar = new ZipFile(file.toFile())) {
          for (JsonElement item : project.metadata.getAsJsonArray("components")) {
            String entry = item.getAsJsonObject().get("className").getAsString().replace('.', '/') + ".java";
            var declared = jar.getEntry(entry);
            matches &= declared != null && Arrays.equals(Files.readAllBytes(project.file("src/main/java/" + entry)), jar.getInputStream(declared).readAllBytes());
          }
        }
      } else {
        matches &= project.metadata.getAsJsonArray("components").size() == 1 &&
            ContributionPacket.sha(Files.readAllBytes(project.file("src/main/java/zero/community/HealthBar.java"))).equals("c023d56668b9fa4eb5cd75a0f2be0221c250bc1f2e2b416d065a5f98bbbcb109");
      }
    }
    artifact.addProperty("version", candidate == null ? version : project.version());
    artifact.addProperty("sha256", candidate == null ? artifactHash : candidate.classHash);
    artifact.addProperty("sourceBinding", matches ? (candidate == null ? "matched-immutable-source" : "built-local-candidate") : "unverified");
    if (candidate == null) artifact.addProperty("sourceJarSha256", System.getProperty("zero.workshopSourcesSha256", "1440f70ab633be568e9f3b32c1a839500517b4e766158945acef82ceb5e48ae9"));
    else {
      artifact.addProperty("kind", "candidate-class"); artifact.addProperty("sourceDigest", candidate.sourceDigest);
      artifact.addProperty("hashScope", "sorted relative paths, NUL separators and bytes of all declared compiled classes");
    }
    record(checks, "source-runtime-match", matches ? "passed" : "unavailable",
        matches ? "Every declared component source matches the checked artifact." : "Source differs from loaded artifact; rebuild before certifying edited behavior.");
    for (JsonElement item : project.metadata.getAsJsonArray("components")) {
      JsonObject component = item.getAsJsonObject(); String name = component.get("className").getAsString();
      String prefix = name.equals("zero.community.HealthBar") ? "" : component.get("id").getAsString() + ":";
      Class<?> type = candidate == null ? Class.forName(name) : candidate.types.get(name);
      behavior(checks, prefix, type, matches);
    }
    record(checks, "ai-advisory", "unavailable", "No AI provider configured; AI cannot recommend, approve or publish.");
    return report;
  }
  private static void behavior(JsonArray checks, String prefix, Class<?> type, boolean matches) throws Exception {
    String pass = matches ? "passed" : "unavailable";
    try {
      Object defaultBar = type.getConstructor(int.class).newInstance(8);
      type.getConstructor(String.class, int.class);
      requireReturn(type,"view",Node.class); requireReturn(type,"setHealth",void.class,int.class);
      requireReturn(type,"getHealth",int.class); requireReturn(type,"getMaximum",int.class);
      if (!type.getMethod("getMaximum").invoke(defaultBar).equals(8)) throw new IllegalArgumentException("maximum changed");
      record(checks,prefix + "public-api-compatibility",pass,"Both constructors and exact instance methods retain the health API.");
    } catch (ReflectiveOperationException | IllegalArgumentException failure) {
      record(checks,prefix + "public-api-compatibility","failed",failure.toString()); return;
    }
    ComponentPreview bar = new ComponentPreview(type,"Energy",13); bar.setHealth(4);
    VBox view = (VBox) bar.view(); Label label = (Label) view.getChildren().get(0);
    boolean segmented = type.getSimpleName().equals("SegmentedHealthBar");
    boolean partial = label.getText().equals("Energy: 4 / 13") && view.getAccessibleText().equals(label.getText());
    if (segmented) {
      HBox parts = (HBox) view.getChildren().get(1); partial &= parts.getChildren().size() == 10;
      for (int i=0; i<10; i++) partial &= ((ProgressBar) parts.getChildren().get(i)).getProgress() == (i<3 ? 1 : i==3 ? 0.5 : 0);
    } else partial &= Math.abs(((ProgressBar) view.getChildren().get(1)).getProgress() - 4.0/13) < 0.000001;
    record(checks,prefix + "fractional-fill",partial ? pass : "failed","4/13 displays exact numeric health; continuous fill or integer-capacity partial segment agrees.");
    bar.setHealth(Integer.MIN_VALUE); boolean low = bar.getHealth() == 0 && allFill(view,0);
    bar.setHealth(Integer.MAX_VALUE); boolean high = bar.getHealth() == 13 && allFill(view,1);
    record(checks,prefix + "clamping",low && high ? pass : "failed","Integer extremes clamp and reset every visible fill.");
    ComponentPreview other = new ComponentPreview(type,"Health",3); other.setHealth(2);
    Node first = bar.view(), second = other.view(); VBox parents = new VBox(first,second); bar.setHealth(1);
    record(checks,prefix + "independent-views",first != second && first.getParent() == parents && second.getParent() == parents && other.getHealth() == 2 && first == bar.view() ? pass : "failed","Stable independent views coexist and preserve the other instance.");
    boolean invalid = false;
    try {new ComponentPreview(type,"Health",0);} catch (IllegalArgumentException expected) {invalid = expected.getMessage().contains("positive");}
    record(checks,prefix + "invalid-maximum",invalid ? pass : "failed","Zero maximum is rejected with a useful error.");
    if (segmented) {
      ComponentPreview huge = new ComponentPreview(type,"Huge",Integer.MAX_VALUE); huge.setHealth(Integer.MAX_VALUE - 1);
      HBox parts = (HBox) ((VBox) huge.view()).getChildren().get(1);
      double last = ((ProgressBar) parts.getChildren().get(9)).getProgress();
      record(checks,prefix + "integer-boundaries",last > 0.99 && last < 1 ? pass : "failed","Integer.MAX_VALUE boundaries remain finite without overflow; small maxima use positive capacities.");
    }
  }
  private static boolean allFill(VBox view,double expected) {
    Node fill = view.getChildren().get(1);
    if (fill instanceof ProgressBar bar) return bar.getProgress() == expected;
    return ((HBox) fill).getChildren().stream().allMatch(n -> ((ProgressBar)n).getProgress() == expected);
  }
  private static void record(JsonArray checks,String id,String status,String evidence) {
    JsonObject item = new JsonObject(); item.addProperty("id",id); item.addProperty("status",status); item.addProperty("evidence",evidence); checks.add(item);
  }
  private static void requireReturn(Class<?> type,String method,Class<?> result,Class<?>... args) throws ReflectiveOperationException {
    var declared = type.getMethod(method,args);
    if (declared.getReturnType() != result || java.lang.reflect.Modifier.isStatic(declared.getModifiers())) throw new NoSuchMethodException(method);
  }
}
