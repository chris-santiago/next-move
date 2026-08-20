#!/usr/bin/env python3
"""End-to-end check: have the built page produce a shared copy, then open that copy.

The export is only meaningful if the file it makes actually runs, so this drives a
real browser to serialise it, writes the result to disk, and loads that file fresh.
"""
import html as htmlmod
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT = HERE / "shots"

SEED = {
    "version": 1, "view": "plan", "mirrorIdx": 12,
    "ratings": {"noDebt": 5, "hands": 5, "earnSoon": 4, "tech": 4, "away": 3},
    "free": {"likes": "Taking apart small engines."},
    "plan": {"grad": "2028-06-09", "ms": {"m1": {"done": True, "note": "met Ms. Alvarez"}},
             "keep": ["b"], "actions": [{"t": "Call IBEW about the window", "d": "2026-09-15", "p": ""},
                                        {"t": "", "d": "", "p": ""}, {"t": "", "d": "", "p": ""}],
             "who": "Marco", "adult": "Dad", "review": "2026-11-01",
             "help": "Rides to the campus visits."},
    "paths": [{"id": "b", "type": "apprenticeship", "name": "IBEW Local 26", "loc": "Northern Virginia",
               "url": "", "why": "Paid from day one.", "chips": ["hands", "tech"], "want": 4,
               "money": {"years": 5, "cost": 1200, "during": 42000, "after": 88000},
               "reqs": {"entry": {"says": "18 and a diploma"}}, "reality": {"quit": "February outside"},
               "pick": {"demand": "few"}, "tuesday": {"day": "Up at six."},
               "proof": {"reviewed": "2026-08-14"}, "unknowns": ["test"]}],
}


def run(target, args, out=None):
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
           "--virtual-time-budget=3000", "--allow-file-access-from-files"] + args + [target.as_uri()]
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def main():
    OUT.mkdir(exist_ok=True)
    page = (HERE / "dist" / "index.html").read_text(encoding="utf-8")

    # 1. seed a plan, then have the page serialise a shareable copy of itself
    inject = ("<script>try{localStorage.setItem('nextmove.v1',"
              + json.dumps(json.dumps(SEED)) + ");}catch(e){}</script>")
    dump = ("<script>setTimeout(function(){var h=sharedHtml();"
            "document.documentElement.innerHTML='<head></head><body><pre id=\"OUT\"></pre></body>';"
            "document.getElementById('OUT').textContent=h;},400);</script>")
    src = page.replace("<body>", "<body>\n" + inject, 1).replace("</body>", dump + "</body>", 1)
    f = OUT / "_maker.html"
    f.write_text(src, encoding="utf-8")
    res = run(f, ["--dump-dom"])
    m = re.search(r'<pre id="OUT">(.*?)</pre>', res.stdout, re.S)
    if not m:
        print("FAIL: the page did not produce a copy")
        return 1
    shared = htmlmod.unescape(m.group(1))
    f.unlink()

    out = OUT / "shared-copy.html"
    out.write_text(shared, encoding="utf-8")
    print(f"shared copy: {len(shared):,} bytes")

    checks = [
        ("starts as a real document", shared.lstrip().lower().startswith("<!doctype html>")),
        ("carries the seed", 'window.__SEED__=' in shared),
        ("the seed holds the student's data", "IBEW Local 26" in shared),
        ("names who it came from", '"from":"Marco"' in shared),
        ("keeps the whole app", "buildPrintDoc" in shared and "vCompare" in shared),
        ("no external scripts", not re.search(r"<script[^>]+\bsrc=", shared)),
        ("no rendered leftovers baked in", '<div class="wrap" id="main"></div>' in shared),
        ("exactly one seed script", shared.count('id="seed"') == 1),
        ("no leftover preconnect tags", "<link rel=\"preconnect\"" not in shared),
    ]
    bad = [n for n, ok in checks if not ok]
    for n, okk in checks:
        print(f"  {'ok  ' if okk else 'FAIL'} {n}")

    # 2. open the produced file fresh and confirm it runs with the data
    probe = """
<script>
window.__ERR__='';
window.addEventListener('error',function(e){window.__ERR__+=String(e.message)+' | ';});
setTimeout(function(){
  /* touch it the way a reader would, so persistence actually happens */
  try{ var t=document.querySelector('[data-act="go"][data-v="compare"]'); if(t)t.click(); }catch(e){}
}, 500);
setTimeout(function(){
  var out;
  try{
    var sb=document.getElementById('sharedbar');
    var mn=document.getElementById('main');
    var keys=[]; try{ for(var i=0;i<localStorage.length;i++)keys.push(localStorage.key(i)); }catch(e){}
    out=JSON.stringify({
      err: window.__ERR__,
      banner: sb?String(sb.style.display||''):'missing',
      bannerText: sb?String(sb.textContent||'').slice(0,140):'',
      hasName: mn?mn.innerHTML.indexOf('IBEW Local 26')>-1:false,
      hasPlan: mn?mn.innerHTML.indexOf('Everything you owe')>-1:false,
      navCount: (document.getElementById('nav')||{children:[]}).children.length,
      len: mn?mn.innerHTML.length:0,
      keys: keys.join(',')
    });
  }catch(e){ out=JSON.stringify({error:String(e&&e.stack||e)}); }
  document.documentElement.innerHTML='<head></head><body><pre id="R"></pre></body>';
  document.getElementById('R').textContent=out;
},1200);
</script>
"""
    opened = OUT / "_opened.html"
    opened.write_text(shared.replace("</body>", probe + "</body>", 1), encoding="utf-8")
    res2 = run(opened, ["--dump-dom"])
    m2 = re.search(r'<pre id="R">(.*?)</pre>', res2.stdout, re.S)
    opened.unlink()
    if not m2:
        print("  FAIL the shared copy did not boot; raw tail:")
        print(res2.stdout[-800:])
        return 1
    info = json.loads(htmlmod.unescape(m2.group(1)))
    print("\nopening the shared copy:")
    print("  storage keys:", info["keys"] or "(none)")
    if info.get("error"):
        print("  FAIL threw:", info["error"])
        return 1
    if info.get("err"):
        print("  FAIL runtime error:", info["err"])
        return 1
    live = [
        ("it boots and renders", info["len"] > 500),
        ("all six tabs are present", info["navCount"] == 6),
        ("the student's data is there", info["hasName"] or info["hasPlan"]),
        ("the shared banner shows", info["banner"] == "block"),
        ("the banner names them", "Marco" in info["bannerText"]),
        ("it saves under its own key", "nextmove.shared." in info["keys"]),
        ("and never touches the reader's own plan",
         "nextmove.v1" not in [k for k in info["keys"].split(",")]),
    ]
    for n, okk in live:
        print(f"  {'ok  ' if okk else 'FAIL'} {n}")
        if not okk:
            bad.append(n)
    print("\n" + ("ALL CHECKS PASSED" if not bad else f"{len(bad)} FAILED: {bad}"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
