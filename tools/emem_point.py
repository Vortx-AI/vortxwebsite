#!/usr/bin/env python3
"""Encode a file on the device that made it: print its emem pointer.v1 note.

The file never moves. This reads it in 4 MiB ranges, hashes each range with
BLAKE3, and prints the note a device publishes in place of the file, laid out
as the ememdemo pointers are (https://vortx-ai.github.io/ememdemo/): the source,
its size and kind, one row per range, and one Merkle root over the rows
(leaf = blake3(url || u64be offset || u64be length || hash), pairs blake3(l || r),
an odd node promoted). An agent later reads only the range it needs, from the
source, and checks it against its row. https://vortx.ai/#connect runs the same
rules in the browser and writes the same note, byte for byte.

    pip install blake3 "ememdev[signing]"
    python3 emem_point.py TCI.tif --source https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/43/P/GQ/2026/5/S2B_43PGQ_20260512_0_L2A/TCI.tif > TCI.tif.md
    ememdev write --path /memories/by_attester/<you>/TCI.tif.md --body-file TCI.tif.md

--stamp adds `after: sth <tree_size> <root> <signed_at>` from emem's log head,
after checking its ed25519 signature against emem's key: proof the note was
written after that moment, since nobody can know a future root.

The note's 26-character name is base32(blake3(note)[0:16]); once published,
emem:tree:<name>#row=<i> addresses any range of the file.
"""

import argparse
import base64
import json
import os
import struct
import sys
import urllib.parse
import urllib.request

from blake3 import blake3

CHUNK = 4 * 1024 * 1024
EMEM_KEY = "777er3yihgifqmv5hmc2wwmyszgddzderzhsx6rex4yoakwomvka"  # emem.dev's responder key, pinned


def b32(b: bytes) -> str:
    return base64.b32encode(b).decode().lower().rstrip("=")


def unb32(s: str) -> bytes:
    return base64.b32decode(s.upper() + "=" * ((8 - len(s) % 8) % 8))


def merkle_root(rows) -> str:
    level = [blake3(r["url"].encode() + r["offset"].to_bytes(8, "big") + r["length"].to_bytes(8, "big") + unb32(r["hash"])).digest() for r in rows]
    while len(level) > 1:
        level = [blake3(level[i] + level[i + 1]).digest() if i + 1 < len(level) else level[i] for i in range(0, len(level), 2)]
    return b32(level[0]) if level else ""


def size_text(n: int) -> str:
    # decimal units, as the demo prints them; integer half-up rounding, so the browser prints the same
    if n >= 10 ** 9:
        h = (n + 5 * 10 ** 6) // 10 ** 7
        return f"{h // 100}.{h % 100:02d} GB"
    t = (n + 50000) // 100000 if n >= 10 ** 6 else (n + 50) // 100
    return f"{t // 10}.{t % 10} {'MB' if n >= 10 ** 6 else 'KB'}"


