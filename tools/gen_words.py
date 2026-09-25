#!/usr/bin/env python3
"""Publish the site's words: one meaning per verb and per term, named by its own hash.

content/words.md is the source. It is served, byte for byte, at /prose/<cid26>.md, where
cid26 = base32(blake3(bytes)[0:16]), lowercase and unpadded: the way emem names a note. Every
page carries that name in <html data-words="...">, and js/ladder.js fetches the note only when a
visitor clicks a verb or a term, checks the name against the bytes, then shows the meaning.

The check also holds the site to its own rule, one verb one meaning: every verb a page shows
(each <b class="v">) and every verb a script writes into a log line must have an entry here.

    python3 tools/gen_words.py          # publish the note and pin its name in every page
    python3 tools/gen_words.py --check  # exit 1 if a page, a rung of llms.txt or the note is stale, or a verb has no meaning
"""

import base64
import re
import sys
from pathlib import Path

from blake3 import blake3

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "words.md"
OUT = ROOT / "prose"
SKIP_DIRS = {".git", "node_modules", "prose", "content", "vendor"}


def cid26(data: bytes) -> str:
    return base64.b32encode(blake3(data).digest()[:16]).decode().lower().rstrip("=")


def entries(text: str):
    """{name: group}, including every 'also:' alias."""
    out, group, name = {}, None, None
    for line in text.splitlines():
        if line.startswith("## "):
            group = line[3:].strip()
        elif line.startswith("### "):
            name = line[4:].strip().lower()
            out[name] = group
        elif line.startswith("also:") and name:
            for a in line[5:].split(","):
                if a.strip():
                    out[a.strip().lower()] = group
    return out


def pages():
    for p in sorted(ROOT.rglob("*.html")):
        if not SKIP_DIRS.intersection(p.relative_to(ROOT).parts):
            yield p


def used_verbs():
    """Every verb shown on a page or written into a log line by a script, with where it appears."""
    seen = {}
    for p in pages():
        for m in re.finditer(r'<b class="v(?: [^"]*)?">([^<]+)</b>', p.read_text(errors="ignore")):
            v = m.group(1).strip().lower()
            if not v.startswith("emem:"):
                seen.setdefault(v, str(p.relative_to(ROOT)))
    for p in sorted((ROOT / "js").glob("*.js")):
        s = p.read_text()
        for m in re.finditer(r"(?:\bR|this|mine)\.line\('([a-z][a-z ]{1,14})'|\bline\('([a-z][a-z ]{1,14})'", s):
            v = (m.group(1) or m.group(2)).strip()
            seen.setdefault(v, str(p.relative_to(ROOT)))
        for m in re.finditer(r'<b class=\\?"v\\?">([a-z][a-z ]{1,14})</b>', s):
            seen.setdefault(m.group(1).strip(), str(p.relative_to(ROOT)))
    return seen


def pin(html: str, cid: str, top: int, size: int) -> str:
    tag = re.search(r"<html\b[^>]*>", html)
    if not tag:
        return html
    t = tag.group(0)
    new = re.sub(r'\sdata-(?:words|words-size|llms-size)="[^"]*"', "", t)
    new = new[:-1] + f' data-words="{cid}" data-words-size="{size}" data-llms-size="{top}">'
    html = html[: tag.start()] + new + html[tag.end():]
    return re.sub(r"/prose/[a-z2-7]{26}\.md", f"/prose/{cid}.md", html)


def main():
    check = "--check" in sys.argv
    data = SRC.read_bytes()
    cid = cid26(data)
    problems = []

    # the note itself, and nothing stale beside it
    target = OUT / f"{cid}.md"
    if not target.exists() or target.read_bytes() != data:
        problems.append(f"prose/{cid}.md is missing or differs from content/words.md")
        if not check:
            OUT.mkdir(exist_ok=True)
            target.write_bytes(data)
    for old in OUT.glob("*.md") if OUT.exists() else []:
        if old.name != target.name and re.fullmatch(r"[a-z2-7]{26}\.md", old.name):
            problems.append(f"prose/{old.name} is a stale copy")
            if not check:
                old.unlink()

    # the agents' top rung names every rung below it by size and by hash, the words note included
    llms = ROOT / "llms.txt"
    s = llms.read_text()

    def row(m):
        path = f"prose/{cid}.md" if m.group(2).startswith("prose/") else m.group(2)
        body = data if path.startswith("prose/") else ((ROOT / path).read_bytes() if (ROOT / path).exists() else b"")
        if not body:
            problems.append(f"llms.txt names {path}, which does not exist")
        return f"{m.group(1)}https://vortx.ai/{path}  size={len(body)}  cid26={cid26(body)}"

    new = re.sub(r"^(\S+\s+)https://vortx\.ai/(llms/[a-z]+\.txt|prose/[a-z2-7]{26}\.md)\s+size=\d+\s+cid26=[a-z2-7]{26}", row, s, flags=re.M)
    if f"/prose/{cid}.md" not in new:
        problems.append("llms.txt has no ladder row for the words note")
    for rung in sorted((ROOT / "llms").glob("*.txt")):
        if f"https://vortx.ai/llms/{rung.name}" not in new:
            problems.append(f"llms.txt has no ladder row for llms/{rung.name}")
    if new != s:
        problems.append("llms.txt: a rung's size or name is stale")
        if not check:
            llms.write_text(new)
    top = len(new.encode())

    # every page names the current note, and says what the top rung and the words weigh
    for p in pages():
        s = p.read_text()
        out = pin(s, cid, top, len(data))
        if out != s:
            problems.append(f"{p.relative_to(ROOT)} does not name words {cid} with current sizes")
            if not check:
                p.write_text(out)

    # one verb, one meaning
    known = entries(data.decode())
    missing = {v: where for v, where in used_verbs().items() if v not in known}
    for v, where in sorted(missing.items()):
        problems.append(f"verb '{v}' ({where}) has no meaning in content/words.md")

    if check:
        if problems:
            print("\n".join(problems))
            sys.exit(1)
        print(f"words {cid}: {len(known)} entries, every page names it, every verb has a meaning")
        return
    print(f"words {cid}: {len(known)} entries, {len(data)} bytes")
    for v, where in sorted(missing.items()):
        print(f"  no meaning yet: '{v}' ({where})")


if __name__ == "__main__":
    main()
