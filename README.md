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
| `linkcheck.py` | end-to-end: has one browser build a share link, then opens it in a browser with none of the sender's data |

All three need Google Chrome installed.

## How it holds data

State is a single serialisable object persisted to `localStorage`, plus explicit JSON export and import. There is no server and nothing is ever uploaded.

A plan reaches someone else three ways, and all three feed the same `hydrate()` seam on arrival:

- **A link.** The state is gzipped and base64url-encoded into the URL fragment. Browsers never send a fragment to the server, so the plan travels inside the message and GitHub only ever serves the page. This is the only route that works on a phone, which is why the app is hosted rather than passed around as a file.
- **A file.** The page serialises its own DOM with the state embedded as a seed script. Self-contained and works offline forever, but iOS has no way to open a local HTML file in a browser, so it is a desktop route.
- **Backup text.** Plain JSON, copied and pasted.

A received plan is stored under its own key derived from the seed id, so a counselor reading three students' plans never overwrites their own or each other's.

## Deploying

Pushing to `main` runs the test suite, builds `dist/`, and publishes to GitHub Pages. Pages must be set to deploy from GitHub Actions rather than from a branch.
