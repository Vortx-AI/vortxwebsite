#!/usr/bin/env python3
"""Register each site release as a signed record in emem's memory commons.

The site is already content-addressed by tools/site_manifest.py. This
script takes the current manifest and writes it into emem as a signed
memory file, so every release of vortx.ai is also an emem token: held
at a permanent path, world-readable, receipt attached, owned by the
key in EMEM_SEED_B32.

    python3 tools/register_release.py --keygen   # once: mint the keypair
    python3 tools/register_release.py            # each release: register it

Keygen prints a seed and a pubkey. Store the seed as the repo secret
EMEM_SEED_B32; the pubkey's first 8 base32 chars become the site's
namespace: /memories/by_attester/<pubkey8>/vortx.ai/releases/<cid>.json

The write protocol is emem's caller-signed memory write (v2): the
signature covers blake3("emem.memory_write.v2|" + verb + "|" + path +
"|" + blake3(body) + "|" + base), where base is the file_cid currently
at the path, or "absent". We learn the correct base by sending one
unattested write first; the refusal carries it. Spec:
GET https://emem.dev/v1/verifier_spec, under caller_signed_objects.
"""

import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

try:
    from blake3 import blake3
except ImportError:
    sys.exit("needs: pip install blake3")


def ed25519():
    # imported lazily: the no-secret skip path never needs it
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives import serialization
    except ImportError:
        sys.exit("needs: pip install cryptography")
    return Ed25519PrivateKey, serialization

ROOT = Path(__file__).resolve().parent.parent
MCP_URL = os.environ.get("EMEM_MCP_URL", "https://emem.dev/mcp")


def b32(raw: bytes) -> str:
    return base64.b32encode(raw).decode("ascii").lower().rstrip("=")


def unb32(s: str) -> bytes:
    return base64.b32decode(s.upper() + "=" * (-len(s) % 8))


def keygen():
    Ed25519PrivateKey, serialization = ed25519()
    sk = Ed25519PrivateKey.generate()
    seed = sk.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub = sk.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
    )
    print("EMEM_SEED_B32 (repo secret, keep private):", b32(seed))
    print("pubkey_b32 (public, safe to publish):     ", b32(pub))
    print("namespace: /memories/by_attester/" + b32(pub)[:8] + "/")


def mcp_call(tool: str, arguments: dict) -> dict:
    payload = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": tool, "arguments": arguments},
    }).encode()
    req = urllib.request.Request(
        MCP_URL, data=payload, method="POST",
        headers={
            "content-type": "application/json",
            "accept": "application/json, text/event-stream",
        },
    )
    body = urllib.request.urlopen(req, timeout=60).read().decode()
    # streamable HTTP may answer as SSE; take the last data: line
    if body.lstrip().startswith("event:") or "\ndata:" in body or body.startswith("data:"):
        datas = [l[5:].strip() for l in body.splitlines() if l.startswith("data:")]
        body = datas[-1] if datas else body
    return json.loads(body)


def tool_error_details(resp: dict) -> dict | None:
    """The refusal for an unattested write arrives as a tool error whose
    text carries a JSON details block; dig it out wherever it landed."""
    result = resp.get("result") or {}
    if not (result.get("isError") or resp.get("error")):
        return None
    texts = [c.get("text", "") for c in result.get("content", [])]
    if resp.get("error"):
        texts.append(json.dumps(resp["error"]))
    for t in texts:
        start = t.find("{")
        if start >= 0:
            try:
                return json.loads(t[start:])
            except json.JSONDecodeError:
                continue
    return None


def signed_write(sk, pubkey_b32: str, path: str, text: str):
    # 1. unattested probe: the refusal names the base this write must sign over
    probe = mcp_call("emem_memory_create", {"path": path, "file_text": text})
    details = tool_error_details(probe)
    if details is None:
        return probe  # accepted without attestation (not expected, but fine)
    built = (details.get("how_to_sign") or {}).get("how_it_was_built") or {}
    base = built.get("base", "absent")

    # 2. sign the v2 preimage and retry
    body_hash = blake3(text.encode()).digest()
    digest = blake3(
        b"emem.memory_write.v2|create|" + path.encode() + b"|" + body_hash
        + b"|" + str(base).encode()
    ).digest()
    sig_b32 = b32(sk.sign(digest))
    return mcp_call("emem_memory_create", {
        "path": path, "file_text": text, "kind": "semantic",
        "attester": {"pubkey_b32": pubkey_b32, "sig_b32": sig_b32},
    })


def register():
    seed_b32 = os.environ.get("EMEM_SEED_B32", "").strip()
    if not seed_b32:
        print("EMEM_SEED_B32 not set; skipping emem registration "
              "(the manifest is still verifiable offline)")
        return 0
    Ed25519PrivateKey, serialization = ed25519()
    sk = Ed25519PrivateKey.from_private_bytes(unb32(seed_b32))
    pub = sk.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
    )
    pubkey_b32 = b32(pub)

    manifest = json.loads((ROOT / ".well-known" / "site-manifest.json").read_text())
    record = {
        "schema": "vortx.site_release.v1",
        "site": "https://vortx.ai",
        "release_cid": manifest["cid"],
        "commit": manifest.get("commit"),
        "files": len(manifest["files"]),
        "manifest": "https://vortx.ai/.well-known/site-manifest.json",
        "verify": ("release_cid = base32(blake3(canonical {schema,files} JSON)); "
                   "re-check the tree with tools/site_manifest.py --verify"),
    }
    text = json.dumps(record, indent=2) + "\n"
    ns = f"/memories/by_attester/{pubkey_b32[:8]}/vortx.ai/releases"
    failures = 0
    for path in (f"{ns}/{manifest['cid']}.json", f"{ns}/latest.json"):
        resp = signed_write(sk, pubkey_b32, path, text)
        details = tool_error_details(resp)
        if details is None:
            print(f"registered {path}")
        else:
            failures += 1
            print(f"FAILED {path}: {json.dumps(details)[:400]}")
    return 1 if failures else 0


if __name__ == "__main__":
    if "--keygen" in sys.argv:
        sys.exit(keygen())
    sys.exit(register())
