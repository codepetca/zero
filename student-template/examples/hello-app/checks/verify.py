"""Build the exact copied example and exercise ordinary JavaFX controls without external CSS."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

checks = Path(__file__).resolve().parent
example = checks.parent
starter = example.parent.parent
repo = starter.parent
subprocess.run(["node", str(repo / "scripts/prepare-starter.mjs")], check=True)
default_main = (starter / "src/main/java/Main.java").read_bytes()
with tempfile.TemporaryDirectory(prefix="zero hello app ") as temporary:
    project = Path(temporary) / "starter"
    shutil.copytree(starter, project, ignore=shutil.ignore_patterns("target", "examples", ".git"))
    shutil.copy2(example / "Main.java", project / "src/main/java/Main.java")
    shutil.copy2(checks / "HelloAppCheck.java", project / "src/main/java/HelloAppCheck.java")
    assert not (project / "src/main/resources/hello-app/theme.css").exists()
    wrapper = "mvnw.cmd" if os.name == "nt" else "./mvnw"

    def run(main, marker):
        result = subprocess.run(
            [wrapper, "-B", "-Dapp.mainClass=" + main, "clean", "compile", "javafx:run"],
            cwd=project, capture_output=True, text=True, timeout=60)
        if result.returncode or marker not in result.stdout:
            print(result.stdout[-6000:], result.stderr[-3000:])
            raise SystemExit(result.returncode or 1)
        print(marker)

    run("HelloAppCheck", "HELLO_APP_OK")
    evidence = Path(os.environ.get("ZERO_HELLO_EVIDENCE", repo / ".verification/hello-app"))
    evidence.mkdir(parents=True, exist_ok=True)
    for name in ("initial.png", "greeting.png", "focus.png"):
        shutil.copy2(project / name, evidence / name)
assert (starter / "src/main/java/Main.java").read_bytes() == default_main
print("Pinned wrapper checks passed; default Main unchanged; disposable project removed.")
