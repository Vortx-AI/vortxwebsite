#!/usr/bin/env python3
"""Render data/timeline.json into press/index.html, so the newsroom reads without JavaScript.

The timeline, the listing wall, the video wall and the press-kit counts live between marker comments:
    <!-- listed:start --> ... <!-- listed:end -->
    <!-- watch:start --> ... <!-- watch:end -->
    <!-- timeline:start --> ... <!-- timeline:end -->
Everything else in the page is hand-written. js/press.js then re-checks each dated entry
against the record that owns its date (a registry, a changelog, a commit, a DOI), live.

The page is a ladder: each entry and each chapter of videos is one line (its verb, its noun, its
date, a small picture of what is inside); opening it shows the media, the proof and the check.
The small pictures are cut here from the full ones, into assets/press/mini/, so a closed page
loads a few kilobytes of pictures and the full ones only when a line is opened.

    python3 tools/gen_press.py          # cut the small pictures and rewrite press/index.html in place
    python3 tools/gen_press.py --check  # exit 1 if the page is not what the data renders, or a small picture is missing
    python3 tools/gen_press.py --verify # re-read every dated entry from its record; exit 1 on a date that disagrees
"""

import html
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "timeline.json"
PAGE = ROOT / "press" / "index.html"
MINI = ROOT / "assets" / "press" / "mini"
MW, MH = 176, 110  # every small picture: 16:10, twice the size it is shown at
KIND = {"emem": "emem", "eudr": "eudr.dev", "listing": "listing", "research": "research", "vortx": "vortx.ai", "video": "video"}
MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def esc(s):
    return html.escape(str(s), quote=True)


def day(d):
    y, m, dd = map(int, d.split("-"))
    return date(y, m, dd)


def link(p):
    ext = p["u"].startswith("http") and not p["u"].startswith("https://vortx.ai/")
    return f'<a class="lk" href="{esc(p["u"])}"' + (' target="_blank" rel="noopener"' if ext else "") + f'>{esc(p["t"])}{" ↗" if ext else ""}</a>'


