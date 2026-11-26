"""Generate the extension's own geometric icon; Python standard library only."""
from pathlib import Path
import math
import struct
import zlib

DESTINATION = Path(__file__).resolve().parents[1] / "public" / "icons"


def pixel(x, y):
    # A rounded square, sidebar rail, and arch in Tailwind zinc-50/zinc-900.
    corner_x = min(max(x, 30), 98)
    corner_y = min(max(y, 30), 98)
    if (x - corner_x) ** 2 + (y - corner_y) ** 2 > 30 ** 2:
        return (0, 0, 0, 0)
    rail = 29 <= x <= 37 and 31 <= y <= 97
    distance = math.hypot(x - 79, y - 57)
    arch = (16 <= distance <= 24 and y <= 57) or ((55 <= x <= 63 or 95 <= x <= 103) and 57 <= y <= 97)
    return (250, 250, 250, 255) if rail or arch else (24, 24, 27, 255)


def chunk(kind, value):
    return struct.pack(">I", len(value)) + kind + value + struct.pack(">I", zlib.crc32(kind + value))


def generate(size):
    rows = bytearray()
    for py in range(size):
        rows.append(0)
        for px in range(size):
            samples = [pixel((px + (sx + .5) / 4) * 128 / size, (py + (sy + .5) / 4) * 128 / size) for sy in range(4) for sx in range(4)]
            opaque = [sample for sample in samples if sample[3]]
            rgb = tuple(round(sum(sample[channel] for sample in opaque) / len(opaque)) for channel in range(3)) if opaque else (0, 0, 0)
            rows.extend((*rgb, round(len(opaque) * 255 / 16)))
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    (DESTINATION / f"icon-{size}.png").write_bytes(data)


if __name__ == "__main__":
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for icon_size in (16, 32, 48, 128):
        generate(icon_size)
