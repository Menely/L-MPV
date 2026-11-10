"""Validate the actual inference-v1 binary layout before publication; no GPU required."""
import argparse
import ctypes as C
import json
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile
from dependency_binary_utils import require_x64


def component_dir(root, component):
    unpacked = root / f'unpacked-{component}'
    nested = unpacked / 'animejanai' / 'inference'
    return nested if nested.is_dir() else unpacked


def require_bridge_exports(path):
    # Inspect exports without resolving imports or executing DLL initialization.
    kernel = C.WinDLL('kernel32', use_last_error=True)
    kernel.LoadLibraryExW.argtypes = [C.c_wchar_p, C.c_void_p, C.c_uint32]
    kernel.LoadLibraryExW.restype = C.c_void_p
    kernel.GetProcAddress.argtypes = [C.c_void_p, C.c_char_p]
    kernel.GetProcAddress.restype = C.c_void_p
    kernel.FreeLibrary.argtypes = [C.c_void_p]
    handle = kernel.LoadLibraryExW(str(path), None, 1)  # DONT_RESOLVE_DLL_REFERENCES
    if not handle:
        raise C.WinError(C.get_last_error())
    try:
        for name in (b'aji_create', b'aji_destroy', b'aji_configure', b'aji_set_slot'):
            if not kernel.GetProcAddress(handle, name):
                raise ValueError(f'{path.name}: missing bridge export {name.decode()}')
    finally:
        kernel.FreeLibrary(handle)


def check(root):
    pins = json.loads(Path(__file__).with_name('animejanai-dependencies.json').read_text(encoding='utf8'))
    bridge = root / 'aji-check'
    for name in ('aji.dll', 'aji_dml.dll', 'aji_trt.dll'):
        require_x64(bridge / name)
    require_bridge_exports(bridge / 'aji.dll')
    runtime = component_dir(root, 'runtime')
    for name in ('trtexec.exe', 'nvinfer_11.dll', 'cudart64_13.dll'):
        require_x64(runtime / name)
    for path in runtime.iterdir():
        if path.suffix.lower() in ('.dll', '.exe'):
            require_x64(path)
    version = subprocess.run([str(runtime / 'trtexec.exe'), '--help'], capture_output=True,
                             text=True, timeout=30, check=True)
    major, minor, patch, build = map(int, pins['tensorrt'].split('.'))
    expected = major * 10000 + minor * 100 + patch
    if not re.search(rf'\[TensorRT v{expected}\]\s+\[b{build}\]', version.stdout + version.stderr):
        raise ValueError(f'TensorRT version does not match {pins["tensorrt"]}')
    for arch in pins['architectures']:
        directory = component_dir(root, arch)
        builder = directory / f'nvinfer_builder_resource_{arch}_11.dll'
        require_x64(builder)
        builders = list(directory.glob('nvinfer_builder_resource_*.dll'))
        if builders != [builder]:
            raise ValueError(f'{arch}: unexpected builder set: {[path.name for path in builders]}')
    # These paths must match extract_specific_files_from_zip in the player.
    packages = {
        f'microsoft.ml.onnxruntime.directml.{pins["onnxruntime_directml"]}.nupkg': (
            'runtimes/win-x64/native/onnxruntime.dll',
            'runtimes/win-x64/native/onnxruntime_providers_shared.dll',
        ),
        f'microsoft.ai.directml.{pins["directml"]}.nupkg': ('bin/x64-win/DirectML.dll',),
    }
    with tempfile.TemporaryDirectory(prefix='verify-inference-', dir=root) as temporary:
        for name, entries in packages.items():
            with zipfile.ZipFile(root / name) as archive:
                for entry in entries:
                    path = Path(temporary) / Path(entry).name
                    path.write_bytes(archive.read(entry))
                    require_x64(path)
        with zipfile.ZipFile(root / 'l-mpv_convert_fp16.zip') as archive:
            if archive.namelist() != ['l-mpv_convert_fp16.exe']:
                raise ValueError('FP16 converter ZIP must contain only l-mpv_convert_fp16.exe at its root')
            converter = Path(temporary) / 'l-mpv_convert_fp16.exe'
            converter.write_bytes(archive.read('l-mpv_convert_fp16.exe'))
            require_x64(converter)
    return {'aji': pins['aji'], 'tensorrt': pins['tensorrt'], 'builders': pins['architectures'],
            'onnxruntime_directml': pins['onnxruntime_directml'], 'directml': pins['directml'],
            'architecture': 'AMD64'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    print(json.dumps(check(args.directory.resolve()), indent=2))
