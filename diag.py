#!/usr/bin/env python3
"""Report which elements overflow the viewport width, at a given CSS width."""
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
PAGE = HERE / "dist" / "index.html"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP = HERE / "shots"

PROBE = """
<script>
setTimeout(function(){
  var vw = document.documentElement.clientWidth, out = [];
  document.querySelectorAll('*').forEach(function(el){
    var r = el.getBoundingClientRect();
    if (r.width > vw + 1 || r.right > vw + 1) {
      out.push({ tag: el.tagName.toLowerCase(), cls: el.className && el.className.toString().slice(0,40),
                 w: Math.round(r.width), right: Math.round(r.right), sw: el.scrollWidth });
    }
  });
  var pre = document.createElement('pre'); pre.id = 'DIAG';
  pre.textContent = JSON.stringify({ vw: vw, bodyScroll: document.body.scrollWidth,
    docScroll: document.documentElement.scrollWidth, offenders: out.slice(0, 14) }, null, 1);
  document.body.prepend(pre);
}, 400);
</script>
"""


def main():
    width = int(sys.argv[1]) if len(sys.argv) > 1 else 390
    view = sys.argv[2] if len(sys.argv) > 2 else "money"
    TMP.mkdir(exist_ok=True)
    from shots import SEED as seed
    html = PAGE.read_text(encoding="utf-8")
    if seed:
        seed["view"] = view
        html = html.replace("<body>", "<body>\n<script>try{localStorage.setItem('nextmove.v1',"
                            + json.dumps(json.dumps(seed)) + ");}catch(e){}</script>", 1)
    html = html.replace("</body>", PROBE + "</body>", 1)
    f = TMP / "_diag.html"
    f.write_text(html, encoding="utf-8")
    res = subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--dump-dom", f"--window-size={width},900",
         "--virtual-time-budget=2500", "--allow-file-access-from-files", f.as_uri()],
        capture_output=True, text=True,
    )
    m = re.search(r'<pre id="DIAG">(.*?)</pre>', res.stdout, re.S)
    print(m.group(1).replace("&quot;", '"') if m else "no probe output")
    f.unlink()


if __name__ == "__main__":
    main()
