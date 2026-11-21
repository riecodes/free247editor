"""Bring one ai-impact-editor effect into a free247 (kit) project, ready to mount.

    python tools/use_aifx.py <project_dir> <CODE> [use_id]

Example: python tools/use_aifx.py kit/video-projects/my-reel PU01 sec2
  -> fx/sec2.html (composition id "sec2"), fx/aifx-host.js, fx/aifx-ui.js, assets/fonts/*.woff2

Mount it with data-composition-id="<use_id>" data-composition-src="fx/<use_id>.html" and pass
data-variable-values in single quotes (the JSON inside uses double quotes). Params: the effect's README.md.
Fixes from the trial edits:
  - the kit inlines external scripts, so a literal </script> in the shared helpers ends the tag early
    and every frame renders black; it is escaped here.
  - composition ids must be unique, so each use of an effect gets its own copy under its own id.
The ai-impact-editor originals are only read, never changed.
"""
import pathlib
import shutil
import sys

AIFX = pathlib.Path(r"D:\ClaudeSkills\claude\ai-impact-editor\effects\custom")


def use(project, code, use_id=None):
    project, code = pathlib.Path(project), code.upper()
    found = sorted(AIFX.glob(f"{code}-*/template.html"))
    if not found:
        sys.exit(f"no ai-impact effect {code} in {AIFX}")
    base = code.lower()
    use_id = (use_id or base).lower()
    fx, fonts = project / "fx", project / "assets" / "fonts"
    fx.mkdir(parents=True, exist_ok=True)
    fonts.mkdir(parents=True, exist_ok=True)

    src = found[0].read_text(encoding="utf-8")
    (fx / f"{use_id}.html").write_text(src.replace(f'"{base}"', f'"{use_id}"'), encoding="utf-8")

    for helper in ("aifx-host.js", "aifx-ui.js"):
        text = (AIFX / "_shared" / helper).read_text(encoding="utf-8")
        (fx / helper).write_text(text.replace("</script>", "<\\/script>"), encoding="utf-8")
    for font in (AIFX / "_shared" / "fonts").glob("*.woff2"):
        if not (fonts / font.name).exists():
            shutil.copy2(font, fonts / font.name)
    return fx / f"{use_id}.html"


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    out = use(*sys.argv[1:4])
    assert "</script>" not in (out.parent / "aifx-host.js").read_text(encoding="utf-8"), "helper not escaped"
    print(out)
