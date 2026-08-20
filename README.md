# Next Move

An interactive replacement for a post-high-school options worksheet: rate what matters to you, add the paths you are actually considering, see what each one costs and pays over time, and end up with a dated checklist you can print or hand to a counselor.

It is one self-contained HTML file. No build framework, no dependencies, no network calls, no accounts. Everything a person writes stays in their own browser.

## Working on it

`plan.content.html` is the source of truth. It is written as an HTML fragment (no `<!doctype>`, `<html>`, `<head>` or `<body>`) because it is also published as a Claude artifact, where that skeleton is supplied by the host.

```
python3 build.py     # wraps the fragment into dist/index.html
node test.mjs        # 330+ tests, no install needed
```

`build.py` hoists `<title>`, `<link>` and `<style>` into a real `<head>` and wraps the rest in `<body>`. Open `dist/index.html` directly in a browser to use it locally.

## Tests

`test.mjs` extracts the page's own `<script>` blocks and runs them against a minimal DOM stub, so it tests the shipped code rather than a copy of it. It covers the derivation layer (fit scoring, money projections, agenda bucketing), the event handlers, both export formats, and the invariants that are easy to break by accident: that no money question is ever asked twice, that a date is never required for an item to appear, and that every jump target and highlight selector actually resolves.

## Dev tools

| script | what it does |
| --- | --- |
| `shots.py` | renders every view to PNG with headless Chrome, including phone widths and dark mode |
| `diag.py` | reports which elements overflow the viewport at a given width |
| `sharecheck.py` | end-to-end: makes the page serialise a shareable copy, then opens that copy and checks it boots with the data |

All three need Google Chrome installed.

## How it holds data

State is a single serialisable object persisted to `localStorage`, plus explicit JSON export and import. There is no server, so a plan moves between devices by exporting a backup or by sending a working copy: a full copy of the page with the answers embedded as a seed script, which opens standalone in any browser and stores under its own key so it never collides with the reader's own plan.

## Deploying

Pushing to `main` runs the test suite, builds `dist/`, and publishes to GitHub Pages. Pages must be set to deploy from GitHub Actions rather than from a branch.
