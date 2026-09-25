#!/usr/bin/env python3
"""Pictures and clips for the homepage's devices, each cut from bytes its sample names.

The gallery's thumbnails are 320 x 200: honest, and soft on a card, softer still in a popup.
This tool makes the few pictures the hero shows sharp, without letting them drift from the
samples they stand for:

  from the file   the source the sample's note points at is fetched, every hashed row of the
                  note that those bytes cover is checked (blake3), and only then is the picture
                  drawn from them: the lion's photo, the drone's orthomosaic, Mars, the robot's
                  camera (the video's own index and first frames, checked, and six seconds cut)
  publisher JPEG  when the note's file is a 144 to 215 MB TIFF, the archive that publishes it
                  (ESA/Webb, ESA/Hubble) serves its own JPEG of the same image; that JPEG is used,
                  and the manifest says so

Every output is named in data/pictures.json by base32(blake3(bytes)[0:16]), like an emem note,
with its source, its credit and its licence.

    python3 tools/wow_media.py           # fetch, check, render; write assets/wow/ and data/pictures.json
    python3 tools/wow_media.py --check   # every file on disk hashes to the name the manifest gives it
"""

import base64
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from blake3 import blake3

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "wow"
MANIFEST = ROOT / "data" / "pictures.json"
NOTE = "https://emem.dev/memories/by_attester/ddzmyzhn/{}.md"
CACHE = Path(os.environ.get("WOW_CACHE", tempfile.gettempdir())) / "wow_media_cache"

# focus: the crop's centre (x, y as fractions); zoom: the crop's size against the largest 16:10 box
ITEMS = [
    {"record": "wkxa7tcmw2orf7ujjf5yi66dhe", "title": "Cosmic Cliffs, Carina", "device": "telescope", "by": "Webb",
     "jpeg": "https://esawebb.org/media/archives/images/large/weic2205a.jpg", "page": "https://esawebb.org/images/weic2205a/",
     "credit": "NASA, ESA, CSA, and STScI", "licence": "CC BY 4.0", "focus": (0.5, 0.5)},
    {"record": "7rn7fxbl75o5cijqpnok5oc7rq", "title": "Whirlpool galaxy, M51", "device": "telescope", "by": "Hubble",
     "jpeg": "https://esahubble.org/media/archives/images/large/heic0506a.jpg", "page": "https://esahubble.org/images/heic0506a/",
     "credit": "NASA, ESA, S. Beckwith (STScI), and The Hubble Heritage Team (STScI/AURA)", "licence": "CC BY 4.0", "focus": (0.5, 0.44)},
    {"record": "4uweu43yaiik2mw5nc4eznztbu", "title": "Sombrero galaxy", "device": "telescope", "by": "Hubble",
     "jpeg": "https://esahubble.org/media/archives/images/large/opo0328a.jpg", "page": "https://esahubble.org/images/opo0328a/",
     "credit": "NASA/ESA and The Hubble Heritage Team (STScI/AURA)", "licence": "CC BY 4.0", "focus": (0.5, 0.5), "zoom": 0.86},
    {"record": "fi67bt4rxkic3ssuag2v2hskly", "title": "Mars, December 2024", "device": "telescope", "by": "Hubble",
     "file": "tiff", "page": "https://esahubble.org/images/heic2505b/",
     "credit": "NASA, ESA, STScI", "licence": "CC BY 4.0", "fit": "contain"},
    {"record": "2re7jfo2v34uwsqxkmpwxoxesu", "title": "Lion and impala, Kruger", "device": "camera", "by": "iNaturalist",
     "file": "jpeg", "page": "https://www.inaturalist.org/observations/39540446",
     "credit": "datadan, iNaturalist", "licence": "CC BY", "focus": (0.5, 0.36)},
    {"record": "ejvovl6sz7d3sugfcrwwie4rma", "title": "Dry lake cracks, drone", "device": "drone", "by": "OpenAerialMap",
     "file": "tiff", "level": 3, "page": "https://openaerialmap.org",
     "credit": "OpenAerialMap contributors", "licence": "CC BY 4.0", "focus": (0.55, 0.68), "zoom": 0.62},
    {"record": "qcoylkllqzfqnsinn4af5i2mi4", "title": "Robot arms, the coffee task", "device": "robot", "by": "ALOHA",
     "file": "mp4", "head": 16 << 20, "clip": (2.5, 6.0), "page": "https://huggingface.co/datasets/lerobot/aloha_static_coffee",
     "credit": "LeRobot, aloha_static_coffee", "licence": "MIT"},
]
SIZES = {"640": (640, 400), "1600": (1600, 1000)}


