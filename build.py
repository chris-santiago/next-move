#!/usr/bin/env python3
"""Wrap plan.content.html (the artifact-ready fragment) into a standalone HTML document.

The fragment is authored without <!doctype>/<html>/<head>/<body> because the Artifact
publisher supplies that skeleton. For the file-on-disk copy we hoist <title> and every
<style> block into a real <head> so the tab name and CSS resolve the same way.
"""
import pathlib
import re

HERE = pathlib.Path(__file__).parent
SRC = HERE / "plan.content.html"
# GitHub Pages serves index.html at the site root, and this is also the file to
# open locally, so there is only ever one build output to reason about.
OUT = HERE / "dist" / "index.html"


def build(src: str) -> str:
    title_m = re.search(r"<title>(.*?)</title>", src, re.S)
    title = title_m.group(1).strip() if title_m else "Next Move"
    styles = re.findall(r"<style>.*?</style>", src, re.S)

    links = re.findall(r"<link\b[^>]*>", src)

    body = re.sub(r"<title>.*?</title>\s*", "", src, flags=re.S)
    for block in styles + links:
        body = body.replace(block, "", 1)

    head = "\n".join(links + styles)
    return (
        '<!doctype html>\n<html lang="en">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<meta name="color-scheme" content="light dark">\n'
        f"<title>{title}</title>\n"
        f"{head}\n</head>\n<body>\n{body.strip()}\n</body>\n</html>\n"
    )


def main() -> None:
    doc = build(SRC.read_text(encoding="utf-8"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(doc, encoding="utf-8")
    print(f"built {OUT.relative_to(HERE)} ({len(doc):,} bytes)")


if __name__ == "__main__":
    main()
