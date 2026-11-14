"""Pull thumbnail candidates from a video: the sharpest frame in each part of it, plus a labelled sheet.

    python tools/thumb_frames.py <video> <out_dir> [count]

Writes <out_dir>/cand-NN-<seconds>s.png (full size) and <out_dir>/candidates.jpg (a numbered grid
with timestamps). Look at the sheet, pick the strongest expression or moment, then use that PNG.
Use the raw video (no captions burned in) so the thumbnail starts from a clean frame.
"""
import json
import pathlib
import re
import subprocess
import sys


def run(*args):
    return subprocess.run(args, capture_output=True, text=True, check=True)


def duration(video):
    out = run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", video).stdout
    return float(json.loads(out)["format"]["duration"])


def sharpness(png):
    # average edge strength: blurry or mid-motion frames score low
    err = run("ffmpeg", "-i", str(png), "-vf", "edgedetect,signalstats,metadata=print:key=lavfi.signalstats.YAVG",
              "-f", "null", "-").stderr
    m = re.search(r"YAVG=([\d.]+)", err)
    return float(m.group(1)) if m else 0.0


def candidates(video, out, count=12):
    out = pathlib.Path(out)
    out.mkdir(parents=True, exist_ok=True)
    dur, picks = duration(video), []
    for i in range(count):
        lo = 0.5 + i * (dur - 1) / count  # skip the first and last half second
        step = (dur - 1) / count / 4
        tries = []
        for k in (1, 2, 3):  # three tries per slot, keep the sharpest
            t, png = lo + step * k, out / f"try-{k}.png"
            run("ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", video, "-frames:v", "1", str(png))
            tries.append((sharpness(png), t, png.read_bytes()))
        _, t, data = max(tries, key=lambda x: x[0])
        final = out / f"cand-{i + 1:02d}-{t:.1f}s.png"
        final.write_bytes(data)
        picks.append(final)
    for leftover in out.glob("try-*.png"):
        leftover.unlink()

    cols = min(4, count)
    labels = ";".join(f"[{k}:v]scale=360:-2,drawtext=text='{k + 1}  {p.stem.split('-')[2]}':x=12:y=12:fontsize=28:"
                      f"fontcolor=white:box=1:boxcolor=black@0.6[v{k}]" for k, p in enumerate(picks))
    layout = "|".join(f"{(k % cols) * 360}_{'+'.join(['h0'] * (k // cols)) or 0}" for k in range(count))
    args = ["ffmpeg", "-v", "error", "-y"] + [a for p in picks for a in ("-i", str(p))]
    args += ["-filter_complex", f"{labels};{''.join(f'[v{k}]' for k in range(count))}"
             f"xstack=inputs={count}:layout={layout}:fill=black", "-frames:v", "1", str(out / "candidates.jpg")]
    run(*args)
    return picks


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 12
    found = candidates(sys.argv[1], sys.argv[2], n)
    assert len(found) == n and all(p.exists() for p in found) and (pathlib.Path(sys.argv[2]) / "candidates.jpg").exists()
    print(pathlib.Path(sys.argv[2]) / "candidates.jpg")