def cid26(b):
    return base64.b32encode(blake3(b).digest()[:16]).decode().lower().rstrip("=")


def b32full(b):
    return base64.b32encode(blake3(b).digest()).decode().lower().rstrip("=")


def fetch(url, dest=None, rng=None):
    req = urllib.request.Request(url, headers={"user-agent": "vortx.ai wow_media (+https://vortx.ai)", **({"range": "bytes=%d-%s" % rng} if rng else {})})
    with urllib.request.urlopen(req, timeout=600) as r:
        data = r.read()
    if dest:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    return data


def cached(name, url, rng=None):
    p = CACHE / name
    if not p.exists():
        fetch(url, p, rng)
    return p


def rows(note):
    """(offset, length, blake3) of every hashed row the note reads from its own source (url column '·')."""
    out = []
    for m in re.finditer(r"^\| [^|]* \| · \| (\d+) \| (\d+) \| ([a-z2-7]{52}) \|", note, re.M):
        out.append((int(m.group(1)), int(m.group(2)), m.group(3)))
    return out


def check_rows(note, reader, have):
    """Check every row inside the byte spans we hold; return (checked, total)."""
    rs, ok = rows(note), 0
    for off, ln, h in rs:
        if any(a <= off and off + ln <= b for a, b in have):
            got = b32full(reader(off, ln))
            if got != h:
                raise SystemExit(f"row at {off} does not hash to its note: {got} != {h}")
            ok += 1
    return ok, len(rs)


def crop(im, focus=(0.5, 0.5), zoom=1.0, aspect=1.6):
    w, h = im.size
    cw, ch = (w, w / aspect) if w / h < aspect else (h * aspect, h)
    cw, ch = cw * zoom, ch * zoom
    cx, cy = focus[0] * w, focus[1] * h
    x0 = min(max(0, cx - cw / 2), w - cw)
    y0 = min(max(0, cy - ch / 2), h - ch)
    return im.crop((round(x0), round(y0), round(x0 + cw), round(y0 + ch)))


def contain(im, size, bg=(5, 8, 13)):
    from PIL import Image
    im = im.copy()
    im.thumbnail(size, Image.LANCZOS)
    canvas = Image.new("RGB", size, bg)
    canvas.paste(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2))
    return canvas


def save(img, name):
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "WEBP", quality=82, method=6)
    b = buf.getvalue()
    (OUT / name).write_bytes(b)
    return {"path": "/assets/wow/" + name, "bytes": len(b), "cid26": cid26(b)}


