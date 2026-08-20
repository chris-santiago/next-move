#!/usr/bin/env python3
"""Render each view of post-hs-plan.html to a PNG with headless Chrome.

Builds a throwaway fixture per view: a seed script (written before the app's own
scripts, so the app's load() picks it up from localStorage) and an optional
post-boot script (appended after them) to drive clicks.
"""
import json
import pathlib
import shutil
import subprocess

HERE = pathlib.Path(__file__).parent
PAGE = HERE / "dist" / "index.html"
OUT = HERE / "shots"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

SEED = {
    "version": 1, "view": "paths", "mirrorIdx": 12,
    "ratings": {"earnSoon": 4, "longEarn": 3, "noDebt": 5, "away": 4, "near": 2,
                "hands": 5, "tech": 4, "help": 2, "creative": 3, "predictable": 2,
                "switch": 3, "campus": 4},
    "free": {"likes": "Taking apart small engines, arguing about cars, anything with a wiring diagram."},
    "paths": [
        {"id": "a", "type": "university", "name": "State U", "loc": "Blacksburg, VA",
         "why": "Two friends are going and the engineering program is supposed to be good.",
         "chips": ["tech", "away"], "want": 3,
         "money": {"years": 4, "cost": 31000, "during": "", "after": ""},
         "reqs": {"gpa": {"says": "Middle 50% is 3.6 to 4.1 weighted", "action": "check my weighted GPA", "due": ""}},
         "reality": {"quit": "If the loans get past about 40k", "length": "4 years, maybe 5"},
         "unknowns": ["testing", "aid"]},
        {"id": "b", "type": "apprenticeship", "name": "IBEW Local 26", "loc": "Northern Virginia",
         "why": "Paid from day one and my uncle did it.", "chips": ["hands", "tech"], "want": 4,
         "money": {"years": 5, "cost": 1200, "during": 42000, "after": 88000},
         "reqs": {"entry": {"says": "18, HS diploma, one year of algebra", "action": "pull my transcript", "due": ""}},
         "reality": {"quit": "If I hate being outside in February", "length": "5 years, earning the whole time"},
         "unknowns": ["test"]},
        {"id": "c", "type": "trade", "name": "Lincoln Tech", "loc": "Columbia, MD",
         "why": "Diesel program, 18 months, done fast.", "chips": ["hands"], "want": 3,
         "money": {"years": 2, "cost": 24000, "during": 6000, "after": ""},
         "reality": {"quit": "If the job listings dry up around here"},
         "unknowns": []},
        {"id": "d", "type": "military", "name": "Air Force", "loc": "wherever they send me",
         "why": "Pays for school after and I would get out of here.", "chips": ["tech", "away"], "want": 2,
         "money": {"years": "", "cost": "", "during": "", "after": ""}, "unknowns": ["asvab", "medical"]},
    ],
    "plan": {"grad": "2028-06-09", "ms": {"m1": {"done": True, "note": "met Ms. Alvarez 3/4"},
                                          "m2": {"done": True, "note": ""}, "m3": {"done": False, "note": ""}},
             "keep": ["b", "c"],
             "actions": [{"t": "Call IBEW and ask when the application window opens", "d": "2026-09-15", "p": "date written here"},
                         {"t": "", "d": "", "p": ""}, {"t": "", "d": "", "p": ""}],
             "who": "", "adult": "", "review": "", "help": ""},
}

# (name, seed, post-boot script, (w, h), phone?) -- phone shots render inside a
# fixed-width iframe because headless Chrome will not open a window under ~500px.
SHOTS = [
    ("01-welcome", None, None, (1240, 900)),
    ("02-mirror-card", {**SEED, "view": "mirror", "mirrorIdx": 5, "ratings": {}}, None, (1240, 820)),
    ("03-reflection", {**SEED, "view": "mirror"}, None, (1240, 1500)),
    ("04-paths", SEED, None, (1240, 900)),
    ("05-editor", SEED, "document.querySelector('[data-act=\"edit\"]').click()", (1240, 1700)),
    ("06-money", {**SEED, "view": "money"}, None, (1240, 1100)),
    ("07-compare", {**SEED, "view": "compare"}, None, (1240, 1400)),
    ("08-plan", {**SEED, "view": "plan"}, None, (1240, 1600)),
    ("09-phone-mirror", {**SEED, "view": "mirror", "mirrorIdx": 2, "ratings": {}}, None, (390, 800)),
    ("10-phone-money", {**SEED, "view": "money"}, None, (390, 900)),
    ("11-phone-paths", SEED, None, (390, 900)),
    ("12-phone-editor", SEED, "document.querySelector('[data-act=\"edit\"]').click()", (390, 1100)),
    ("13-dark-money", {**SEED, "view": "money"}, "document.documentElement.setAttribute('data-theme','dark')", (1240, 1000)),
    ("14-dark-editor", SEED, "document.documentElement.setAttribute('data-theme','dark');document.querySelector('[data-act=\"edit\"]').click()", (1240, 1200)),
]
PHONE_MIN = 500  # headless Chrome will not render a window narrower than this


def fixture(name, seed, after):
    html = PAGE.read_text(encoding="utf-8")
    pre = ""
    if seed is not None:
        pre = ("<script>try{localStorage.setItem('nextmove.v1',"
               + json.dumps(json.dumps(seed)) + ");}catch(e){document.title='NO-STORAGE';}</script>")
    html = html.replace("<body>", "<body>\n" + pre, 1)
    if after:
        html = html.replace("</body>", "<script>" + after + "</script>\n</body>", 1)
    f = OUT / (name + ".html")
    f.write_text(html, encoding="utf-8")
    return f


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for name, seed, after, (w, h) in SHOTS:
        f = fixture(name, seed, after)
        shot_w, shot_h = w, h
        if w < PHONE_MIN:
            wrapper = OUT / (name + "-frame.html")
            wrapper.write_text(
                f'<body style="margin:0;background:#888">'
                f'<iframe src="{f.name}" style="width:{w}px;height:{h}px;border:0;display:block"></iframe>',
                encoding="utf-8")
            f = wrapper
            shot_w, shot_h = w + 30, h + 20
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             f"--screenshot={OUT / (name + '.png')}", f"--window-size={shot_w},{shot_h}",
             "--virtual-time-budget=2000", "--allow-file-access-from-files", f.as_uri()],
            check=True, capture_output=True,
        )
        print(f"  {name}.png")
    for f in OUT.glob("*.html"):
        f.unlink()


if __name__ == "__main__":
    main()
