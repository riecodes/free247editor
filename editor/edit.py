"""Light editor for 8GB machines: Groq captions, ffmpeg cuts, Pillow graphics. No HyperFrames.

Usage (from the free247editor2 folder):
    .venv\\Scripts\\python editor\\edit.py                 # newest video in inbox/
    .venv\\Scripts\\python editor\\edit.py inbox\\EJ.mp4    # a specific video

Writes outbox/<name>-<date>-vN.mp4. Work files (audio, transcript, caption images) go to editor/work/<name>/.
Setup: py -m venv .venv && .venv\\Scripts\\pip install -r editor\\requirements.txt
Needs GROQ_API_KEY in .env (free at https://console.groq.com/keys).
"""
import datetime
import json
import os
import re
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
INBOX, OUTBOX, WORK = ROOT / "inbox", ROOT / "outbox", ROOT / "editor" / "work"
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".webm"}

PAD = 0.12          # seconds kept before/after each word
KEEP_GAP = 0.35     # pauses up to PAD*2 + this are kept; longer silences are cut
MAX_WORDS = 3       # words per caption
FONTS = [r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"]


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.exit(f"Command failed: {cmd[0]}\n{r.stderr[-2000:]}")
    return r.stdout


def probe(path):
    info = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]))
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    if not v or not any(s["codec_type"] == "audio" for s in info["streams"]):
        sys.exit(f"{path.name} needs both a video and an audio track.")
    w, h = v["width"], v["height"]
    rot = next((abs(int(d.get("rotation", 0))) for d in v.get("side_data_list", []) if "rotation" in d), 0)
    if rot == 90 or rot == 270:  # phone clips: ffmpeg rotates on decode
        w, h = h, w
    rate = v.get("avg_frame_rate", "0/0")
    fps = float(Fraction(rate if rate != "0/0" else v["r_frame_rate"]))
    fps = round(fps) if 10 <= fps <= 60 else 30
    return w, h, fps, float(info["format"]["duration"])


