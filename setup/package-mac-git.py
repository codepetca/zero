"""Extract the Git commands from the pinned GitHub Desktop archives."""
import hashlib
import json
from pathlib import Path
import shutil
import stat
import sys
import tarfile

configuration, input_folder, output_folder = map(Path, sys.argv[1:])
pins = json.loads(configuration.read_text())["architectures"]
output_folder.mkdir()
for arch, architecture in pins.items():
    pin = architecture["git"]
    source = input_folder / f"{arch}.tar.gz"
    data = source.read_bytes()
    if len(data) != pin["size"] or hashlib.sha256(data).hexdigest() != pin["sha256"]:
        raise ValueError(f"Git archive failed its published checksum for {arch}")
    with tarfile.open(source, "r:gz") as original:
        entries = {item.name.removeprefix("./"): item for item in original}
        required = {"bin/git", "libexec/git-core/git", "libexec/git-core/git-remote-http",
                    "libexec/git-core/git-remote-https"}
        if not required <= entries.keys():
            raise ValueError(f"Missing Git commands for {arch}")
        destination = output_folder / f"{arch}.tar.xz"
        with tarfile.open(destination, "w:xz", preset=9, format=tarfile.USTAR_FORMAT) as compact:
            for name, item in sorted(entries.items()):
                if name == "libexec/git-core/git":
                    # Upstream installs a second identical copy for Git's own subprocesses.
                    if original.extractfile(item).read() != original.extractfile(entries["bin/git"]).read():
                        raise ValueError("Unexpected second Git executable")
                    item = tarfile.TarInfo(name)
                    item.type = tarfile.SYMTYPE
                    item.linkname = "../../bin/git"
                    item.mode = 0o755
                elif not (name == "bin/git"
                          or name.startswith("share/git-core/templates/")
                          or (name.startswith("libexec/git-core/git-") and "/" not in name.removeprefix("libexec/git-core/")
                              and not name.endswith((".json", ".dll", ".dylib", ".pdb"))
                              and name not in {"libexec/git-core/git-lfs", "libexec/git-core/git-credential-manager"})):
                    continue
                else:
                    item = item.replace(name=name, uid=0, gid=0, uname="", gname="", mtime=0)
                if item.isfile():
                    compact.addfile(item, original.extractfile(entries[name]))
                elif item.issym() or item.isdir():
                    compact.addfile(item)
                else:
                    raise ValueError(f"Unexpected Git archive entry {name}")
        if destination.stat().st_size > 3_100_000:
            raise ValueError(f"Compact Git for {arch} exceeds its size budget")

shutil.copyfile(input_folder / "COPYING", output_folder / "COPYING")
shutil.copyfile(configuration.with_name("mac-git-notice.txt"), output_folder / "NOTICE")
