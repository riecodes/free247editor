"""Build a HyperFrames composition in one Look.

    python looks/build_look.py <look> <project_dir> <config.json> [--record <slug>]

config.json (paths relative to the project dir, times in seconds on the video's own timeline):
  {"video": "assets/clip.mp4", "audio": "assets/clip.wav", "words": "words.json", "duration": 8.5,
   "face": [580, 940],                       # eyes-to-chin band (y px at 1080x1920), measured per video
   "hook": {"end": 3.0, "top": 880, "lines": [["Most agents will", 0.0], ["post", 1.06], ["& hope", 2.12]]},  # top optional
   "list": {"start": 6.3, "end": 8.5, "title": "When I take a listing", "items": [["Photos", 6.6]]},
   "keys": ["listing", "photos"],
   "font_swap": {"playfair-400.woff2": "assets/fonts/alt/cormorant-500.woff2"}}  # optional: same Look, new fonts
Writes <project_dir>/index.html and copies the Look's fonts to <project_dir>/assets/fonts/<look>/.
--record appends {look, slug, date} to looks/history.json (the next video must pick a different Look).
"""
import datetime
import html
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
record = args[args.index("--record") + 1] if "--record" in args else None
look_name, proj, cfg_path = [a for i, a in enumerate(args) if a != "--record" and (i == 0 or args[i - 1] != "--record")][:3]

look_dir = os.path.join(HERE, look_name)
look = json.load(open(os.path.join(look_dir, "look.json"), encoding="utf-8"))
css = open(os.path.join(look_dir, "look.css"), encoding="utf-8").read()
cfg = json.load(open(cfg_path, encoding="utf-8"))
P = lambda p: os.path.join(proj, p)
DUR = float(cfg["duration"])
M = look["motion"]

# Fonts ship as files next to the composition (a named font that isn't shipped silently falls back in the render).
font_dir = P(f"assets/fonts/{look_name}")
os.makedirs(font_dir, exist_ok=True)
faces = []
# "font_swap": {"<look font file>": "<project-relative .woff2>"} gives a returning Look new fonts (no repeats).
swap = cfg.get("font_swap", {})
for f in look["fonts"]:
    src = P(swap[f["file"]]) if f["file"] in swap else os.path.join(look_dir, "fonts", f["file"])
    name = os.path.basename(src)
    shutil.copy(src, font_dir)
    faces.append(f"@font-face{{font-family:{f['family']};font-weight:{f['weight']};font-style:{f['style']};"
                 f"src:url(assets/fonts/{look_name}/{name}) format('woff2')}}")

# Captions: break on max words (per Look), punctuation, or a pause; hidden while the hook is on screen.
words = json.load(open(P(cfg["words"]), encoding="utf-8"))
words = words["words"] if isinstance(words, dict) else words
keys = {k.lower() for k in cfg.get("keys", [])}
bare = lambda t: re.sub(r"[^\w']", "", t).lower()
case = {"upper": str.upper, "lower": str.lower}.get(look["caption"]["case"], lambda s: s)
maxw = look["caption"]["maxWords"]
hook_end = cfg["hook"]["end"]
groups, cur = [], []
for w in words:
    if w["start"] < hook_end or w["start"] >= DUR:
        continue
    if cur and (len(cur) >= maxw or w["start"] - cur[-1]["end"] > 0.25 or re.search(r"[.,?!]$", cur[-1]["text"])
                or len(" ".join(x["text"] for x in cur + [w])) > look["caption"].get("maxChars", 28)):  # one line, no lone wrapped word
        groups.append(cur); cur = []
    cur.append(w)
if cur:
    groups.append(cur)
caps = []
for i, g in enumerate(groups):
    end = min(groups[i + 1][0]["start"] if i + 1 < len(groups) else DUR, g[-1]["end"] + 0.6, DUR)
    text = " ".join((f"<b>{html.escape(case(w['text'].rstrip('.,')))}</b>" if bare(w["text"]) in keys
                     else html.escape(case(w["text"].rstrip(",")))) for w in g)
    caps.append((g[0]["start"], end - g[0]["start"], text))

hook_lines = "".join(f'<div class="l l{i}">{html.escape(t)}</div>' for i, (t, _) in enumerate(cfg["hook"]["lines"]))
lst = cfg.get("list")
check = '<svg viewBox="0 0 60 60"><path class="draw" d="M8 32 C 14 36, 20 44, 24 49 C 32 34, 42 20, 54 9"/></svg>'
rows = "".join(f'<div class="row" id="r{i}"><div class="in"><span class="chk">{check}</span><span>{html.escape(t)}</span></div></div>'
               for i, (t, _) in enumerate(lst["items"])) if lst else ""
list_top = f' style="top:{lst["top"]}px"' if lst and "top" in lst else ""
cap_top = f' style="top:{cfg["captionTop"]}px"' if "captionTop" in cfg else ""  # captions below the chin when the face fills the top
hook_top = f' style="top:{cfg["hook"]["top"]}px"' if "top" in cfg["hook"] else ""  # below the chin when the face fills the top  # move below the chin when there's no headroom
notes = cfg.get("notes", [])  # [{"start","end","script","big","small","top"}]: one idea per card
note_html = "".join(
    f'<div id="n{i}" class="note clip" data-start="{n["start"]}" data-duration="{n["end"] - n["start"]:.3f}" data-track-index="{12 + i % 2}"'
    f' style="top:{n.get("top", cfg["face"][1] + 60)}px">'
    + "".join(f'<div class="{c}">{html.escape(n[k])}</div>' for k, c in (("script", "ns"), ("big", "nb"), ("small", "nm")) if n.get(k))
    + "</div>" for i, n in enumerate(notes))

