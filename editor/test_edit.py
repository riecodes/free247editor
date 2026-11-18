"""Run: .venv\\Scripts\\python editor\\test_edit.py"""
from edit import caption_groups, keep_segments, to_output_time

W = lambda word, s, e: {"word": word, "start": s, "end": e}
words = [W("Hi", 0.5, 0.8), W("there.", 0.9, 1.2), W("Long", 4.0, 4.3), W("pause", 4.4, 4.8), W("cut", 4.9, 5.2), W("ok", 5.3, 5.5)]

segs = keep_segments(words, 10.0)
assert len(segs) == 2, segs                                     # the 2.8 s silence is cut
assert abs(segs[0][0] - 0.38) < 1e-9 and abs(segs[1][1] - 5.62) < 1e-9
assert abs(to_output_time(4.0, segs) - (segs[0][1] - segs[0][0] + 0.12)) < 1e-9

groups = caption_groups(words, segs)
assert [g["text"] for g in groups] == ["Hi there.", "Long pause cut", "ok"], groups
assert all(a["end"] <= b["start"] + 1e-9 for a, b in zip(groups, groups[1:]))  # no overlaps
print("ok")
