"""Write/verify Finder metadata on an already mounted Zero image, without Finder automation."""
import argparse
import hashlib
import ctypes
import json
import os
import re
from pathlib import Path
import stat
import sys
import struct
from importlib.metadata import version

for package, pin in (("ds_store", "1.3.3"), ("mac_alias", "2.2.3")):
    if version(package) != pin:
        raise RuntimeError(f"{package} must be pinned to {pin}")
from ds_store import DSStore
from mac_alias import Alias, osx

SPEC = json.loads(Path(__file__).with_suffix('.json').read_text())
MAX_DS_STORE = 65536

def require(condition, message):
    if not condition:
        raise ValueError(message)

def owned_file(path, limit):
    st = path.lstat()
    require(stat.S_ISREG(st.st_mode) and 0 < st.st_size <= limit, f"Invalid owned file: {path.name}")

def settings(alias):
    bwsp = {"WindowBounds": SPEC['windowBounds'], "ShowStatusBar": False,
            "ShowTabView": False, "ShowToolbar": False, "ShowPathbar": False,
            "ShowSidebar": False, "ContainerShowSidebar": False,
            "PreviewPaneVisibility": False, "SidebarWidth": 0}
    icvp = {"viewOptionsVersion": 1, "backgroundType": 2,
            "backgroundColorRed": 1.0, "backgroundColorGreen": 1.0, "backgroundColorBlue": 1.0,
            "backgroundImageAlias": alias, "gridOffsetX": 0.0, "gridOffsetY": 0.0,
            "gridSpacing": 100.0, "arrangeBy": "none", "showIconPreview": False,
            "showItemInfo": False, "labelOnBottom": True, "textSize": float(SPEC['textSize']),
            "iconSize": float(SPEC['iconSize']), "scrollPositionX": 0.0, "scrollPositionY": 0.0}
    return bwsp, icvp

def resolve_alias(data):
    # Native CoreFoundation resolution proves the alias resolves on this mounted
    # image, including after conversion/remount at a different path. No UI/mount.
    cf = ctypes.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
    ptr = ctypes.c_void_p
    def function(name, restype, args):
        fn = getattr(cf, name); fn.restype = restype; fn.argtypes = args; return fn
    create = function('CFDataCreate', ptr, [ptr, ptr, ctypes.c_long])
    bookmark = function('CFURLCreateBookmarkDataFromAliasRecord', ptr, [ptr, ptr])
    resolve = function('CFURLCreateByResolvingBookmarkData', ptr, [ptr, ptr, ctypes.c_ulong, ptr, ptr, ptr, ptr])
    copy_path = function('CFURLCopyFileSystemPath', ptr, [ptr, ctypes.c_int])
    get_string = function('CFStringGetCString', ctypes.c_bool, [ptr, ptr, ctypes.c_long, ctypes.c_uint])
    release = function('CFRelease', None, [ptr])
    references = []
    try:
        raw = ctypes.create_string_buffer(data)
        alias = create(None, raw, len(data)); references.append(alias)
        mark = bookmark(None, alias); require(mark, 'Invalid native alias bookmark'); references.append(mark)
        stale = ctypes.c_bool()
        url = resolve(None, mark, (1 << 8) | (1 << 9), None, None, ctypes.byref(stale), None)
        require(url, 'Background alias does not resolve without UI/mounting'); references.append(url)
        result = copy_path(url, 0); require(result, 'Background alias has no filesystem path'); references.append(result)
        buf = ctypes.create_string_buffer(4096)
        require(get_string(result, buf, len(buf), 0x08000100), 'Background alias path exceeds bounds')
        return Path(buf.value.decode()).resolve()
    finally:
        for item in reversed(references):
            if item: release(item)

def volume_open_folder(mount, write=False):
    # HFS+ volume FinderInfo word 2 is the folder CNID opened on mount.
    # Use the native metadata API because bless --openfolder is unavailable on
    # Apple Silicon. Preserve every other word, including volume identity.
    attrs = osx.attrlist(bitmapcount=5, commonattr=osx.ATTR_CMN_FNDRINFO, volattr=osx.ATTR_VOL_INFO)
    libc = ctypes.CDLL('/usr/lib/libc.dylib', use_errno=True)
    buf = ctypes.create_string_buffer(36)
    require(libc.getattrlist(os.fsencode(mount), ctypes.byref(attrs), buf, len(buf), 0) == 0,
            'Cannot read HFS+ open-folder metadata')
    root_id = osx.getattrlist(str(mount), [osx.ATTR_CMN_FILEID, 0, 0, 0, 0], 0)[0]
    require(root_id == 2, 'Expected HFS+ root folder identity')
    info = bytearray(buf.raw[4:36])
    if write:
        struct.pack_into('>I', info, 8, root_id)
        payload = ctypes.create_string_buffer(bytes(info), 32)
        require(libc.setattrlist(os.fsencode(mount), ctypes.byref(attrs), payload, 32, 0) == 0,
                'Cannot set HFS+ open-folder metadata')
    else:
        require(struct.unpack_from('>I', info, 8)[0] == root_id, 'Image must open its root Finder window')

