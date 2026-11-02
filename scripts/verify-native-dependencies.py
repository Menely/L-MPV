"""Check the actual Windows x64 binaries before publishing deps-v1 (stdlib only)."""
import argparse
import ctypes as C
import json
from pathlib import Path
import re
import struct
import subprocess


def require_x64(path):
    with path.open('rb') as stream:
        if stream.read(2) != b'MZ':
            raise ValueError(f'{path.name}: not a PE binary')
        stream.seek(0x3C)
        offset = struct.unpack('<I', stream.read(4))[0]
        stream.seek(offset)
        signature, machine = struct.unpack('<4sH', stream.read(6))
        if signature != b'PE\0\0' or machine != 0x8664:
            raise ValueError(f'{path.name}: expected Windows AMD64')


def check(directory, ffmpeg_tag, mediainfo_version):
    pins = json.loads(Path(__file__).with_name('animejanai-dependencies.json').read_text(encoding='utf8'))
    for name in ('libmpv-2.dll', 'ffmpeg.exe', 'mediainfo.dll'):
        require_x64(directory / name)
    dll_directory = __import__('os').add_dll_directory(str(directory))
    try:
        lib = C.CDLL(str(directory / 'libmpv-2.dll'))
        lib.mpv_create.restype = C.c_void_p
        lib.mpv_initialize.argtypes = [C.c_void_p]
        lib.mpv_destroy.argtypes = [C.c_void_p]
        lib.mpv_set_option_string.argtypes = [C.c_void_p, C.c_char_p, C.c_char_p]
        lib.mpv_get_property_string.argtypes = [C.c_void_p, C.c_char_p]
        lib.mpv_get_property_string.restype = C.c_void_p
        lib.mpv_free.argtypes = [C.c_void_p]
        ctx = lib.mpv_create()
        if not ctx:
            raise RuntimeError('mpv_create failed')
        try:
            for key, value in ((b'config', b'no'), (b'load-scripts', b'no'), (b'vo', b'null'), (b'ao', b'null')):
                if lib.mpv_set_option_string(ctx, key, value) < 0:
                    raise RuntimeError(f'mpv rejected option {key!r}')
            if lib.mpv_initialize(ctx) < 0:
                raise RuntimeError('libmpv initialization failed')
            ptr = lib.mpv_get_property_string(ctx, b'mpv-version')
            if not ptr:
                raise RuntimeError('libmpv returned no version')
            try:
                mpv_version = C.string_at(ptr).decode('utf8')
            finally:
                lib.mpv_free(ptr)
            reported = re.search(r'-g([a-f0-9]{7,40})\b', mpv_version)
            expected = pins['mpv_release'].rsplit('-', 1)[1]
            if not reported or not (expected.startswith(reported[1]) or reported[1].startswith(expected)):
                raise ValueError(f'Unexpected libmpv build: {mpv_version}; expected {expected}')
        finally:
            lib.mpv_destroy(ctx)
        media = C.WinDLL(str(directory / 'mediainfo.dll'))
        media.MediaInfo_Option.argtypes = [C.c_void_p, C.c_wchar_p, C.c_wchar_p]
        media.MediaInfo_Option.restype = C.c_wchar_p
        media_version = media.MediaInfo_Option(None, 'Info_Version', '')
        if not media_version or not re.search(r'\bv' + re.escape(mediainfo_version) + r'(?![\d.])', media_version):
            raise ValueError(f'Unexpected MediaInfo build: {media_version}; expected {mediainfo_version}')
        ffmpeg = subprocess.run([str(directory / 'ffmpeg.exe'), '-version'], capture_output=True, text=True, timeout=20, check=True)
        ffmpeg_version = ffmpeg.stdout.splitlines()[0]
        if f'ffmpeg version {ffmpeg_tag}-' not in ffmpeg_version:
            raise ValueError(f'Unexpected FFmpeg build: {ffmpeg_version}; expected {ffmpeg_tag}')
        return {'libmpv': mpv_version, 'mediainfo': media_version, 'ffmpeg': ffmpeg_version, 'architecture': 'AMD64'}
    finally:
        dll_directory.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--ffmpeg-tag', required=True)
    parser.add_argument('--mediainfo-version', required=True)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = check(args.directory.resolve(), args.ffmpeg_tag, args.mediainfo_version)
    encoded = json.dumps(result, ensure_ascii=False, indent=2)
    if args.report:
        args.report.write_text(encoded + '\n', encoding='utf8')
    print(encoded)
