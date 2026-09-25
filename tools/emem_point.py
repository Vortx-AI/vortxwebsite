#!/usr/bin/env python3
"""Encode a file on the device that made it: print its emem pointer.v1 note.

The file never moves. This reads it in 4 MiB ranges, hashes each range with
BLAKE3, and prints the note a device publishes in place of the file: the source,
its size, one row per range, and one Merkle root over the rows (leaf =
blake3(url || u64be offset || u64be length || hash), pairs blake3(l || r), an odd
node promoted). An agent later reads only the range it needs, from the source,
and checks it against its row. The same rules run in the browser at
https://vortx.ai/#connect, so both produce the same root for the same file.

    pip install blake3 "ememdev[signing]"
    python3 emem_point.py pass-0042.tif --source https://your-bucket/pass-0042.tif > pass-0042.md
    ememdev write --path /memories/by_attester/<you>/pass-0042.md --body-file pass-0042.md

The note's 26-character name is base32(blake3(note)[0:16]); once published,
emem:tree:<name>#row=<i> addresses any range of the file.
"""

import argparse
import base64
import mimetypes
import os
import sys

from blake3 import blake3

CHUNK = 4 * 1024 * 1024


def b32(b: bytes) -> str:
    return base64.b32encode(b).decode().lower().rstrip("=")


def unb32(s: str) -> bytes:
    return base64.b32decode(s.upper() + "=" * ((8 - len(s) % 8) % 8))


def merkle_root(rows) -> str:
    level = [blake3(r["url"].encode() + r["offset"].to_bytes(8, "big") + r["length"].to_bytes(8, "big") + unb32(r["hash"])).digest() for r in rows]
    while len(level) > 1:
        level = [blake3(level[i] + level[i + 1]).digest() if i + 1 < len(level) else level[i] for i in range(0, len(level), 2)]
    return b32(level[0]) if level else ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("file")
    ap.add_argument("--source", help="where agents will read the file (URL); defaults to the device path")
    a = ap.parse_args()
    size = os.path.getsize(a.file)
    rows = []
    with open(a.file, "rb") as f:
        off = 0
        while off < size or not rows:
            b = f.read(CHUNK)
            rows.append({"label": f"bytes {off}…", "url": "", "offset": off, "length": len(b), "hash": b32(blake3(b).digest())})
            off += len(b)
            if not b:
                break
    root = merkle_root(rows)
    name = os.path.basename(a.file)
    mime = mimetypes.guess_type(name)[0] or "file"
    src = a.source or f"file:{name} (on the device that made it)"
    out = ["---", "emem: pointer.v1", f"source: {src}", f"bytes: {size}", "etag: not exposed", f"kind: {mime}",
           f"chunks: {len(rows)} of {len(rows)} hashed", f"root: {root}", "hash: blake3-256 of each chunk's bytes",
           "order: file order, 4 MiB ranges", "---", "", f"# {name}", "",
           f"> {size:,} bytes at its source. The data stays there; this note is its address and its proofs. "
           "Read any range from the source, then check its BLAKE3 hash below. The root is a Merkle tree over "
           "(url, offset, length, hash) of every row, in order.", "",
           "| what | url | offset | length | blake3 |", "|---|---|---|---|---|"]
    out += [f"| {r['label']} | · | {r['offset']} | {r['length']} | {r['hash']} |" for r in rows]
    note = "\n".join(out) + "\n"
    sys.stdout.write(note)
    sys.stderr.write(f"root {root}\ntoken emem:tree:{b32(blake3(note.encode()).digest()[:16])}#row=0 (after publishing this exact note)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
