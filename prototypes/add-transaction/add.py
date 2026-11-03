"""Fixed-fixture local Add experiment; see README for essential assumptions."""
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
from types import MappingProxyType

FIXTURE = None
HASHES = MappingProxyType({
    'LICENSE': '415208822651b7f460aaf152bb24ef81c22bc907c9375fb400dbebc9dbb61e88',
    'fixture-1.0.0-sources.jar': '317dde262b167389f86e8ca9dead8911a211e0a2f7d8a654df836ec59b465ee5',
    'fixture-1.0.0.jar': '4816f5627e7197b3885c89188d10b5c04d13449ed71c872992f31f4524b89d14',
    'fixture-1.0.0.pom': '4776c369144a82e7d3bf50fcbfb450df61a202125ae8bb8e36e181f286ea232a',
})
SIZES = MappingProxyType({'LICENSE': 1076, 'fixture-1.0.0-sources.jar': 371, 'fixture-1.0.0.jar': 1003, 'fixture-1.0.0.pom': 238})
CONTEXT = MappingProxyType({'account': 11, 'repository': 22, 'release': 33, 'version': '1.0.0'})
OLD_POM = b'<project>\n  <dependencies>\n  </dependencies>\n</project>\n'
NEW_POM = b'<project>\n  <dependencies>\n    <dependency>proof.fixture:fixture:1.0.0</dependency>\n  </dependencies>\n</project>\n'
OLD_PIN = b'{"libraries":[]}\n'
NEW_PIN = (json.dumps({'libraries': [{'coordinate': 'proof.fixture:fixture:1.0.0', 'files': dict(HASHES)}]}, sort_keys=True, separators=(',', ':')) + '\n').encode()
PATHS = tuple(['bundle/' + n for n in sorted(HASHES)] + ['pom.xml', 'zero-libraries.json'])
NEW = MappingProxyType({})

def configure_fixture(path):
    global FIXTURE, NEW
    fixture = Path(path)
    candidate = {}
    for name, expected in HASHES.items():
        try: data = (fixture / name).read_bytes()
        except OSError as e: raise Blocked('missing fixture: ' + name) from e
        if len(data) != SIZES[name] or digest(data) != expected:
            raise Blocked('fixture hash mismatch: ' + name)
        candidate['bundle/' + name] = data
    candidate.update({'pom.xml': NEW_POM, 'zero-libraries.json': NEW_PIN})
    FIXTURE, NEW = fixture, MappingProxyType(candidate)

OLD = MappingProxyType({**{'bundle/' + n: None for n in HASHES}, 'pom.xml': OLD_POM, 'zero-libraries.json': OLD_PIN})

class Blocked(Exception): pass

def digest(data): return hashlib.sha256(data).hexdigest()
def state(data): return None if data is None else digest(data)
def canonical(value): return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()

def check_fixture():
    for name, expected in HASHES.items():
        try: data = (FIXTURE / name).read_bytes()
        except OSError as e: raise Blocked('missing fixture: ' + name) from e
        if len(data) != SIZES[name] or digest(data) != expected or NEW['bundle/' + name] != data:
            raise Blocked('fixture hash mismatch: ' + name)

def safe(root, rel):
    p = root
    for part in Path(rel).parts:
        p = p / part
        if p.is_symlink(): raise Blocked('symlink: ' + str(p))
    return p

def read(root, rel):
    p = safe(root, rel)
    if not p.exists(): return None
    if not p.is_file(): raise Blocked('not a file: ' + rel)
    return p.read_bytes()

def syncdir(p):
    fd = os.open(p, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)

def write_new(p, data):
    with open(p, 'xb') as f:
        f.write(data); f.flush(); os.fsync(f.fileno())
    syncdir(p.parent)

def mark(hook, name):
    if hook: hook(name)

