"""Exercise the real worker: native IPC, exact BGRA output, graceful quit and parent death.
Usage: python scripts/check-thumbnail-worker.py --exe Portable-L-MPV/l-mpv.exe --ffmpeg Portable-L-MPV/ffmpeg.exe
All video data is generated locally; no user media/configuration is modified.
"""
import argparse, ctypes as c, json, os, subprocess, sys, time, shutil, tempfile
from pathlib import Path
parser = argparse.ArgumentParser(description="Check L-MPV's private libmpv thumbnail worker on Windows")
parser.add_argument('--exe', required=True, type=Path)
parser.add_argument('--ffmpeg', type=Path)
parser.add_argument('--parent', action='store_true', help=argparse.SUPPRESS)
parser.add_argument('--session', type=Path, help=argparse.SUPPRESS)
settings = parser.parse_args()
exe = settings.exe.resolve()
folder = settings.session or Path(tempfile.mkdtemp(prefix='lmpv-thumbfast-worker-'))
media = folder / 'fixture кириллица.mkv'
if not settings.parent:
    assert settings.ffmpeg and settings.ffmpeg.is_file(), '--ffmpeg must point to the packaged FFmpeg'
    inputs = []
    for color in ['red', 'blue', 'green']:
        inputs += ['-f', 'lavfi', '-i', f'color=c={color}:s=640x360:r=12:d=2']
    subprocess.run([str(settings.ffmpeg.resolve()), '-v', 'error', '-nostdin', *inputs, '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libx264', '-g', '72', '-sc_threshold', '0', '-y', str(media)], check=True, timeout=20, creationflags=134217728)
flags = 134217728

def launch(parent):
    socket = 'lmpv-thumbfast-worker-check-' + str(os.getpid())
    output = folder / ('thumb' + str(os.getpid()))
    args = [str(exe), '--lmpv-thumbnail-worker', '--lmpv-thumbnail-parent=' + str(parent), '--input-ipc-server=' + socket, '--o=' + str(output), '--vid=1', '--start=0', '--hr-seek=yes', '--hwdec=auto', '--vf=scale=320:180,format=bgra', '--', str(media)]
    return (subprocess.Popen(args, creationflags=flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL), output, socket)

def until(check, seconds=6):
    start = time.monotonic()
    while time.monotonic() - start < seconds:
        if check():
            return
        time.sleep(0.005)
    raise AssertionError('Timed out')
if settings.parent:
    p, output, socket = launch(os.getpid())
    until(lambda: output.exists() and output.stat().st_size == 320 * 180 * 4)
    print(p.pid, flush=True)
    sys.exit(0)
p, output, socket = launch(os.getpid())
try:
    until(lambda: output.exists() and output.stat().st_size == 320 * 180 * 4)
    assert output.read_bytes()[:3][2] > 180
    for pos, color in [(3.1, 0), (4.2, 1), (0.1, 2)]:
        before = output.stat().st_mtime_ns
        with open(chr(92) * 2 + '.' + chr(92) + 'pipe' + chr(92) + socket, 'r+b', buffering=0) as pipe:
            pipe.write((json.dumps({'command': ['seek', pos, 'absolute+exact']}) + '\n').encode())
        until(lambda: output.exists() and output.stat().st_mtime_ns != before)
        pixel = output.read_bytes()[(90 * 320 + 160) * 4:][:4]
        assert pixel[color] > 100 and pixel[3] == 255, (pos, pixel)
    with open(chr(92) * 2 + '.' + chr(92) + 'pipe' + chr(92) + socket, 'r+b', buffering=0) as pipe:
        pipe.write(b'{"command":["quit"]}\n')
    assert p.wait(timeout=5) == 0
    print('PASS worker exact-seek BGRA and graceful quit')
finally:
    if p.poll() is None:
        p.kill()
        p.wait(timeout=5)
parent = subprocess.run([sys.executable, __file__, '--parent', '--exe', str(exe), '--session', str(folder)], capture_output=True, text=True, creationflags=flags, timeout=10)
assert parent.returncode == 0, parent.stderr
pid = int(parent.stdout.strip())
k = c.WinDLL('kernel32', use_last_error=True)
k.OpenProcess.argtypes = [c.c_ulong, c.c_int, c.c_ulong]
k.OpenProcess.restype = c.c_void_p
k.WaitForSingleObject.argtypes = [c.c_void_p, c.c_ulong]
k.CloseHandle.argtypes = [c.c_void_p]
handle = k.OpenProcess(1048576, False, pid)
if handle:
    try:
        assert k.WaitForSingleObject(handle, 5000) == 0, 'worker survived parent exit'
    finally:
        k.CloseHandle(handle)
else:
    assert c.get_last_error() == 87, c.get_last_error()
print('PASS worker exits when its parent process disappears')
shutil.rmtree(folder)
