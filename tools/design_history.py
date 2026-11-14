"""Every video gets its own design: record what each edit used and refuse repeats from recent edits.

    python tools/design_history.py recent [N]              # what the last N edits used (default 5): avoid all of it
    python tools/design_history.py check <plan.json> [N]   # exit 1 and list every repeat from the last N edits
    python tools/design_history.py record <slug> <plan.json>
    python tools/design_history.py favorite <name> <plan.json>  # save a style the user loved as styles/<name>/
    python tools/design_history.py favorites                    # list saved favorite styles

A plan may name a favorite: {"favorite": "golden-hour-tour", ...}. Elements that favorite used are
allowed to repeat (the user asked to keep that style); everything else must still be new.

plan.json lists the design choices of one edit. Every field is a list of short names:
  {"look": ["warm"], "fonts": ["Fraunces", "DM Sans"], "captions": ["cream pill, low, word by word"],
   "hook": ["kinetic stacked words"], "effects": ["PU01", "CT01"], "transitions": ["whip pan"],
   "shots": ["exploded-view"], "animations": ["paper note drop"], "broll": ["kitchen-wide.mp4"],
   "graphics": ["price card"], "color": ["warm grade", "#C8643B"], "music": ["piano-soft.mp3"], "sfx": ["paper rustle"]}
History lives in looks/history.json (shared with looks/build_look.py, merged by slug).
"""
import datetime
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HIST = ROOT / "looks" / "history.json"
STYLES = ROOT / "styles"
FIELDS = ["look", "fonts", "captions", "hook", "effects", "transitions", "shots", "animations",
          "broll", "graphics", "color", "music", "sfx"]


def load():
    return json.loads(HIST.read_text(encoding="utf-8")) if HIST.exists() else []


def as_list(v):
    return [v] if isinstance(v, str) else list(v or [])


def recent(hist, n=5):
    used = {f: set() for f in FIELDS}
    for e in hist[-n:]:
        for f in FIELDS:
            used[f].update(x.strip().lower() for x in as_list(e.get(f)))
    return used


def favorite_plan(name):
    p = STYLES / name / "design-plan.json"
    if not p.exists():
        sys.exit(f"no favorite style named {name!r} in {STYLES}")
    return json.loads(p.read_text(encoding="utf-8"))


def repeats(plan, hist, n=5, fav=None):
    used = recent(hist, n)
    keep = {f: {x.strip().lower() for x in as_list((fav or {}).get(f))} for f in FIELDS}
    return {f: hits for f in FIELDS
            if (hits := [x for x in as_list(plan.get(f))
                         if x.strip().lower() in used[f] and x.strip().lower() not in keep[f]])}


def record(slug, plan):
    hist = load()
    entry = next((e for e in hist if e.get("slug") == slug), None)
    if entry is None:
        entry = {"slug": slug, "date": datetime.date.today().isoformat()}
        hist.append(entry)
    entry.update({f: as_list(plan[f]) for f in FIELDS if f in plan})
    HIST.write_text(json.dumps(hist, indent=2, ensure_ascii=False), encoding="utf-8")


def _selftest():
    hist = [{"slug": "a", "look": ["warm"], "fonts": ["Fraunces"], "effects": ["PU01"]}]
    assert repeats({"look": "Warm", "fonts": ["Inter"], "effects": ["CT01"]}, hist) == {"look": ["Warm"]}
    assert repeats({"look": ["luxury"]}, hist) == {}
    assert repeats({"fonts": ["Fraunces"]}, hist + [{}] * 5) == {}  # older than the window: allowed again
    fav = {"look": ["warm"], "fonts": ["Fraunces"]}  # a loved style may come back, the rest must be new
    assert repeats({"look": ["warm"], "fonts": ["Fraunces"], "effects": ["PU01"]}, hist, fav=fav) == {"effects": ["PU01"]}


if __name__ == "__main__":
    _selftest()
    cmd, args = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2:]
    if cmd == "recent":
        for f, xs in recent(load(), int(args[0]) if args else 5).items():
            if xs:
                print(f"{f}: {', '.join(sorted(xs))}")
    elif cmd == "check":
        plan = json.loads(pathlib.Path(args[0]).read_text(encoding="utf-8-sig"))
        fav = favorite_plan(plan["favorite"]) if plan.get("favorite") else None
        hits = repeats(plan, load(), int(args[1]) if len(args) > 1 else 5, fav)
        for f, xs in hits.items():
            print(f"REPEAT {f}: {', '.join(xs)}")
        print("unique: nothing repeats the recent edits" if not hits else "change these before the storyboard")
        sys.exit(1 if hits else 0)
    elif cmd == "record":
        record(args[0], json.loads(pathlib.Path(args[1]).read_text(encoding="utf-8-sig")))
        print(f"recorded {args[0]} in {HIST}")
    elif cmd == "favorite":
        dest = STYLES / args[0]
        dest.mkdir(parents=True, exist_ok=True)
        plan = json.loads(pathlib.Path(args[1]).read_text(encoding="utf-8-sig"))
        (dest / "design-plan.json").write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"saved favorite style {args[0]} -> {dest} (now write style.md and the reference sheet there)")
    elif cmd == "favorites":
        for d in sorted(p for p in STYLES.glob("*") if (p / "design-plan.json").exists()):
            first = next((l for l in (d / "style.md").read_text(encoding="utf-8").splitlines()
                          if l.strip() and not l.startswith("#")), "") if (d / "style.md").exists() else ""
            print(f"{d.name}: {first}")
    else:
        sys.exit(__doc__)
