#!/usr/bin/env python3
"""Refresh the dated snapshots the globe falls back on, from CelesTrak.

The page always asks CelesTrak first. These files stand in only when it is
unreachable or throttling, and each says when it was fetched, so a reader can
tell a live orbit from a remembered one:

  data/tle.txt             two-line elements: Sentinel-2A/2B/2C, HST, ISS
  data/tle-sentinel-2.txt  the three imagers alone (agent B's capture check)
  data/satcat.json         each object's SATCAT record: launch date and site,
                           plus CelesTrak's names for the launch-site codes

Nothing here is typed by hand; run this and commit the result.
"""

import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GP = "https://celestrak.org/NORAD/elements/gp.php?{q}&FORMAT=TLE"
SATCAT = "https://celestrak.org/satcat/records.php?CATNR={n}&FORMAT=JSON"
SITES = "https://celestrak.org/satcat/launchsites.php"
GROUPS = [("NAME=SENTINEL-2", [40697, 42063, 60989]), ("CATNR=20580", [20580]), ("CATNR=25544", [25544])]


def get(url: str) -> str:
    # CelesTrak throttles bursts; back off 2, 4, 8, 16 s before giving up
    req = urllib.request.Request(url, headers={"user-agent": "vortx.ai snapshot refresh (+https://vortx.ai)"})
    for wait in (2, 4, 8, 16, None):
        try:
            return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
        except OSError:
            if wait is None:
                raise
            time.sleep(wait)


def blocks(txt: str, norads: list) -> list:
    lines = [l.rstrip() for l in txt.splitlines() if l.strip()]
    out = []
    for i in range(len(lines) - 2):
        if lines[i + 1].startswith("1 ") and lines[i + 2].startswith("2 ") and int(lines[i + 1][2:7]) in norads:
            out.append((lines[i].strip(), lines[i + 1], lines[i + 2]))
    return out


def main() -> int:
    fetched = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    sets = []
    for q, norads in GROUPS:
        got = blocks(get(GP.format(q=q)), norads)
        if len(got) != len(norads):
            print(f"{q}: expected {len(norads)} objects, got {len(got)}", file=sys.stderr)
            return 1
        sets.append(got)
        time.sleep(2)
    fmt = lambda bs: "\n".join(f"{n}\n{a}\n{b}" for n, a, b in bs) + "\n"
    (ROOT / "data" / "tle.txt").write_text(fmt([b for s in sets for b in s]))
    (ROOT / "data" / "tle-sentinel-2.txt").write_text(fmt(sets[0]))

    records = []
    for _, norads in GROUPS:
        for n in norads:
            rec = json.loads(get(SATCAT.format(n=n)))[0]
            records.append({k: rec.get(k) for k in ("OBJECT_NAME", "OBJECT_ID", "NORAD_CAT_ID", "OBJECT_TYPE", "OWNER", "LAUNCH_DATE", "LAUNCH_SITE", "PERIOD", "INCLINATION", "APOGEE", "PERIGEE")})
            time.sleep(1)
    page = get(SITES)
    sites = {}
    for code, name in re.findall(r"<td>(?:<a[^>]*>)?([A-Z0-9]{3,5})(?:</a>)?</td>\s*<td>(.*?)</td>", page, flags=re.S):
        sites[code] = re.sub(r"\s+", " ", html.unescape(re.sub(r"<br\s*/?>", " ", name))).strip()
    used = {r["LAUNCH_SITE"] for r in records}
    doc = {
        "schema": "vortx.satcat_snapshot.v1",
        "source": "https://celestrak.org/satcat/ (SATCAT records and launch-site codes)",
        "fetched_at": fetched,
        "records": records,
        "sites": {c: sites.get(c, "") for c in sorted(used)},
    }
    (ROOT / "data" / "satcat.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    print(f"refreshed {sum(len(s) for s in sets)} element sets and {len(records)} SATCAT records at {fetched}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
