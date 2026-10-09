package zero.workshop;

import com.google.gson.*;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import javafx.application.Platform;
import javafx.geometry.*;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;
import javafx.stage.Stage;
import zero.SimpleApp;
import zero.community.HealthBar;

/** A small native Java app. Main owns the preview state and updates its object explicitly. */
public class Workshop extends SimpleApp {
  private ComponentProject project;
  private final String[] states = {"Full", "Partial", "Empty", "Custom caption"};
  private final int[] values = {100, 75, 0, 60};
  private final VBox preview = new VBox(16);
  private final TextField caption = new TextField();
  private final Slider amount = new Slider(0, 100, 100);
  private final Label value = new Label();
  private final Label feedback =
      new Label("Checks have not run. Changes require rebuilding before preview.");
  private final TextArea checkText = new TextArea();
  private final List<Button> stateButtons = new ArrayList<>();
  private ComponentPreview bar;
  private CandidateBuild candidate;
  private Class<?> previewType = HealthBar.class;
  private int selected;
  private boolean loading;
  private JsonObject report;
  private final Button reset = new Button("Reset example");
  private final Button check = new Button("Run checks");
  private Button build;
  private final TabPane tabs = new TabPane();
  private Stage stage;

  @Override
  public void settings() {
    title("Zero / Component Workshop · Local prototype");
    size(1120, 780);
  }