def tiff_tags(f, le: bool):
    e = "<" if le else ">"
    f.seek(4)
    ifd = struct.unpack(e + "I", f.read(4))[0]
    f.seek(ifd)
    raw = f.read(2)
    if len(raw) < 2:
        return set()
    n = struct.unpack(e + "H", raw)[0]
    ents = f.read(12 * n)
    return {struct.unpack(e + "H", ents[12 * i:12 * i + 2])[0] for i in range(len(ents) // 12)}


def kind_of(path: str) -> str:
    """The file's kind, from its first bytes, in the demo's words."""
    with open(path, "rb") as f:
        h = f.read(16)
        if h[:4] in (b"II*\x00", b"MM\x00*"):
            tags = tiff_tags(f, h[:2] == b"II")
            geo = bool(tags & {33550, 33922, 34264, 34735})
            return ("tiled GeoTIFF" if 322 in tags else "GeoTIFF") if geo else "TIFF"
        if h[:4] in (b"II+\x00", b"MM\x00+"):
            return "BigTIFF"
    if h[4:8] == b"ftyp":
        return "video (MP4)"
    if h[:4] == b"\x1aE\xdf\xa3":
        return "video (Matroska)"
    if h[:8] == b"\x89MCAP0\r\n":
        return "MCAP robot log"
    if h[:3] == b"\xff\xd8\xff":
        return "photograph (JPEG)"
    if h[:4] == b"\x89PNG":
        return "image (PNG)"
    if h[:4] == b"PAR1":
        return "Parquet"
    if h[:8] == b"\x89HDF\r\n\x1a\n":
        return "HDF5"
    if h[:4] in (b"CDF\x01", b"CDF\x02"):
        return "NetCDF-3"
    if h[:4] == b"GGUF":
        return "GGUF"
    return "file"


def preimage(domain: str, segments) -> bytes:
    d = domain.encode()
    out = b"emem.preimage.v1\0" + struct.pack("<I", len(d)) + d
    for tag, val in segments:
        out += bytes([tag]) + struct.pack("<I", len(val)) + val
    return blake3(out).digest()


# Ed25519 verification, RFC 8032 section 6 (reference code): one signature, no dependency
_P = 2 ** 255 - 19
_Q = 2 ** 252 + 27742317777372353535851937790883648493
_D = -121665 * pow(121666, _P - 2, _P) % _P
_I = pow(2, (_P - 1) // 4, _P)


def _add(a, b):
    A, B = (a[1] - a[0]) * (b[1] - b[0]) % _P, (a[1] + a[0]) * (b[1] + b[0]) % _P
    C, D = 2 * a[3] * b[3] * _D % _P, 2 * a[2] * b[2] % _P
    E, F, G, H = B - A, D - C, D + C, B + A
    return (E * F, G * H, F * G, E * H)


def _mul(s, pt):
    q = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            q = _add(q, pt)
        pt, s = _add(pt, pt), s >> 1
    return q


def _x(y, sign):
    if y >= _P:
        return None
    x2 = (y * y - 1) * pow(_D * y * y + 1, _P - 2, _P)
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P:
        x = x * _I % _P
    if (x * x - x2) % _P:
        return None
    return _P - x if (x & 1) != sign else x


def _point(b):
    y = int.from_bytes(b, "little")
    x = _x(y & ((1 << 255) - 1), y >> 255)
    return None if x is None else (x, y & ((1 << 255) - 1), 1, x * (y & ((1 << 255) - 1)) % _P)


def ed25519_verify(pub: bytes, msg: bytes, sig: bytes) -> bool:
    import hashlib
    A, R = _point(pub), _point(sig[:32])
    s = int.from_bytes(sig[32:], "little")
    if A is None or R is None or s >= _Q or len(sig) != 64:
        return False
    gy = 4 * pow(5, _P - 2, _P) % _P
    gx = _x(gy, 0)
    h = int.from_bytes(hashlib.sha512(sig[:32] + pub + msg).digest(), "little") % _Q
    l, r = _mul(s, (gx, gy, 1, gx * gy % _P)), _add(R, _mul(h, A))
    return (l[0] * r[2] - r[0] * l[2]) % _P == 0 and (l[1] * r[2] - r[1] * l[2]) % _P == 0


def stamp() -> str:
    """emem's log head, its signature checked against the pinned key before it is used."""
    s = json.load(urllib.request.urlopen("https://emem.dev/v1/log/sth", timeout=20))["sth"]
    if s["responder_pubkey_b32"] != EMEM_KEY:
        sys.exit("the log head is signed by an unknown key; not stamping")
    d = preimage("emem.translog.sth.v1", [(1, int(s["tree_size"]).to_bytes(8, "big")), (2, unb32(s["root_b32"])),
                                          (3, s["signed_at"].encode()), (4, unb32(s["responder_pubkey_b32"]))])
    if not ed25519_verify(unb32(s["responder_pubkey_b32"]), d, unb32(s["signature_b32"])):
        sys.exit("the log head's signature does not verify; not stamping")
    return f"after: sth {s['tree_size']} {s['root_b32']} {s['signed_at']}"


def note_for(path: str, source: str = "", after: str = "") -> tuple:
    size = os.path.getsize(path)
    rows = []
    with open(path, "rb") as f:
        off = 0
        while True:
            b = f.read(CHUNK)
            if not b and rows:
                break
            rows.append({"label": f"bytes {off}…{off + len(b) - 1}" if b else "empty file", "url": "", "offset": off, "length": len(b), "hash": b32(blake3(b).digest())})
            off += len(b)
            if not b:
                break
    root = merkle_root(rows)
    name = os.path.basename(path)
    kind = kind_of(path)
    src = source or f"file:{name} (on the device that made it)"
    where = f"at {urllib.parse.urlparse(source).hostname}" if source else "on the device that made it"
    out = ["---"] + ([after] if after else []) + [
        "emem: pointer.v1", f"source: {src}", f"bytes: {size}", "etag: not exposed", f"kind: {kind}",
        f"chunks: {len(rows)} of {len(rows)} hashed", f"root: {root}", "hash: blake3-256 of each chunk's bytes",
        "order: file order, 4 MiB ranges", "---", "", f"# {name}", "",
        f"> {kind} {where}, {size_text(size)}. The data stays there; this note is its address and its proofs. "
        "Read any chunk from the source by URL and byte range, then check its BLAKE3 hash below. "
        "The root is a Merkle tree over (url, offset, length, hash) of every row, in order.", "",
        f"- {len(rows)} chunks of 4 MiB, every one hashed on the device that made the file",
        "- nothing uploaded: this note is all that leaves the device", "",
        "## Chunks", "",
        "| what | url (· is the source) | offset | length | blake3 |", "|---|---|---|---|---|"]
    out += [f"| {r['label']} | · | {r['offset']} | {r['length']} | {r['hash']} |" for r in rows]
    return "\n".join(out) + "\n", root


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("file")
    ap.add_argument("--source", help="where agents will read the file (URL); defaults to the device path")
    ap.add_argument("--stamp", action="store_true", help="add emem's log head, signature checked, as after: sth …")
    a = ap.parse_args()
    note, root = note_for(a.file, a.source or "", stamp() if a.stamp else "")
    sys.stdout.write(note)
    sys.stderr.write(f"root {root}\ntoken emem:tree:{b32(blake3(note.encode()).digest()[:16])}#row=0 (after publishing this exact note)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
