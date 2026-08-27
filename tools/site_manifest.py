#!/usr/bin/env python3
"""Content-address the whole site, the way emem addresses a fact.

Every tracked file that GitHub Pages serves (code, text, layout, assets)
is hashed with blake3 and written into one canonical manifest. The
manifest core is itself hashed, and that blake3, base32-encoded exactly
like an emem fact CID, is the release id of the site.

Anyone can re-check a release with no key and no server:

    python3 tools/site_manifest.py --verify

re-hashes the working tree and compares it against the committed
manifest. A single changed byte in any file changes its file hash, the
canonical core, and the release CID.

The manifest lives at .well-known/site-manifest.json. It excludes
itself (a file cannot contain its own hash), the repo plumbing that
Pages does not serve (.git, .github, tools/), and nothing else.

CI runs this on every push to main, so the committed manifest always
describes the site actually being served.
"""

import argparse
import base64
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from blake3 import blake3
except ImportError:
    sys.exit("blake3 is required: pip install blake3")

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / ".well-known" / "site-manifest.json"
SCHEMA = "vortx.site_manifest.v1"

# Repo plumbing that GitHub Pages does not serve, plus the manifest itself.
EXCLUDE_PREFIXES = (".git", ".github/", "tools/")
EXCLUDE_FILES = {".well-known/site-manifest.json", ".gitignore"}


def b32(digest: bytes) -> str:
    return base64.b32encode(digest).decode("ascii").lower().rstrip("=")


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    for line in sorted(out.splitlines()):
        if line in EXCLUDE_FILES or line.startswith(EXCLUDE_PREFIXES):
            continue
        yield line


def hash_file(path: Path) -> tuple[str, int]:
    h = blake3()
    data = path.read_bytes()
    h.update(data)
    return b32(h.digest()), len(data)


def build_core() -> dict:
    files = {}
    for rel in tracked_files():
        cid, size = hash_file(ROOT / rel)
        files[rel] = {"blake3": cid, "bytes": size}
    return {"schema": SCHEMA, "files": files}


def canonical(core: dict) -> bytes:
    return json.dumps(core, sort_keys=True, separators=(",", ":")).encode("utf-8")


def build_manifest() -> dict:
    core = build_core()
    cid = b32(blake3(canonical(core)).digest())
    commit = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True
    ).stdout.strip() or None
    return {
        "schema": SCHEMA,
        "cid": cid,
        "commit": commit,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": core["files"],
        "_verify": (
            "cid = base32(blake3(canonical JSON of {schema, files})) with sorted "
            "keys, separators (',',':'), utf-8, base32 lowercase unpadded: the "
            "same shape as an emem fact CID. Each files entry is the blake3 of "
            "that file's exact bytes. Re-check everything offline with: "
            "python3 tools/site_manifest.py --verify"
        ),
    }


def write():
    manifest = build_manifest()
    MANIFEST_PATH.parent.mkdir(exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, sort_keys=False) + "\n")
    print(f"release {manifest['cid']}")
    print(f"{len(manifest['files'])} files -> {MANIFEST_PATH.relative_to(ROOT)}")


def verify() -> int:
    if not MANIFEST_PATH.exists():
        print("no manifest committed yet; run without --verify to create one")
        return 1
    stated = json.loads(MANIFEST_PATH.read_text())
    core = build_core()
    cid = b32(blake3(canonical(core)).digest())
    ok = True
    for rel, meta in stated.get("files", {}).items():
        actual = core["files"].get(rel)
        if actual is None:
            print(f"MISSING  {rel}")
            ok = False
        elif actual["blake3"] != meta["blake3"]:
            print(f"CHANGED  {rel}")
            ok = False
    for rel in core["files"]:
        if rel not in stated.get("files", {}):
            print(f"UNTRACKED IN MANIFEST  {rel}")
            ok = False
    if cid != stated.get("cid"):
        print(f"cid mismatch: manifest says {stated.get('cid')}, tree is {cid}")
        ok = False
    print("verified: tree matches release " + cid if ok else "verification FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--verify", action="store_true", help="check tree against the committed manifest")
    args = ap.parse_args()
    sys.exit(verify() if args.verify else write() or 0)