  @Override
  public void setup() {
    try {
      String root = System.getProperty("zero.communityRoot");
      if (root == null || root.startsWith("${"))
        throw new IOException("Pass -Dzero.communityRoot=<trusted local community checkout>.");
      project = new ComponentProject(root.startsWith("file:") ? Path.of(java.net.URI.create(root)) : Path.of(root));
      BorderPane screen = new BorderPane();
      screen.getStyleClass().add("workshop");
      Label brand = new Label("✦  Zero / Component Workshop     Local prototype");
      brand.getStyleClass().add("brand");
      Label name = new Label(project.value("name"));
      name.getStyleClass().add("title");
      Label description = new Label(project.value("description"));
      description.setWrapText(true);
      Label gate =
          new Label(
              project.value("status")
                  + " · "
                  + project.value("license")
                  + " · public releases need maintainer review and artifact hosting");
      gate.getStyleClass().add("muted");
      VBox header = new VBox(8, brand, name, description, gate);
      header.setPadding(new Insets(22));
      screen.setTop(header);
      tabs.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);
      tabs.getTabs()
          .addAll(
              new Tab("Preview", previewPage()),
              new Tab("Examples", text(project.examples())),
              new Tab("API", text(project.read("docs/HealthBar.md"))),
              new Tab("Checks", checksPage()),
              new Tab("Prepare contribution", contributionPage()));
      screen.setCenter(tabs);
      feedback.setWrapText(true);
      feedback.getStyleClass().add("muted");
      BorderPane.setMargin(feedback, new Insets(16, 22, 16, 22));
      screen.setBottom(feedback);
      show(screen);
      caption
          .textProperty()
          .addListener(
              (observable, oldValue, newValue) -> {
                if (!loading) refresh();
              });
      amount
          .valueProperty()
          .addListener(
              (observable, oldValue, newValue) -> {
                if (!loading) {
                  bar.setHealth(newValue.intValue());
                  value.setText("Value: " + bar.getHealth() + " / 100");
                }
              });
      reset.setOnAction(event -> select(selected));
      check.setOnAction(event -> runChecks());
      select(0);
    } catch (Exception failure) {
      show(new VBox(12, new Label("Workshop could not open"), text(failure.getMessage())));
    }
  }

  private Node previewPage() {
    VBox sidebar = new VBox(10, heading("Examples"));
    sidebar.setPrefWidth(190);
    sidebar.setPadding(new Insets(24, 16, 24, 16));
    sidebar.getStyleClass().add("sidebar");
    for (int i = 0; i < states.length; i++) {
      final int index = i;
      Button button = new Button(states[i]);
      button.setMaxWidth(Double.MAX_VALUE);
      button.setOnAction(event -> select(index));
      stateButtons.add(button);
      sidebar.getChildren().add(button);
    }
    preview.setAlignment(Pos.CENTER);
    preview.setPadding(new Insets(40));
    preview.setMinWidth(360);
    VBox controls =
        new VBox(
            14,
            heading("Try it"),
            new Label("Change the properties and see the result."),
            new Label("Caption"),
            caption,
            value,
            amount,
            reset);
    controls.setPrefWidth(255);
    controls.setPadding(new Insets(24));
    amount.setShowTickLabels(true);
    amount.setMajorTickUnit(25);
    controls.getStyleClass().add("controls");
    BorderPane content = new BorderPane(preview, null, controls, null, sidebar);
    Label use =
        new Label(
            "Use the named app examples to study construction and explicit updates. Edit source in"
                + " your editor, rebuild, then reopen this Workshop.");
    use.setWrapText(true);
    use.setPadding(new Insets(22));
    content.setBottom(use);
    return content;
  }

  private Node checksPage() {
    checkText.setEditable(false);
    checkText.setWrapText(true);
    VBox page =
        new VBox(
            16,
            heading("Check the loaded component"),
            new Label(
                "Runtime behavior checks the pinned binary. Source files are recorded for export;"
                    + " rebuild to check edited code."),
            check,
            buildButton(),
            checkText);
    page.setPadding(new Insets(24));
    VBox.setVgrow(checkText, Priority.ALWAYS);
    return page;
  }

  private Button buildButton() {
    build = new Button("Build local source & check");
    build.setOnAction(
        event -> {
          try {
            CandidateBuild replacement = new CandidateBuild(project);
            new ComponentPreview(replacement.type, caption.getText(), 100).view();
            CandidateBuild previous = candidate;
            candidate = replacement;
            previewType = replacement.type;
            refresh();
            if (previous != null) previous.close();
            runChecks();
            feedback.setText(
                "Local candidate built and shown. Checks describe this source digest and compiled"
                    + " class; no immutable release changed.");
          } catch (Exception failure) {
            feedback.setText(failure.getMessage());
          }
        });
    return build;
  }

  @Override
  protected void shutdown() {
    if (candidate != null)
      try {
        candidate.close();
      } catch (Exception failure) {
        System.err.println("Candidate cleanup: " + failure.getMessage());
      }
  }

  private Node contributionPage() {
    Button prepare = new Button("Prepare contribution…");
    prepare.getStyleClass().add("primary");
    prepare.setOnAction(
        event -> {
          DirectoryChooser chooser = new DirectoryChooser();
          chooser.setTitle("Choose parent folder for a new local contribution packet");
          java.io.File chosen = chooser.showDialog(stage);
          if (chosen == null) return;
          try {
            runChecks();
            Path destination = preparePacket(chosen.toPath());
            feedback.setText(
                "Prepared local packet: " + destination + ". Maintainer review is still required.");
          } catch (Exception failure) {
            feedback.setText("Preparation failed: " + failure.getMessage());
          }
        });
    Label explanation =
        new Label(
            "Prepare a ZIP with declared source, two reusable app examples, API, metadata, tests"
                + " and a source-bound check report. Choose a parent folder; a new folder is"
                + " created without replacing existing files.\n\n"
                + "Nothing is uploaded. Experimental work cannot become a reviewed"
                + " community release here.\n\n"
                + "AI review is unavailable in this local MVP. The packet records that missing"
                + " advisory check for a maintainer.");
    explanation.setWrapText(true);
    VBox page = new VBox(20, heading("Prepare contribution"), explanation, prepare);
    page.setPadding(new Insets(28));
    return page;
  }

  private Label heading(String text) {
    Label label = new Label(text);
    label.getStyleClass().add("heading");
    return label;
  }

  private TextArea text(String value) {
    TextArea area = new TextArea(value);
    area.setEditable(false);
    area.setWrapText(true);
    area.getStyleClass().add("reference");
    return area;
  }

  private void select(int index) {
    selected = index;
    loading = true;
    caption.setText(index == 3 ? "Energy" : "Health");
    amount.setValue(values[index]);
    loading = false;
    refresh();
    for (int i = 0; i < stateButtons.size(); i++) {
      stateButtons.get(i).getStyleClass().remove("selected");
      if (i == index) stateButtons.get(i).getStyleClass().add("selected");
    }
  }

  private void refresh() {
    bar = new ComponentPreview(previewType, caption.getText(), 100);
    bar.setHealth((int) amount.getValue());
    preview
        .getChildren()
        .setAll(
            heading(states[selected]),
            bar.view(),
            new Label("App-owned state · explicit setHealth update"));
    value.setText("Value: " + bar.getHealth() + " / 100");
  }

  private void runChecks() {
    try {
      report = WorkshopChecks.report(project, candidate);
      checkText.setText(new GsonBuilder().setPrettyPrinting().create().toJson(report));
      feedback.setText(
          "Runtime checks complete. See Checks for results and source digest. AI advisory review"
              + " unavailable.");
    } catch (Exception failure) {
      report = null;
      feedback.setText("Checks failed: " + failure.getMessage());
    }
  }

  private Path preparePacket(Path parent) throws Exception {
    if (report == null)
      throw new IOException("Run checks successfully before preparing a contribution.");
    return ContributionPacket.prepare(project, parent, report);
  }

  @Override
  protected void ready(Stage stage) {
    this.stage = stage;
    stage
        .getScene()
        .getStylesheets()
        .add(Workshop.class.getResource("workshop.css").toExternalForm());
    if ("true".equals(System.getProperty("zero.workshopCheck")))
      Platform.runLater(
          () -> {
            try {
              verifyUserBehavior();
              System.out.println(
                  "WORKSHOP_CHECK_PASS: preview states, adjustment, reset, runtime checks,"
                      + " source-bound scoped export, preservation");
            } catch (Throwable failure) {
              failure.printStackTrace();
              System.out.println("WORKSHOP_CHECK_FAIL");
              stage.close();
              System.exit(1);
            } finally {
              stage.close();
              Platform.exit();
            }
          });
  }

  private void verifyUserBehavior() throws Exception {
    if (project == null) throw new AssertionError("Project did not load");
    for (int i = 0; i < states.length; i++) {
      stateButtons.get(i).fire();
      require(bar.getHealth() == values[i], states[i]);
    }
    Node oldView = bar.view();
    caption.setText("Completed");
    require(bar.view() != oldView, "fresh caption view");
    amount.setValue(37);
    require(bar.getHealth() == 37, "adjustment");
    require(bar.view().getAccessibleText().equals("Completed: 37 / 100"), "visible value");
    reset.fire();
    require(bar.getHealth() == 60 && caption.getText().equals("Energy"), "reset selected example");
    check.fire();
    require(report != null, "run checks");
    for (JsonElement item : report.getAsJsonArray("checks"))
      require(
          !item.getAsJsonObject().get("status").getAsString().equals("failed"),
          "runtime check result");
    build.fire();
    require(candidate != null && previewType == candidate.type, "explicit candidate build button");
    for (JsonElement item : report.getAsJsonArray("checks"))
      require(
          !item.getAsJsonObject().get("status").getAsString().equals("failed"),
          "candidate behavior result");
    verifyCandidateDrift();
    Path parent = Files.createTempDirectory("zero-workshop-behavior-");
    try {
      Path marker = parent.resolve("keep.txt");
      Files.writeString(marker, "preserved");
      Path packet = preparePacket(parent);
      require(Files.readString(marker).equals("preserved"), "existing folder preservation");
      try (java.util.zip.ZipFile zip =
          new java.util.zip.ZipFile(packet.resolve("packet.zip").toFile())) {
        List<String> owned = project.files();
        Set<String> entries = new HashSet<>();
        zip.stream().forEach(entry -> entries.add(entry.getName()));
        require(entries.containsAll(owned), "declared packet source");
        if (owned.contains("LICENSE"))
          require(Arrays.equals(zip.getInputStream(zip.getEntry("LICENSE")).readAllBytes(),
              Files.readAllBytes(project.file("LICENSE"))), "MIT notice preserved in ZIP");
        require(
            entries.contains("packet.json") && entries.contains("checks/report.json"),
            "packet evidence");
        require(
            entries.stream()
                .allMatch(
                    path ->
                        owned.contains(path)
                            || path.equals("src/test/java/zero/community/HealthBarTest.java")
                            || path.equals("checks/report.json")
                            || path.equals("packet.json")),
            "no arbitrary repository files");
      }
      require(!Files.exists(packet.resolve(".git")), "no repository credentials");
      Path evidence =
          Path.of(Workshop.class.getProtectionDomain().getCodeSource().getLocation().toURI())
              .getParent()
              .resolve("workshop-proof.zip");
      Files.copy(packet.resolve("packet.zip"), evidence, StandardCopyOption.REPLACE_EXISTING);
      System.out.println("WORKSHOP_PACKET: " + evidence);
    } finally {
      try (var paths = Files.walk(parent)) {
        for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
      }
    }
  }

  private void verifyCandidateDrift() throws Exception {
    Path candidate = Files.createTempDirectory("zero-workshop-candidate-");
    try {
      for (String name : project.files()) {
        Path destination = candidate.resolve(name);
        Files.createDirectories(destination.getParent());
        Files.copy(project.file(name), destination);
      }
      Files.writeString(candidate.resolve("private-notes.txt"), "outside packet scope");
      ComponentProject copy = new ComponentProject(candidate);
      String originalPom = copy.read("pom.xml");
      for (String pomMutation : List.of(
          originalPom.replace("</project>","<profiles><profile><id>hidden</id></profile></profiles></project>"),
          originalPom.replace("</plugin>","<dependencies><dependency><groupId>example</groupId><artifactId>tool</artifactId><version>LATEST</version></dependency></dependencies></plugin>"))) {
        Files.writeString(candidate.resolve("pom.xml"),pomMutation);
        boolean rejected = false;
        try {ContributionPacket.inspect(copy);} catch (IOException expected) {rejected=true;}
        require(rejected,"unsupported profile/floating plugin dependency cannot export");
      }
      Files.writeString(candidate.resolve("pom.xml"),originalPom.replaceFirst("</plugin>",
          java.util.regex.Matcher.quoteReplacement("<dependencies><dependency><groupId> example.tools </groupId><artifactId> compiler-helper </artifactId><version> ${junit.version} </version></dependency></dependencies></plugin>"))
          .replace("<junit.version>5.11.4</junit.version>","<junit.version> 5.11.4 </junit.version>")
          .replace("<version>3.2.0</version>","<version> 3.2.0 </version>"));
      JsonObject pluginManifest = ContributionPacket.inspect(copy);
      boolean recorded = false;
      for (JsonElement item : pluginManifest.getAsJsonArray("dependencies"))
        if (item.getAsJsonObject().get("scope").getAsString().equals("plugin")) recorded=true;
      require(recorded,"pinned plugin dependency appears in packet metadata");
      Path pluginPacket = ContributionPacket.prepare(copy,candidate,WorkshopChecks.report(copy));
      Files.createDirectories(Path.of("target"));
      Files.copy(pluginPacket.resolve("packet.zip"),Path.of("target/workshop-plugin-proof.zip"),StandardCopyOption.REPLACE_EXISTING);
      Files.writeString(candidate.resolve("pom.xml"),originalPom);
      if (copy.files().contains("LICENSE")) {
        String notice = copy.read("LICENSE");
        JsonObject licensedReport = WorkshopChecks.report(copy);
        Files.writeString(candidate.resolve("LICENSE"), notice + "\n");
        boolean staleLicenseRejected = false;
        try { ContributionPacket.prepare(copy, candidate, licensedReport); }
        catch (IOException expected) { staleLicenseRejected = true; }
        require(staleLicenseRejected, "license drift invalidates source-bound export");
        Files.delete(candidate.resolve("LICENSE"));
        boolean missingLicenseRejected = false;
        try { ContributionPacket.inspect(copy); }
        catch (IOException expected) { missingLicenseRejected = true; }
        require(missingLicenseRejected, "MIT source requires its notice");
        Files.writeString(candidate.resolve("LICENSE"), notice);
      }
      JsonObject before = WorkshopChecks.report(copy);
      Files.writeString(
          candidate.resolve("src/main/java/zero/community/HealthBar.java"),
          "\n// Candidate edit requires a rebuilt artifact.\n",
          StandardOpenOption.APPEND);
      JsonObject edited = WorkshopChecks.report(copy);
      for (JsonElement element : edited.getAsJsonArray("checks")) {
        JsonObject item = element.getAsJsonObject();
        if (List.of(
                "source-runtime-match",
                "fractional-fill",
                "clamping",
                "independent-views",
                "invalid-maximum")
            .contains(item.get("id").getAsString()))
          require(
              item.get("status").getAsString().equals("unavailable"),
              "edited candidate cannot pass old binary checks");
      }
      boolean refused = false;
      try {
        ContributionPacket.prepare(copy, candidate, before);
      } catch (IOException expected) {
        refused = true;
      }
      require(refused, "source drift refuses old check report");
      String original = project.read("src/main/java/zero/community/HealthBar.java");
      Files.writeString(
          candidate.resolve("src/main/java/zero/community/HealthBar.java"),
          original.replace("this(\"Health\", maximum)", "this(\"Hit points\", maximum)"));
      try (CandidateBuild rebuilt = new CandidateBuild(copy)) {
        Object instance = rebuilt.type.getConstructor(int.class).newInstance(100);
        Node view = (Node) rebuilt.type.getMethod("view").invoke(instance);
        require(
            view.getAccessibleText().startsWith("Hit points:"),
            "edited source changes candidate view");
        for (JsonElement element : WorkshopChecks.report(copy, rebuilt).getAsJsonArray("checks"))
          require(
              !element.getAsJsonObject().get("status").getAsString().equals("failed"),
              "rebuilt candidate checks");
      }
      Files.writeString(
          candidate.resolve("src/main/java/zero/community/HealthBar.java"),
          original.replace("(double) this.health / maximum", "this.health / maximum"));
      try (CandidateBuild mutant = new CandidateBuild(copy)) {
        boolean failed = false;
        for (JsonElement element : WorkshopChecks.report(copy, mutant).getAsJsonArray("checks")) {
          JsonObject item = element.getAsJsonObject();
          if (item.get("id").getAsString().equals("fractional-fill"))
            failed = item.get("status").getAsString().equals("failed");
        }
        require(failed, "fractional fill mutant caught after local rebuild");
      }
      for (String apiMutation : List.of(
          original.replace("public HealthBar(int maximum)", "private HealthBar(int maximum)"),
          original.replace("public int getMaximum()", "public int removedMaximum()"),
          original.replace("public int getMaximum()", "public long getMaximum()"))) {
        require(!apiMutation.equals(original), "API mutant must change source");
        Files.writeString(candidate.resolve("src/main/java/zero/community/HealthBar.java"), apiMutation);
        try (CandidateBuild mutant = new CandidateBuild(copy)) {
          boolean failed = false;
          for (JsonElement element : WorkshopChecks.report(copy,mutant).getAsJsonArray("checks")) {
            JsonObject item = element.getAsJsonObject();
            if (item.get("id").getAsString().equals("public-api-compatibility"))
              failed = item.get("status").getAsString().equals("failed");
          }
          require(failed,"removed constructor/getter or changed return type must fail compatibility");
        }
      }
      Files.writeString(candidate.resolve("src/main/java/zero/community/HealthBar.java"), original);
      edited = WorkshopChecks.report(copy);
      Path exported = ContributionPacket.prepare(copy, candidate, edited);
      try (java.util.zip.ZipFile zip =
          new java.util.zip.ZipFile(exported.resolve("packet.zip").toFile())) {
        require(zip.getEntry("private-notes.txt") == null, "arbitrary candidate files excluded");
      }
    } finally {
      try (var paths = Files.walk(candidate)) {
        for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
      }
    }
  }

  private static void require(boolean value, String detail) {
    if (!value) throw new AssertionError(detail);
  }

  public static void main(String[] args) {
    launch(args);
  }
}