js = lambda o: json.dumps(o)
tw = lambda sel, m, t: f"tl.fromTo('{sel}',{js(m['from'])},{js(dict(m['to'], duration=m['dur'], ease=m['ease']))},{t:.3f});"
T = []
# Hook: "stack" builds lines up; "sequence" shows one beat at a time.
seq = look["hook"]["mode"] == "sequence"
lines = cfg["hook"]["lines"]
for i, (_, t) in enumerate(lines):
    T.append(tw(f"#hook .l{i}", M["hook"], t))
    if seq and i + 1 < len(lines):
        T.append(f"tl.set('#hook .l{i}',{{opacity:0}},{lines[i + 1][1]:.3f});")
T.append(f"tl.to('#hook',{{opacity:0,duration:{M['hookOut']['dur']},ease:'{M['hookOut']['ease']}'}},{hook_end - M['hookOut']['dur']:.3f});")
T.append(f"tl.set('#hook',{{opacity:0}},{hook_end - 0.01:.3f});")
for i, (s, d, _) in enumerate(caps):
    T.append(tw(f"#c{i} .t", M["cap"], s))
if lst:
    T.append(tw("#list", M["card"], lst["start"]))
    for i, (_, t) in enumerate(lst["items"]):
        T.append(tw(f"#r{i}", M["item"], t))
        T.append(f"tl.to('#r{i} .draw',{{strokeDashoffset:0,duration:.3,ease:'power1.inOut'}},{t + 0.08:.3f});")
        if M["punch"]:
            T.append(f"tl.fromTo('#vw',{{scale:{M['punch']}}},{{scale:1,duration:.35,ease:'power3.out'}},{t:.3f});")
    T.append(f"tl.to('#list',{{opacity:0,duration:{M['hookOut']['dur']},ease:'{M['hookOut']['ease']}'}},{lst['end'] - M['hookOut']['dur'] - 0.02:.3f});")
    T.append(f"tl.set('#list',{{opacity:0}},{lst['end'] - 0.01:.3f});")
for i, n in enumerate(notes):
    T.append(tw(f"#n{i}", M["card"], n["start"]))
    T.append(f"tl.to('#n{i}',{{opacity:0,duration:{M['hookOut']['dur']},ease:'{M['hookOut']['ease']}'}},{n['end'] - M['hookOut']['dur'] - 0.02:.3f});")
    T.append(f"tl.set('#n{i}',{{opacity:0}},{n['end'] - 0.01:.3f});")
if M["push"] != 1:
    T.append(f"tl.fromTo('#vi',{{scale:1}},{{scale:{M['push']},duration:{DUR:.3f},ease:'none'}},0);")
T.append(f"tl.to({{}},{{duration:.01}},{DUR - 0.01:.3f});")

chin = cfg["face"][1]
page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1080, height=1920"><title>{look['label']}</title>
<script src="assets/gsap.min.js"></script>
<style>
{chr(10).join(faces)}
*{{box-sizing:border-box}}html,body{{margin:0;width:1080px;height:1920px;overflow:hidden;background:#000}}
#root{{position:relative;width:1080px;height:1920px;overflow:hidden;background:#000;--chin:{chin}}}
#vw,#vi{{position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:540px {sum(cfg['face']) // 2}px}}
video{{width:1080px;height:1920px;object-fit:cover;display:block}}
.draw{{fill:none;stroke-width:7;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:120;stroke-dashoffset:120}}
.row .in{{display:flex;align-items:center;gap:inherit}}
{css}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{DUR}" data-width="1080" data-height="1920">
<div id="vw" class="grade"><div id="vi"><video id="v" data-start="0" data-duration="{DUR}" data-track-index="1" src="{cfg['video']}" muted playsinline></video></div></div>
<div id="topbg" class="clip" data-start="0" data-duration="{DUR}" data-track-index="2"></div>
<div id="capbg" class="clip" data-start="{hook_end}" data-duration="{DUR - hook_end:.3f}" data-track-index="3"></div>
<div id="hook" class="clip" data-start="0" data-duration="{hook_end}" data-track-index="10"{hook_top}>{hook_lines}</div>
{f'<div id="list" class="clip" data-start="{lst["start"]}" data-duration="{lst["end"] - lst["start"]:.3f}" data-track-index="11"{list_top}><h3>{html.escape(lst["title"])}</h3>{rows}</div>' if lst else ''}
{note_html}
{chr(10).join(f'<div id="c{i}" class="cap clip" data-start="{s:.3f}" data-duration="{d:.3f}" data-track-index="90"{cap_top}><span class="t">{t}</span></div>' for i, (s, d, t) in enumerate(caps))}
<audio id="a" data-start="0" data-duration="{DUR}" data-track-index="99" data-volume="1" src="{cfg['audio']}"></audio>
</div>
<script>
const tl=gsap.timeline({{paused:true}});
{chr(10).join(T)}
window.__timelines=window.__timelines||{{}};window.__timelines['main']=tl;
</script></body></html>
"""
open(P("index.html"), "w", encoding="utf-8").write(page)

if record:
    hist_path = os.path.join(HERE, "history.json")
    hist = json.load(open(hist_path, encoding="utf-8")) if os.path.exists(hist_path) else []
    hist.append({"look": look_name, "slug": record, "date": datetime.date.today().isoformat()})
    json.dump(hist, open(hist_path, "w", encoding="utf-8"), indent=2)
print(f"{look['label']}: {len(caps)} captions, hook {len(lines)} lines, list {len(lst['items']) if lst else 0} items -> {P('index.html')}")