def dims(src, fallback):
    """A picture's real width and height, read from its WebP or PNG header, so the page reserves the right box."""
    try:
        b = (ROOT / src.lstrip("/")).read_bytes()[:64]
    except OSError:
        return fallback
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        c = b[12:16]
        if c == b"VP8 ":
            return int.from_bytes(b[26:28], "little") & 0x3FFF, int.from_bytes(b[28:30], "little") & 0x3FFF
        if c == b"VP8L":
            v = int.from_bytes(b[21:25], "little")
            return (v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1
        if c == b"VP8X":
            return int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return int.from_bytes(b[16:20], "big"), int.from_bytes(b[20:24], "big")
    return fallback


def mini(src):
    """The small picture cut from a full one in assets/press/, or None for anything else."""
    return "/assets/press/mini/" + Path(src).stem + ".webp" if src and src.startswith("/assets/press/") else None


def make_minis():
    """Cut a 16:10 small picture from every full one, a little above the middle (a title, a face)."""
    from PIL import Image
    MINI.mkdir(parents=True, exist_ok=True)
    n = 0
    for src in sorted((ROOT / "assets" / "press").glob("*.webp")):
        out = MINI / (src.stem + ".webp")
        if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
            continue
        im = Image.open(src).convert("RGB")
        w, h = im.size
        cw, ch = (w, w * MH / MW) if w / h < MW / MH else (h * MW / MH, h)
        y0 = min(max(0, h * .38 - ch / 2), h - ch)
        im.crop((round((w - cw) / 2), round(y0), round((w + cw) / 2), round(y0 + ch))).resize((MW, MH), Image.LANCZOS).save(out, "WEBP", quality=72, method=6)
        n += 1
    return n


def check_minis(page):
    """Every small picture the page names exists, at its size."""
    bad = [m for m in sorted(set(re.findall(r'/assets/press/mini/[\w.-]+\.webp', page))) if dims(m, None) != (MW, MH)]
    if bad:
        sys.exit("missing or wrong-sized small pictures (run python3 tools/gen_press.py): " + ", ".join(bad))


def peek(src):
    m = mini(src)
    return (f'<img src="{m}" alt="" width="{MW // 2}" height="{MH // 2}" loading="lazy" decoding="async">' if m else "")


def mmss(sec):
    sec = int(sec or 0)
    return f"{sec // 60}:{sec % 60:02d}" if sec else ""


def player(v, big=False):
    """A thumbnail that becomes the platform's player on click; no third-party frame until then."""
    kind = "audio" if v.get("src") else "embed"
    url = v.get("src") or v["embed"]
    w, h = dims(v["thumb"], (960, 540))
    return (f'<button class="vd{" vd-lg" if big else ""}{" vd-au" if kind == "audio" else ""}" type="button" data-{kind}="{esc(url)}" aria-label="Play: {esc(v["title"])}, on {esc(v["platform"])}">'
            f'<img src="{esc(v["thumb"])}" alt="" loading="lazy" decoding="async" width="{w}" height="{h}">'
            f'<span class="vd-p" aria-hidden="true"></span>'
            + (f'<span class="vd-t">{mmss(v.get("duration"))}</span>' if v.get("duration") else "")
            + "</button>")


def watch(videos, chapters):
    """The video wall, a whole section, one line per chapter that opens onto its videos; nothing at all until there is a video to show."""
    if not videos:
        return ""
    rows = []
    for ch in chapters:
        vs = sorted((v for v in videos if v.get("chapter") == ch["verb"]), key=lambda x: x["date"])
        if not vs:
            continue
        cards = []
        for v in vs:
            d = day(v["date"])
            chk = f" data-check='{esc(json.dumps(v['check'], separators=(',', ':')))}'" if v.get("check") else ""
            what = f'<em>{esc(v["what"])}</em>' if v.get("what") else ""
            cards.append(f'<li><figure class="wv"{chk}>{player(v, len(vs) == 1)}<figcaption><strong>{esc(v["title"])}</strong>{what}'
                         f'<span>{esc(v["by"])} · <time datetime="{esc(v["date"])}">{d.day} {MON[d.month - 1][:3]} {d.year}</time> · <a class="lk" href="{esc(v["url"])}" target="_blank" rel="noopener">{esc(v["platform"])} ↗</a></span></figcaption></figure></li>')
        span = f'{day(vs[0]["date"]).year}' if day(vs[0]["date"]).year == day(vs[-1]["date"]).year else f'{day(vs[0]["date"]).year}–{day(vs[-1]["date"]).year}'
        rows.append(f'<details class="wv-ch nr-x{" is-one" if len(vs) == 1 else ""}"><summary><h3><b class="v">{esc(ch["verb"])}</b> {esc(ch["noun"])}</h3>'
                    f'<span class="nr-n2">{len(vs)} video{"s" if len(vs) > 1 else ""} · {span}</span>'
                    f'<span class="nr-peek" aria-hidden="true">' + "".join(peek(v["thumb"]) for v in vs[:4]) + '</span></summary>\n'
                    f'<ul class="wv-grid">\n' + "\n".join(cards) + "\n</ul></details>")
    return ('    <section class="section nr-sec" id="watch" aria-labelledby="watch-h">\n      <div class="wrap">\n'
            f'        <h2 class="nr-h" id="watch-h"><b class="v">watch</b> Vortx AI and emem, on camera</h2>\n'
            + "\n".join(rows) +
            '\n        <p class="nr-part"><b class="v">see</b> every video: <a class="lk" href="https://www.youtube.com/@vortxai" target="_blank" rel="noopener">@vortxai ↗</a> <a class="lk" href="https://www.youtube.com/@emem_dev" target="_blank" rel="noopener">@emem_dev ↗</a></p>\n'
            "      </div>\n    </section>")


def entry(e):
    """One line: the date, what kind, the verb and its noun, a small picture; opened, the media, the proof, the check."""
    d = day(e["date"])
    checks = e.get("check")
    attrs = f' data-kind="{esc(e["kind"])}" data-date="{esc(e["date"])}"'
    if checks:
        attrs += f" data-check='{esc(json.dumps(checks if isinstance(checks, list) else [checks], separators=(',', ':')))}'"
    media = e.get("video") or e.get("audio")
    if media:
        look = f'<span class="nr-peek is-play" aria-hidden="true">{peek(media["thumb"])}</span>'
    elif e.get("img"):
        look = f'<span class="nr-peek" aria-hidden="true">{peek(e["img"])}</span>'
    elif e.get("card"):
        look = '<span class="nr-peek is-card" aria-hidden="true"><i></i><i></i><i></i></span>'
    else:
        look = ""
    out = [f'<li class="tl"{attrs}><details class="tl-x nr-x"><summary>',
           f'<span class="tl-d"><time datetime="{esc(e["date"])}"><b>{d.day}</b><span>{MON[d.month - 1][:3]}</span></time><i>{esc(KIND.get(e["kind"], e["kind"]))}</i></span>',
           f'<h3><b class="v">{esc(e["verb"])}</b> {esc(e["noun"])}</h3>', look, '</summary>',
           '<div class="tl-open"><div class="tl-bd">']
    if e.get("what"):
        out.append(f'<p class="tl-w">{esc(e["what"])}</p>')
    out.append('<p class="tl-p">' + " · ".join(link(p) for p in e.get("proof", [])) + "</p>")
    if checks:
        out.append('<p class="tl-ck">checking against its source…</p>')
    out.append("</div>")
    if media:
        out.append('<figure class="tl-im">' + player(media) + "</figure>")
    elif e.get("img"):
        out.append(f'<figure class="tl-im"><a href="{esc(e["img"])}" target="_blank" rel="noopener"><img src="{esc(e["img"])}" alt="{esc(e.get("alt", ""))}" loading="lazy" decoding="async" width="{dims(e["img"], (1280, 800))[0]}" height="{dims(e["img"], (1280, 800))[1]}"></a></figure>')
    elif e.get("card"):
        out.append('<div class="tl-card" aria-hidden="true">' + "".join(f"<code>{esc(c)}</code>" for c in e["card"]) + "</div>")
    out.append("</div></details></li>")
    return "".join(out)


def timeline(entries):
    rows, month = [], None
    for e in sorted(entries, key=lambda x: x["date"], reverse=True):
        d = day(e["date"])
        m = (d.year, d.month)
        if m != month:
            rows.append(f'<li class="tl-m" data-month="{d.year}-{d.month:02d}"><h2>{MON[d.month - 1]} <span>{d.year}</span></h2></li>')
            month = m
        rows.append(entry(e))
    return '<ol class="tl-list">\n' + "\n".join(rows) + "\n</ol>"


def listed(items):
    rows = []
    for x in items:
        d = f'<time datetime="{esc(x["date"])}">{day(x["date"]).day} {MON[day(x["date"]).month - 1][:3]} {day(x["date"]).year}</time>' if x.get("date") else "<time>listed</time>"
        rows.append(f'<li><a href="{esc(x["u"])}" target="_blank" rel="noopener"><b class="v">{esc(x["verb"])}</b><strong>{esc(x["where"])}</strong><span>{esc(x["what"])}</span>{d}</a></li>')
    return '<ul class="ls-grid">\n' + "\n".join(rows) + "\n</ul>"


def render(page, data):
    vids = {v["id"]: v for v in data.get("videos", [])}
    entries = [dict(e, video=vids[e["video"]]) if isinstance(e.get("video"), str) else e for e in data["entries"]]
    for name, body in (("listed", listed(data["listed"])), ("watch", watch(data.get("videos", []), data.get("chapters", []))), ("timeline", timeline(entries))):
        page, n = re.subn(rf"(<!-- {name}:start -->).*?(<!-- {name}:end -->)", lambda m: m.group(1) + "\n" + (body + "\n" if body else "") + m.group(2), page, flags=re.S)
        if n != 1:
            sys.exit(f"press/index.html: expected one {name} marker pair, found {n}")
    counts = {"entries": len(data["entries"]), "listed": len(data["listed"]), "checked": sum(1 for e in data["entries"] if e.get("check")), "videos": len(data.get("videos", []))}
    for k, v in counts.items():
        page = re.sub(rf'(data-n="{k}">)[^<]*(<)', rf"\g<1>{v}\2", page)
    return page


# the same readers js/press.js uses, for CI: each date re-read from the record that owns it
def fetch(url, text=False):
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "vortx-timeline-check", "Accept": "text/plain" if text else "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode("utf-8")
    return body if text else json.loads(body)


def read_date(c, memo):
    def get(u, text=False):
        if u not in memo:
            memo[u] = fetch(u, text)
        return memo[u]
    src = c["src"]
    if src == "changelog":
        m = re.search(r"^## \[" + re.escape(c["version"]) + r"\] [-\u2014] (\d{4}-\d{2}-\d{2})", get("https://raw.githubusercontent.com/Vortx-AI/emem/main/CHANGELOG.md", True), re.M)
        return m and m.group(1)
    if src == "mcpreg":
        from urllib.parse import quote
        j = get("https://registry.modelcontextprotocol.io/v0/servers?search=" + quote(c["name"]) + "&limit=100")
        for x in j.get("servers", []):
            v = x.get("server", x)
            if v.get("name") == c["name"] and v.get("version") == c["version"]:
                return ((x.get("_meta") or {}).get("io.modelcontextprotocol.registry/official") or {}).get("publishedAt", "")[:10] or None
        return None
    if src == "ghmcp":
        j = get("https://api.mcp.github.com/v0/servers/" + c["id"]); return (j.get("server", j).get("created_at") or "")[:10] or None
    if src == "pypi":
        j = get("https://pypi.org/pypi/" + c["pkg"] + "/json"); t = sorted(f[0]["upload_time"] for f in j.get("releases", {}).values() if f); return t[0][:10] if t else None
    if src == "npm":
        return (get("https://registry.npmjs.org/" + c["pkg"].replace("/", "%2f")).get("time", {}).get("created") or "")[:10] or None
    if src == "zenodo":
        return get("https://zenodo.org/api/records/" + c["id"]).get("metadata", {}).get("publication_date")
    if src in ("hf", "hfspace"):
        j = get("https://huggingface.co/api/" + ("models/" + c["model"] if src == "hf" else "spaces/" + c["id"])); return (j.get("createdAt") or "")[:10] or None
    if src == "dify":
        return (get("https://marketplace.dify.ai/api/v1/plugins/" + c["plugin"]).get("data", {}).get("plugin", {}).get("created_at") or "")[:10] or None
    if src == "commit":
        return (get("https://api.github.com/repos/" + c["repo"] + "/commits/" + c["sha"]).get("commit", {}).get("committer", {}).get("date") or "")[:10] or None
    if src == "mulesoft":
        for a in get("https://anypoint.mulesoft.com/exchange/api/v2/assets?search=emem&limit=20"):
            if a.get("assetId") == c["asset"]:
                return (a.get("createdDate") or "")[:10] or None
        return None
    if src == "vimeo":
        from urllib.parse import quote
        j = get("https://vimeo.com/api/oembed.json?url=" + quote("https://vimeo.com/" + c["id"], safe=""))
        return (j.get("upload_date") or "")[:10] or None
    if src == "youtube":
        # the date YouTube shows a viewer whose clock is UTC; a page that does not answer is not a failed check
        import urllib.request
        body = json.dumps({"context": {"client": {"clientName": "WEB", "clientVersion": "2.20260924.01.00", "timeZone": "UTC", "utcOffsetMinutes": 0}}, "videoId": c["id"]}).encode()
        req = urllib.request.Request("https://www.youtube.com/youtubei/v1/next", data=body, headers={"content-type": "application/json", "User-Agent": "vortx-timeline-check"})
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.loads(r.read().decode("utf-8"))
        found = []

        def walk(o):
            if isinstance(o, dict):
                v = o.get("videoPrimaryInfoRenderer")
                if v:
                    found.append((v.get("dateText") or {}).get("simpleText") or "")
                for x in o.values():
                    walk(x)
            elif isinstance(o, list):
                for x in o:
                    walk(x)
        walk(j)
        m = found and re.search(r"([A-Z][a-z]{2} \d{1,2}, \d{4})", found[0])
        if not m:
            raise ValueError("YouTube showed no date")
        from datetime import datetime
        return datetime.strptime(m.group(1), "%b %d, %Y").date().isoformat()
    if src == "itunes":
        for r in get("https://itunes.apple.com/lookup?id=" + c["id"] + "&entity=podcastEpisode").get("results", []):
            if r.get("trackName") == c["episode"]:
                return (r.get("releaseDate") or "")[:10] or None
        return None
    if src == "tool":
        t = get("https://emem.dev/v1/tools"); t = t.get("tools", t) if isinstance(t, dict) else t
        return "live" if any(x.get("name") == c["name"] for x in t) else None
    raise ValueError("no reader for " + src)


def verify(data):
    memo, bad, off, ok = {}, [], [], 0
    for e in data["entries"]:
        checks = e.get("check")
        for c in (checks if isinstance(checks, list) else [checks] if checks else []):
            try:
                got = read_date(c, memo)
            except Exception as err:  # a record that did not answer is not a failed check
                off.append(f"{e['date']} {e['noun']}: {c['src']} did not answer ({err})"); continue
            want = "live" if c["src"] == "tool" else e["date"]
            if got == want: ok += 1
            else: bad.append(f"{e['date']} {e['noun']}: {c['src']} says {got}")
    for x in off: print("not checked:", x)
    for x in bad: print("DRIFT:", x)
    print(f"{ok} dates agree with their records, {len(bad)} do not, {len(off)} not checked")
    return not bad


def main():
    data = json.loads(DATA.read_text())
    if "--verify" in sys.argv:
        sys.exit(0 if verify(data) else 1)
    page = PAGE.read_text()
    new = render(page, data)
    if "--check" in sys.argv:
        if new != page:
            sys.exit("press/index.html is stale: run python3 tools/gen_press.py")
        check_minis(new)
        print("press/index.html matches data/timeline.json, and every small picture it names is cut")
        return
    cut = make_minis()
    PAGE.write_text(new)
    check_minis(new)
    print(f"press/index.html: {len(data['entries'])} entries, {len(data['listed'])} listings; {cut} small pictures cut")


if __name__ == "__main__":
    main()