def groq_key():
    key = os.environ.get("GROQ_API_KEY", "")
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("GROQ_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit("No Groq key. Paste yours after GROQ_API_KEY= in .env (free at https://console.groq.com/keys).")
    return key


def transcribe(video, work):
    cache = work / "words.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    audio = work / "audio.mp3"
    # 16 kHz mono 48 kbps keeps about 65 minutes under Groq's 25 MB free upload limit
    run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", str(audio)])
    if audio.stat().st_size > 25 * 1024 * 1024:
        sys.exit("Audio is over Groq's 25 MB limit (clip longer than about 65 minutes). Trim it first.")
    from groq import Groq
    print("Transcribing with Groq...")
    with open(audio, "rb") as f:
        r = Groq(api_key=groq_key()).audio.transcriptions.create(
            file=(audio.name, f.read()), model="whisper-large-v3",
            response_format="verbose_json", timestamp_granularities=["word"])
    words = [{"word": w["word"].strip(), "start": float(w["start"]), "end": float(w["end"])}
             for w in (r.model_dump().get("words") or []) if w["word"].strip()]
    if not words:
        sys.exit("Groq heard no words in this clip.")
    cache.write_text(json.dumps(words, ensure_ascii=False, indent=1), encoding="utf-8")
    return words


def keep_segments(words, duration):
    """Spans of the source to keep: every word plus PAD, joined when the pause between them is short."""
    segs = []
    for w in words:
        s, e = max(0.0, w["start"] - PAD), min(duration, w["end"] + PAD)
        if segs and s <= segs[-1][1] + KEEP_GAP:
            segs[-1][1] = max(segs[-1][1], e)
        else:
            segs.append([s, e])
    return segs


def to_output_time(t, segs):
    """Where source time t lands after the cuts."""
    out = 0.0
    for s, e in segs:
        if t < s:
            return out
        if t <= e:
            return out + t - s
        out += e - s
    return out


def caption_groups(words, segs):
    groups, cur = [], []
    for w in words:
        w = {**w, "start": to_output_time(w["start"], segs), "end": to_output_time(w["end"], segs)}
        if cur and (len(cur) >= MAX_WORDS or w["start"] - cur[-1]["end"] > 0.4):
            groups.append(cur)
            cur = []
        cur.append(w)
        if re.search(r"[.?!,]$", w["word"]):
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    out = []
    for i, g in enumerate(groups):
        start, end = g[0]["start"], g[-1]["end"] + 0.15
        if i + 1 < len(groups):
            nxt = groups[i + 1][0]["start"]
            end = nxt if nxt - end <= 0.3 else end  # short gap: hold the caption until the next one
        if end - start >= 0.05:
            out.append({"text": " ".join(w["word"] for w in g), "start": start, "end": end})
    return out


def load_font(size):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default(size)


def draw_caption(text, w, band_h, size, path):
    img = Image.new("RGBA", (w, band_h), (0, 0, 0, 0))
    d, font = ImageDraw.Draw(img), load_font(size)
    stroke = max(2, size // 9)
    lines, line = [], ""
    for word in text.split():  # wrap to 88% of the frame width
        test = f"{line} {word}".strip()
        if line and d.textlength(test, font=font) > w * 0.88:
            lines.append(line)
            line = word
        else:
            line = test
    lines.append(line)
    line_h = int(size * 1.15)
    y = (band_h - line_h * len(lines)) // 2
    for ln in lines:
        x = (w - d.textlength(ln, font=font)) / 2
        d.text((x, y), ln, font=font, fill="white", stroke_width=stroke, stroke_fill="black")
        y += line_h
    img.save(path)


def build_caption_track(groups, w, h, work):
    """Pillow draws each caption once; ffmpeg's concat demuxer plays them as one light overlay stream."""
    size = int(min(w, h) * 0.085)
    band_h = int(size * 3.4)
    img_dir = work / "captions"
    img_dir.mkdir(exist_ok=True)
    for old in img_dir.glob("*.png"):
        old.unlink()
    blank = img_dir / "blank.png"
    Image.new("RGBA", (w, band_h), (0, 0, 0, 0)).save(blank)
    lines, t = [], 0.0

    def add(path, dur):
        lines.append(f"file '{path.as_posix()}'\nduration {dur:.3f}")

    for i, g in enumerate(groups):
        if g["start"] > t + 0.001:
            add(blank, g["start"] - t)
        png = img_dir / f"{i:04d}.png"
        draw_caption(g["text"], w, band_h, size, png)
        add(png, g["end"] - g["start"])
        t = g["end"]
    add(blank, 1.0)
    lines.append(f"file '{blank.as_posix()}'")  # concat demuxer quirk: repeat the last file
    listing = work / "captions.txt"
    listing.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return listing, int(h * 0.72 - band_h / 2)


def next_output(slug):
    stem = f"{slug}-{datetime.date.today():%Y-%m-%d}"
    n = 1
    while (OUTBOX / f"{stem}-v{n}.mp4").exists():
        n += 1
    return OUTBOX / f"{stem}-v{n}.mp4"


def render(video, segs, captions, cap_y, fps, out, work):
    keep = "+".join(f"between(t,{s:.3f},{e:.3f})" for s, e in segs)
    graph = (f"[0:v]fps={fps},select='{keep}',setpts=N/{fps}/TB[v];"
             f"[0:a]aselect='{keep}',asetpts=N/SR/TB[a];"
             f"[1:v]format=rgba[c];[v][c]overlay=0:{cap_y}:eof_action=pass,format=yuv420p[out]")
    script = work / "filter.txt"
    script.write_text(graph, encoding="utf-8")
    print(f"Rendering {out.name}...")
    # veryfast + 4 threads keeps memory low on an 8GB machine
    run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-f", "concat", "-safe", "0", "-i", str(captions),
         "-/filter_complex", str(script), "-map", "[out]", "-map", "[a]",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", "4",
         "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)])


def main():
    if len(sys.argv) > 1:
        video = Path(sys.argv[1]).resolve()
    else:
        vids = [p for p in INBOX.iterdir() if p.suffix.lower() in VIDEO_EXT]
        if not vids:
            sys.exit("inbox/ is empty. Drop a video in it first.")
        video = max(vids, key=lambda p: p.stat().st_mtime)
    if not video.exists():
        sys.exit(f"Not found: {video}")
    slug = re.sub(r"[^a-z0-9]+", "-", video.stem.lower()).strip("-") or "video"
    work = WORK / slug
    work.mkdir(parents=True, exist_ok=True)

    w, h, fps, duration = probe(video)
    words = transcribe(video, work)
    segs = keep_segments(words, duration)
    groups = caption_groups(words, segs)
    listing, cap_y = build_caption_track(groups, w, h, work)
    out = next_output(slug)
    render(video, segs, listing, cap_y, fps, out, work)
    kept = sum(e - s for s, e in segs)
    print(f"Done: {out.relative_to(ROOT)}  ({duration:.1f}s -> {kept:.1f}s, {len(groups)} captions)")


if __name__ == "__main__":
    main()
