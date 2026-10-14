"""Capture owned JavaFX examples from disposable copies of complete projects.

Run preparation first, then python3 scripts/capture-example-previews.py.
No source app, export, user account, or shared framework is modified. Each owned
app is started, allowed startup pulses, snapshotted, stopped and closed. The
receipt includes actual dimensions/color counts and finite process outcomes.
Composed apps also capture their native Start-button state. Drawing pad retains
its blank startup in the ignored project and captures one finite mouse stroke.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import time

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--projects", type=Path, default=ROOT / "dist/example-projects")
    parser.add_argument("--output", type=Path, default=ROOT / "website/public/example-previews")
    parser.add_argument("--evidence", type=Path, default=ROOT / ".verification/example-previews")
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--timeout", type=int, default=90)
    args = parser.parse_args()
    ids = json.loads(subprocess.check_output(
        ["node", "--input-type=module", "-e",
         "import {examples} from './website/lib/learning.mjs'; console.log(JSON.stringify(examples.map(x=>x.id)))"],
        cwd=ROOT, text=True))
    if args.only:
        unknown = set(args.only) - set(ids)
        if unknown:
            parser.error(f"Unknown examples: {sorted(unknown)}")
        ids = [id for id in ids if id in args.only]
    args.output.mkdir(parents=True, exist_ok=True)
    args.evidence.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    if not env.get("JAVA_HOME") and Path("/usr/libexec/java_home").is_file():
        env["JAVA_HOME"] = subprocess.check_output(["/usr/libexec/java_home", "-v", "21"], text=True).strip()
    receipts = []
    started = time.monotonic()
    for id in ids:
        before = time.monotonic()
        project = args.projects / id
        if not (project / "pom.xml").is_file():
            raise SystemExit(f"Prepare complete example project first: {project}")
        dest = args.evidence / "projects" / id
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(project, dest, ignore=shutil.ignore_patterns("target", ".git"))
        shutil.copy2(ROOT / "scripts/example-previews/CaptureExample.java", dest / "src/main/java/CaptureExample.java")
        outputs = [args.output.resolve() / f"{id}.png"]
        if id in ("composed-study", "composed-game"):
            outputs.append(args.output.resolve() / f"{id}-started.png")
        for output in outputs:
            output.unlink(missing_ok=True)
        command = ["./mvnw", "-B", "-Dapp.mainClass=CaptureExample",
                   "-Djavafx.args=" + " ".join(str(output) for output in outputs),
                   "clean", "compile", "javafx:run"]
        process = subprocess.Popen(command, cwd=dest, env=env, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True, start_new_session=True)
        timed_out = False
        try:
            log, _ = process.communicate(timeout=args.timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(process.pid, signal.SIGTERM)
            try:
                log, _ = process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                log, _ = process.communicate()
        (args.evidence / f"{id}.log").write_text(log)
        images = []
        for name, width, height, colors in re.findall(r"PREVIEW_OK (\S+) (\d+)x(\d+) colors=(\d+)", log):
            path = args.output / name
            if path.is_file():
                images.append({"name": name, "width": int(width), "height": int(height),
                               "colors": int(colors), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                               "bytes": path.stat().st_size})
        ok = (not timed_out and process.returncode == 0 and len(images) == len(outputs)
              and all(image["colors"] > 1 for image in images))
        receipt = {"id": id, "compiled": "BUILD SUCCESS" in log,
                   "captured": ok, "timeout": timed_out, "exit_code": process.returncode,
                   "seconds": round(time.monotonic() - before, 2), "images": images}
        receipts.append(receipt)
        print(f"{id}: {'OK' if ok else 'FAILED'} ({receipt['seconds']}s)", flush=True)
        if not ok:
            print(log[-4000:], flush=True)
    receipt = {"platform": os.uname().sysname, "java_home": env.get("JAVA_HOME"),
               "method": "JavaFX Scene.snapshot after 750ms startup pulses; native Start.fire for optional started states; finite native mouse stroke for drawing (blank startup retained in ignored project)",
               "seconds": round(time.monotonic() - started, 2), "examples": receipts,
               "success_count": sum(row["captured"] for row in receipts),
               "failure_count": sum(not row["captured"] for row in receipts)}
    (args.evidence / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    raise SystemExit(0 if receipt["failure_count"] == 0 else 1)


if __name__ == "__main__":
    main()
