"""Shared checks for Windows dependency packages (stdlib only)."""
import struct


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