def render(it):
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    rec = it["record"]
    note_b = fetch(NOTE.format(rec))
    if cid26(note_b) != rec:
        raise SystemExit(f"{rec}: the note does not hash to its name")
    note = note_b.decode()
    src = re.search(r"^source: (\S+)", note, re.M).group(1)
    entry = {k: it[k] for k in ("record", "title", "device", "by", "credit", "licence", "page")}
    entry["note"] = NOTE.format(rec)
    entry["source"] = src
    files = {}
    if "jpeg" in it:
        p = cached(rec + ".jpg", it["jpeg"])
        entry["method"] = "the publisher's own JPEG of the same image; the note's file is the archive TIFF"
        entry["drawn_from"] = it["jpeg"]
        im = Image.open(p)
        im.draft("RGB", (im.width // 4, im.height // 4))
        pic = im.convert("RGB")
    elif it["file"] == "mp4":
        size = int(re.search(r"^bytes: (\d+)", note, re.M).group(1))
        moov = [r for r in rows(note) if r[0] > it["head"]][0]  # the index row, at the file's end
        head = cached(rec + ".head", src, (0, it["head"] - 1)).read_bytes()
        tail = cached(rec + ".moov", src, (moov[0], "")).read_bytes()
        sparse = CACHE / (rec + ".mp4")
        with open(sparse, "wb") as f:
            f.write(head)
            f.seek(moov[0])
            f.write(tail)
        with open(sparse, "rb") as f:
            got = check_rows(note, lambda o, n: (f.seek(o), f.read(n))[1], [(0, len(head)), (moov[0], size)])
        entry["checked"] = f"{got[0]} of {got[1]} rows: the header, the index and the first frames"
        entry["method"] = "cut from the file's own bytes: its index and first frames, each row checked against the note"
        entry["drawn_from"] = src
        ff = __import__("imageio_ffmpeg").get_ffmpeg_exe()
        t0, dur = it["clip"]
        vf = "crop=640:400:0:40,fps=25"
        for ext, args in (("webm", ["-c:v", "libvpx-vp9", "-crf", "38", "-b:v", "0", "-row-mt", "1", "-deadline", "good"]),
                          ("mp4", ["-c:v", "libx264", "-crf", "30", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart"])):
            out = OUT / f"{rec}-loop.{ext}"
            OUT.mkdir(parents=True, exist_ok=True)
            subprocess.run([ff, "-y", "-loglevel", "error", "-ss", str(t0), "-t", str(dur), "-i", str(sparse), "-vf", vf, "-an", *args, str(out)], check=True)
            b = out.read_bytes()
            files["loop_" + ext] = {"path": "/assets/wow/" + out.name, "bytes": len(b), "cid26": cid26(b)}
        poster = CACHE / (rec + "-poster.png")
        subprocess.run([ff, "-y", "-loglevel", "error", "-ss", str(t0), "-i", str(sparse), "-frames:v", "1", "-vf", "crop=640:400:0:40", str(poster)], check=True)
        pic = Image.open(poster).convert("RGB")
    else:
        p = cached(rec + "." + it["file"], src)
        data = p.read_bytes()
        got = check_rows(note, lambda o, n: data[o:o + n], [(0, len(data))])
        entry["checked"] = f"{got[0]} of {got[1]} rows"
        entry["method"] = "drawn from the file's own bytes, after every hashed row of the note was checked"
        entry["drawn_from"] = src
        if it["file"] == "jpeg":
            pic = Image.open(io.BytesIO(data)).convert("RGB")
        else:
            import numpy as np
            import tifffile
            with tifffile.TiffFile(io.BytesIO(data)) as t:
                s = t.series[0]
                lv = (s.levels if s.levels else [s])[it.get("level", 0)]
                a = lv.asarray()
            if a.ndim == 3 and a.shape[0] in (3, 4) and a.shape[-1] not in (3, 4):
                a = np.moveaxis(a, 0, -1)
            pic = Image.fromarray(a[..., :3].astype("uint8"))
    for key, size in SIZES.items():
        if max(pic.size) < size[0] * 0.9:
            continue  # never upscale: a picture is only as sharp as its source
        if it.get("fit") == "contain":
            img = contain(pic, size)
        else:
            img = crop(pic, it.get("focus", (0.5, 0.5)), it.get("zoom", 1.0)).resize(size, Image.LANCZOS)
        files[key] = save(img, f"{rec}-{key}.webp")
    entry["files"] = files
    return entry


def check():
    m = json.loads(MANIFEST.read_text())
    bad = []
    for e in m["pictures"]:
        for f in e["files"].values():
            p = ROOT / f["path"].lstrip("/")
            if not p.exists() or cid26(p.read_bytes()) != f["cid26"]:
                bad.append(f["path"])
    if bad:
        print("these files do not hash to their names in data/pictures.json:", *bad, sep="\n  ")
        sys.exit(1)
    print(f"{sum(len(e['files']) for e in m['pictures'])} pictures and clips hash to their names")


def main():
    if "--check" in sys.argv:
        return check()
    CACHE.mkdir(parents=True, exist_ok=True)
    pics = []
    for it in ITEMS:
        e = render(it)
        print(f"{e['record'][:8]} {e['title']}: {e.get('checked', 'publisher JPEG')}; " + ", ".join(f"{k} {v['bytes'] // 1024} KB" for k, v in e["files"].items()))
        pics.append(e)
    MANIFEST.write_text(json.dumps({"schema": "vortx.pictures.v1", "about": "pictures and clips the homepage shows for its samples; see tools/wow_media.py", "pictures": pics}, indent=1, ensure_ascii=False) + "\n")
    check()


if __name__ == "__main__":
    main()
