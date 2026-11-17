"""Package the verified vendor archives for one local Zero pilot."""
import hashlib
import json
import re
import shutil
import stat
import sys
import zipfile
from pathlib import Path


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify(file, pin):
    if file.stat().st_size != pin["size"] or digest(file) != pin["sha256"]:
        raise ValueError(f"Archive differs from its pinned bytes: {file.name}")


def extract_runtime(archive, folder, prefix):
    names = set()
    with zipfile.ZipFile(archive) as vendor:
        for entry in vendor.infolist():
            member = entry.filename.rstrip("/")
            if prefix:
                if member == prefix and entry.is_dir():
                    continue
                if not member.startswith(prefix + "/"):
                    raise ValueError(f"Unexpected archive root: {member}")
                member = member[len(prefix) + 1:]
            parts = member.split("/")
            if any(not part or part in (".", "..") or part.endswith((".", " "))
                   or re.search(r'[\\:"<>|?*\x00-\x1f]', part)
                   or re.fullmatch(r"(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\..*)?", part, re.I)
                   for part in parts):
                raise ValueError(f"Unsafe Windows path: {member}")
            file_type = stat.S_IFMT(entry.external_attr >> 16)
            expected_type = stat.S_IFDIR if entry.is_dir() else stat.S_IFREG
            if file_type not in (0, expected_type) or member.casefold() in names:
                raise ValueError(f"Unsupported or duplicate archive entry: {member}")
            names.add(member.casefold())
            destination = folder.joinpath(*parts)
            if entry.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                with vendor.open(entry) as source, destination.open("xb") as output:
                    shutil.copyfileobj(source, output)


def main():
    if len(sys.argv) not in (5, 6):
        raise ValueError("Expected downloads, stage, output, manifest, and optional VSCodium pin")
    downloads, stage, output, manifest = map(Path, sys.argv[1:5])
    codium_pin = Path(sys.argv[5]) if len(sys.argv) == 6 else None
    metadata = json.loads((stage / "BUILD.json").read_text(encoding="utf-8"))
    pins = json.loads(manifest.read_text(encoding="utf-8"))["architectures"]["x64"]
    prefixes = {"jdk": pins["jdk"]["version"], "git": "",
                "node": f'node-v{pins["node"]["version"]}-win-x64'}
    tools = stage / "tools"
    tools.mkdir()
    for kind, prefix in prefixes.items():
        archive = downloads / f"{kind}.zip"
        pin = pins[kind]
        verify(archive, pin)
        destination = tools / kind
        extract_runtime(archive, destination, prefix)
        if kind == "git":
            actual = {file.relative_to(destination).as_posix(): digest(file)
                      for file in destination.rglob("*") if file.is_file()}
            if actual != pin["files"]:
                raise ValueError("Extracted Git inventory differs from the launcher pin")
        (destination / ".zero-asset.sha256").write_text(pin["sha256"] + "\n", encoding="ascii")

    java_vsix = downloads / "java.vsix"
    verify(java_vsix, metadata["javaExtension"])
    with zipfile.ZipFile(java_vsix) as package:
        java = json.loads(package.read("extension/package.json"))
        if (f'{java["publisher"]}.{java["name"]}' != "redhat.java" or
                java["version"] != metadata["javaExtension"]["version"] or
                any(re.search(r"/jre/|\.(exe|dll|node)$", name, re.I) for name in package.namelist())):
            raise ValueError("Expected the pinned Java extension without a bundled JRE")
    shutil.copyfile(java_vsix, tools / "java.vsix")

    executables = ["jdk/bin/java.exe", "jdk/bin/javac.exe", "git/cmd/git.exe", "node/node.exe"]
    if codium_pin:
        pin = json.loads(codium_pin.read_text(encoding="utf-8"))
        archive = downloads / "vscodium.zip"
        verify(archive, pin)
        destination = tools / "vscodium"
        extract_runtime(archive, destination, "")
        app = destination / "resources/app"
        for member in (app / "out/cli.js", app / "product.json", app / "package.json"):
            if not member.is_file():
                raise ValueError(f"Missing VSCodium file: {member.relative_to(destination)}")
        package = json.loads((app / "package.json").read_text(encoding="utf-8"))
        product = json.loads((app / "product.json").read_text(encoding="utf-8"))
        if (package.get("version") != pin["version"] or product.get("quality") != "stable" or
                product.get("applicationName") != "codium"):
            raise ValueError("Expected the pinned stable VSCodium version")
        if not (app / "LICENSE.txt").is_file():
            raise ValueError("Missing VSCodium license")
        (destination / ".zero-asset.sha256").write_text(pin["sha256"] + "\n", encoding="ascii")
        executables.append("vscodium/VSCodium.exe")

    for member in executables:
        with (tools / member).open("rb") as executable:
            if executable.read(2) != b"MZ":
                raise ValueError(f"Missing Windows executable: {member}")
    flavor = "bundled" if codium_pin else "pilot"
    name = f'Zero-{metadata["kitVersion"]}-windows-portable-{flavor}-x64.zip'
    file = output / name
    with zipfile.ZipFile(file, "x", zipfile.ZIP_DEFLATED, compresslevel=3) as candidate:
        for member in sorted(stage.rglob("*")):
            if member.is_file():
                candidate.write(member, member.relative_to(stage.parent).as_posix())
    with zipfile.ZipFile(file) as candidate:
        bad = candidate.testzip()
        if bad:
            raise ValueError(f"Corrupt packaged bytes for {bad}")
    sha256 = digest(file)
    (output / "SHA256SUMS.txt").write_text(f"{sha256}  {name}\n", encoding="ascii")
    print(f"{file} ({file.stat().st_size:,} bytes, SHA-256 {sha256})")


if __name__ == "__main__":
    main()