def verify(mount, volume_name, check_root=True):
    if check_root:
        require(sorted(p.name for p in mount.iterdir()) == ['.DS_Store', '.background', 'Applications', 'Zero.app'], 'Unexpected mounted image root')
    app = mount / 'Zero.app'; bg = mount / '.background'; apps = mount / 'Applications'
    require(stat.S_ISDIR(app.lstat().st_mode), 'App must be an owned directory')
    require(stat.S_ISDIR(bg.lstat().st_mode), 'Background must be an owned directory')
    require(sorted(p.name for p in bg.iterdir()) == ['arrow.png'], 'Unexpected background contents')
    require(apps.is_symlink() and os.readlink(apps) == '/Applications', 'Applications link differs')
    volume_open_folder(mount)
    ds = mount / '.DS_Store'; background = mount / '.background' / 'arrow.png'
    owned_file(ds, MAX_DS_STORE); owned_file(background, 65536)
    require(hashlib.sha256(background.read_bytes()).hexdigest() == SPEC['backgroundSha256'], 'Background pixels differ')
    with DSStore.open(str(ds), 'r') as store:
        entries = list(store)
        require(sorted((e.filename, e.code) for e in entries) == sorted([
            ('.', b'bwsp'), ('.', b'icvp'), ('.', b'icvl'), ('.', b'vSrn'),
            ('Zero.app', b'Iloc'), ('Applications', b'Iloc')]), 'Unexpected Finder metadata records')
        require(store['.']['icvl'] == (b'type', b'icnv'), 'Finder must use icon view')
        require(store['.']['vSrn'] == (b'long', 1), 'Finder view settings version')
        alias = store['.']['icvp'].get('backgroundImageAlias')
        require(isinstance(alias, bytes) and 0 < len(alias) <= 4096, 'Invalid background alias size')
        bwsp, icvp = settings(alias)
        require(store['.']['bwsp'] == bwsp, 'Finder window bounds/chrome differ')
        require(store['.']['icvp'] == icvp, 'Finder icon/background settings differ')
        for name, position in SPEC['iconLocations'].items():
            require(store[name]['Iloc'] == tuple(position), f'Finder icon position differs: {name}')
        parsed = Alias.from_bytes(alias)
        current = Alias.for_file(str(background))
        require(parsed.target.posix_path == '/.background/arrow.png', 'Background alias escaped image')
        require(parsed.volume.name == volume_name and current.volume.name == volume_name.encode('utf-8'), 'Background alias volume differs')
        require(parsed.volume.creation_date == current.volume.creation_date, 'Background alias volume identity differs')
        require(parsed.target.cnid == current.target.cnid and parsed.target.creation_date == current.target.creation_date,
                'Background alias file identity differs')
        require(resolve_alias(alias) == background.resolve(), 'Background alias resolves outside mounted image')
    print('Zero Finder layout and mounted background alias verified')

def write(mount, volume_name):
    require(sys.platform == 'darwin' and os.path.ismount(mount), 'Layout must be written on a mounted macOS image')
    require(not (mount / '.DS_Store').exists(), 'Existing Finder metadata refused')
    background = mount / '.background' / 'arrow.png'; owned_file(background, 65536)
    alias = Alias.for_file(str(background)).to_bytes()
    bwsp, icvp = settings(alias)
    with DSStore.open(str(mount / '.DS_Store'), 'w+') as store:
        store['.']['vSrn'] = ('long', 1)
        store['.']['bwsp'] = bwsp
        store['.']['icvp'] = icvp
        store['.']['icvl'] = ('type', b'icnv')
        for name, position in SPEC['iconLocations'].items(): store[name]['Iloc'] = tuple(position)
    volume_open_folder(mount, write=True)
    # The builder removes filesystem-generated metadata before its strict final
    # root verification; writable HFS may recreate .fseventsd during this call.
    verify(mount, volume_name, check_root=False)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['write', 'verify'])
    parser.add_argument('mount', type=Path)
    parser.add_argument('--volume-name', required=True, help='Exact versioned volume name from macArtifactIdentity(kitVersion)')
    args = parser.parse_args()
    matched = re.fullmatch(r'Zero (\d+)\.(\d+)\.(\d+)', args.volume_name)
    require(matched and tuple(map(int, matched.groups())) > (0, 5, 13), 'Invalid styled volume generation')
    {'write': write, 'verify': verify}[args.action](args.mount.resolve(), args.volume_name)
