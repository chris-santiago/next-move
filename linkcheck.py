#!/usr/bin/env python3
"""End-to-end: have the built page make a share link, then open that link fresh.

A link is only real if a browser that has never seen the sender's data can open it
and show the plan, so this drives one browser to build the link and another to use it.
"""
import html as htmlmod
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
PAGE = HERE / "dist" / "index.html"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT = HERE / "shots"

SEED = {
    "version": 1, "view": "plan", "mirrorIdx": 12,
    "ratings": {"noDebt": 5, "hands": 5, "earnSoon": 4, "tech": 4},
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
               "pick": {"demand": "few"}, "tuesday": {"day": "Up at six, on site by seven."},
               "proof": {"reviewed": "2026-08-14"}, "unknowns": ["test"]}],
}


def dump(url, extra_args=()):
    return subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--dump-dom", "--virtual-time-budget=4000",
         "--allow-file-access-from-files", *extra_args, url],
        capture_output=True, text=True, check=True).stdout


def grab(dom, tag="R"):
    m = re.search(rf'<pre id="{tag}">(.*?)</pre>', dom, re.S)
    return htmlmod.unescape(m.group(1)) if m else None


def main():
    OUT.mkdir(exist_ok=True)
    page = PAGE.read_text(encoding="utf-8")

    # 1. a sender with a filled-in plan builds a link
    inject = ("<script>try{localStorage.setItem('nextmove.v1',"
              + json.dumps(json.dumps(SEED)) + ");}catch(e){}</script>")
    maker = """
<script>
setTimeout(function(){
  buildLink().then(function(u){
    document.documentElement.innerHTML='<head></head><body><pre id="R"></pre></body>';
    document.getElementById('R').textContent=u;
  }).catch(function(e){
    document.documentElement.innerHTML='<head></head><body><pre id="R"></pre></body>';
    document.getElementById('R').textContent='ERROR '+e;
  });
},500);
</script>
"""
    f = OUT / "_sender.html"
    f.write_text(page.replace("<body>", "<body>\n" + inject, 1).replace("</body>", maker + "</body>", 1),
                 encoding="utf-8")
    link = grab(dump(f.as_uri()))
    f.unlink()
    if not link or link.startswith("ERROR"):
        print("FAIL: could not build a link:", link)
        return 1
    frag = link[link.index("#"):]
    print(f"link length: {len(link):,} chars")
    print(f"fragment:    {frag[:60]}…\n")

    # 2. a different browser profile, with none of the sender's data, opens it
    probe = """
<script>
window.__ERR__='';
window.addEventListener('error',function(e){window.__ERR__+=String(e.message)+' | ';});
setTimeout(function(){
  var out;
  try{
    var sb=document.getElementById('sharedbar'), mn=document.getElementById('main');
    var keys=[]; try{ for(var i=0;i<localStorage.length;i++)keys.push(localStorage.key(i)); }catch(e){}
    out=JSON.stringify({
      err: window.__ERR__,
      banner: sb?String(sb.style.display||''):'missing',
      bannerText: sb?String(sb.textContent||'').slice(0,140):'',
      hasName: mn?mn.innerHTML.indexOf('IBEW Local 26')>-1:false,
      hasPlanView: mn?mn.innerHTML.indexOf('Everything you owe')>-1:false,
      stillLoading: mn?mn.innerHTML.indexOf('Opening a shared plan')>-1:false,
      failed: mn?mn.innerHTML.indexOf('did not open')>-1:false,
      navCount:(document.getElementById('nav')||{children:[]}).children.length,
      keys: keys.join(',')
    });
  }catch(e){ out=JSON.stringify({error:String(e&&e.stack||e)}); }
  document.documentElement.innerHTML='<head></head><body><pre id="R"></pre></body>';
  document.getElementById('R').textContent=out;
},1500);
</script>
"""
    r = OUT / "_reader.html"
    r.write_text(page.replace("</body>", probe + "</body>", 1), encoding="utf-8")
    info = grab(dump(r.as_uri() + frag))
    r.unlink()
    if not info:
        print("FAIL: the reader page produced nothing")
        return 1
    d = json.loads(info)
    if d.get("error") or d.get("err"):
        print("FAIL runtime error:", d.get("error") or d.get("err"))
        return 1

    checks = [
        ("the link opens without error", not d["failed"]),
        ("it finishes unpacking", not d["stillLoading"]),
        ("the sender's plan is on screen", d["hasName"] or d["hasPlanView"]),
        ("the whole app is there", d["navCount"] == 6),
        ("the shared banner is shown", d["banner"] == "block"),
        ("it names the sender", "Marco" in d["bannerText"]),
        ("it says changes stay local", "does not reach them" in d["bannerText"]),
        ("nothing was written to the reader's own plan", "nextmove.v1" not in d["keys"].split(",")),
    ]
    bad = [n for n, okk in checks if not okk]
    for n, okk in checks:
        print(f"  {'ok  ' if okk else 'FAIL'} {n}")
    print("\n" + ("ALL CHECKS PASSED" if not bad else f"{len(bad)} FAILED"))
    (OUT / "link.txt").write_text(link, encoding="utf-8")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
