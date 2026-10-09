"""Build and check an isolated standalone starter using its pinned wrapper."""
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
with tempfile.TemporaryDirectory(prefix="zero reach coin ") as temporary:
    project = Path(temporary) / "starter"
    shutil.copytree(starter, project, ignore=shutil.ignore_patterns("target", "examples", ".git"))
    for name in ("Main.java", "Player.java"):
        shutil.copy2(example / name, project / "src/main/java" / name)
    shutil.copy2(checks / "ReachCoinCheck.java", project / "src/main/java/ReachCoinCheck.java")
    wrapper = "mvnw.cmd" if os.name == "nt" else "./mvnw"
    result = subprocess.run(
        [wrapper, "-B", "-Dapp.mainClass=ReachCoinCheck", "clean", "compile", "javafx:run"],
        cwd=project, capture_output=True, text=True, timeout=60)
    if result.returncode or "REACH_COIN_OK" not in result.stdout:
        print(result.stdout[-6000:], result.stderr[-3000:])
        raise SystemExit(result.returncode or 1)
    evidence = repo / ".verification/reach-the-coin"
    evidence.mkdir(parents=True, exist_ok=True)
    for name in ("initial.png", "won.png"):
        shutil.copy2(project / name, evidence / name)
    print("Pinned wrapper compile and deterministic native JavaFX checks passed.")
assert (starter / "src/main/java/Main.java").read_bytes() == default_main
assert default_main == (starter / "examples/quiz/Main.java").read_bytes()
print("Default quiz unchanged; disposable project (path with spaces) removed.")