@contextlib.contextmanager
def lock(root):
    # The lock file is permanent: unlinking it would permit two lock inodes.
    p = safe(root, '.add-lock')
    fd = os.open(p, os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as e: raise Blocked('another Add holds the lock') from e
        yield
    finally:
        os.close(fd)

def expected_review():
    return {'context': dict(CONTEXT), 'files': {p: state(OLD[p]) for p in PATHS},
            'new': {p: state(NEW[p]) for p in PATHS},
            'sizes': dict(SIZES), 'notice': 'MIT license included; review the generated LICENSE before Add'}

def validate_prior(root):
    for p in PATHS:
        if read(root, p) != OLD[p]: raise Blocked('prior state differs: ' + p)

def review(root, context=None):
    root = Path(root)
    if context is None: context = CONTEXT
    with lock(root):
        if safe(root, '.add-transaction').exists(): raise Blocked('transaction or orphan already exists')
        if context != CONTEXT: raise Blocked('account/catalog drift')
        check_fixture(); validate_prior(root)
        return expected_review()

def journal():
    data = {'schema': 1, 'review': expected_review()}
    return canonical({'data': data, 'checksum': digest(canonical(data))}) + b'\n'

def validate_journal(tx):
    try: raw = (tx / 'journal.json').read_bytes()
    except OSError as e: raise Blocked('missing journal; preserve orphan for inspection') from e
    # Exact canonical trusted record rejects truncation, unknown fields and altered values.
    if raw != journal(): raise Blocked('unknown or damaged journal; preserve for inspection')
    for i, p in enumerate(PATHS):
        f = safe(tx, 'stage/' + str(i))
        if not f.is_file() or f.is_symlink() or digest(f.read_bytes()) != state(NEW[p]):
            raise Blocked('missing or damaged staged file: ' + p)

def recover_locked(root, hook=None):
    tx = safe(root, '.add-transaction')
    if not tx.is_dir() or tx.is_symlink(): raise Blocked('no valid transaction')
    validate_journal(tx)
    # Inspect all files before making further progress. Unexpected edits remain untouched.
    for p in PATHS:
        value = read(root, p)
        if value != OLD[p] and value != NEW[p]: raise Blocked('conflict, preserve student edit: ' + p)
    for i, p in enumerate(PATHS):
        current = read(root, p)
        if current == NEW[p]: continue
        if current != OLD[p]: raise Blocked('conflict, preserve student edit: ' + p)
        dest = safe(root, p)
        if p.startswith('bundle/'):
            # bundle directory exists before journal, and link never replaces a file.
            try: os.link(tx / 'stage' / str(i), dest, follow_symlinks=False)
            except FileExistsError as e: raise Blocked('destination appeared: ' + p) from e
        else:
            # Cooperative writers hold the same lock; the prior check is required.
            tmp = tx / ('replace-' + str(i))
            if tmp.is_symlink(): raise Blocked('replacement symlink: ' + str(tmp))
            if tmp.exists():
                if not tmp.is_file() or tmp.read_bytes() != NEW[p]: raise Blocked('unknown replacement file: ' + str(tmp))
            else:
                write_new(tmp, NEW[p]); mark(hook, 'replacement-staged-' + str(i))
            if read(root, p) != OLD[p]: raise Blocked('conflict, preserve student edit: ' + p)
            os.replace(tmp, dest)
        syncdir(dest.parent); mark(hook, 'installed-' + str(i))
    return {'status': 'committed', 'paths': list(PATHS)}

def apply(root, reviewed, context=None, cancel=False, hook=None):
    root = Path(root)
    if context is None: context = CONTEXT
    with lock(root):
        if cancel: return {'status': 'cancelled'}
        if context != CONTEXT or reviewed != expected_review(): raise Blocked('review or account/catalog drift')
        check_fixture(); validate_prior(root)
        tx = safe(root, '.add-transaction')
        if tx.exists(): raise Blocked('transaction or orphan already exists')
        tx.mkdir(); syncdir(root); mark(hook, 'transaction-created')
        stage = tx / 'stage'; stage.mkdir(); syncdir(tx)
        bundle = safe(root, 'bundle')
        if not bundle.exists(): bundle.mkdir(); syncdir(root)
        elif not bundle.is_dir(): raise Blocked('bundle is not a directory')
        for i, p in enumerate(PATHS):
            write_new(stage / str(i), NEW[p]); mark(hook, 'staged-' + str(i))
        write_new(tx / 'journal.tmp', journal()); os.replace(tx / 'journal.tmp', tx / 'journal.json'); syncdir(tx)
        mark(hook, 'journal-published')
        return recover_locked(root, hook)

def recover(root, hook=None):
    root = Path(root)
    with lock(root): return recover_locked(root, hook)
