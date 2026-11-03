"""Create the prior proof's Java fixture in disposable storage, without network."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import zipfile

PROOF = Path(__file__).resolve().parent.parent / 'project-owned-bundle' / 'proof.py'

def build(output):
    output = Path(output)
    spec = importlib.util.spec_from_file_location('bundle_proof_fixture', PROOF)
    proof = importlib.util.module_from_spec(spec); spec.loader.exec_module(proof)
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp); src = root/'src/proof/fixture/Score.java'
        src.parent.mkdir(parents=True); src.write_text(proof.SOURCE, encoding='utf-8')
        classes = root/'classes'; classes.mkdir()
        subprocess.run(['javac', '--release', '17', '-d', str(classes), str(src)], check=True)
        def archive(name, entry, data):
            info = zipfile.ZipInfo(entry, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = 0o100644 << 16
            with zipfile.ZipFile(output/name, 'w') as z: z.writestr(info, data)
        archive('fixture-1.0.0.jar', 'proof/fixture/Score.class', (classes/'proof/fixture/Score.class').read_bytes())
        archive('fixture-1.0.0-sources.jar', 'proof/fixture/Score.java', proof.SOURCE.encode())
        (output/'fixture-1.0.0.pom').write_bytes(proof.POM.encode())
        (output/'LICENSE').write_bytes(proof.LICENSE.encode())
