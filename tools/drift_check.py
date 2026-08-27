#!/usr/bin/env python3
"""Catch this site's facts drifting from the world they describe.

.well-known/facts.json is the registry of every number the site asserts
about emem, each with the live source that can refute it. This script
runs two kinds of check:

  copy checks (always): every registered claim pattern still appears in
  the file that makes it, with the registered value. A copy edit that
  breaks a claim turns CI red.

  live checks (default; skip with --offline): each derivable fact is
  re-derived from its live source. emem shipping its 112th tool turns
  the weekly run red, which is the alarm working, not a bug. Structural
  and floor facts are exempt: they change by decision, not by traffic.

Exit 0 means the site and the world agree.
"""

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / ".well-known" / "facts.json"


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"accept": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())


def live_value(fact_id: str, spec: dict):
    src, derive = spec["source"], spec["derive"]
    doc = fetch_json(src)
    if derive == "version":
        return doc.get("version")
    if derive == "len(skills)":
        return len(doc.get("skills", []))
    if derive == "counts.live_total":
        return (doc.get("counts") or {}).get("live_total")
    raise ValueError(f"{fact_id}: no deriver for {derive!r}")


def main() -> int:
    offline = "--offline" in sys.argv
    reg = json.loads(REGISTRY.read_text())
    drifts = []

    for check in reg.get("checks", []):
        spec = reg["facts"][check["fact"]]
        pattern = check["pattern"].replace("{value}", str(spec["value"]))
        text = (ROOT / check["file"]).read_text()
        if pattern not in text:
            drifts.append(f"copy: {check['file']} no longer states "
                          f"{check['fact']} as {pattern!r}")

    if not offline:
        for fact_id, spec in reg["facts"].items():
            if spec.get("kind") in ("structural", "floor"):
                continue
            try:
                live = live_value(fact_id, spec)
            except Exception as e:
                drifts.append(f"live: {fact_id} source unreachable ({e})")
                continue
            if live != spec["value"]:
                drifts.append(f"live: {fact_id} is {live!r} at {spec['source']}, "
                              f"registry says {spec['value']!r}")

    if drifts:
        print("DRIFT DETECTED")
        for d in drifts:
            print(" -", d)
        print("\nfix: update .well-known/facts.json and the copy it checks, "
              "then commit both together")
        return 1
    print(f"no drift: {len(reg.get('checks', []))} copy checks"
          + ("" if offline else " and live sources") + " agree with the registry")
    return 0


if __name__ == "__main__":
    sys.exit(main())
