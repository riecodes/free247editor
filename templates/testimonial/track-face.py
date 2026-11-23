# Testimonial template: fixed framing (no face tracking: "alisin mo na ang pag track sa center ng video",
# 2026-10-22). Finds where the speaker usually is (median face position over the kept pieces) only to:
#   portrait from landscape footage: place ONE fixed full-height 9:16 crop around the speaker (never moves)
#   landscape: keep the full frame as shot (no crop)
#   both: set the emphasis-zoom origin on the speaker's face (build-comp.mjs reads crop-geom.json)
# Writes crop-geom.json for render-cut.mjs and build-comp.mjs.
#   python -E -P track-face.py   (run from assets/; needs opencv-python-headless<5)
import json
import cv2
import numpy as np

STRIDE = 15  # a face sample every 15 frames is plenty for one median position
even = lambda v: int(v) // 2 * 2

cfg = json.load(open('testimonial.json', encoding='utf-8-sig'))  # BOM-safe (Notepad)
portrait_out = cfg.get('format') == 'portrait'
edl = json.load(open('edl.json'))
pieces = edl['pieces']

cap = cv2.VideoCapture('raw.mp4')
SRC_W, SRC_H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
needed = set()
for p in pieces:
    needed.update(range(p['srcFrameIn'], p['srcFrameOut'], STRIDE))
cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
scale = SRC_W / 960
min_face = SRC_W * 0.047  # the speaker's face is larger than faces on posters behind them
xs, ys, f = [], [], 0
while f <= max(needed):
    if f in needed:
        ok, img = cap.read()
        if not ok: break
        small = cv2.resize(img, (960, round(SRC_H / scale)))
        gray = cv2.equalizeHist(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
        faces = [(w, x, y, h) for (x, y, w, h) in cascade.detectMultiScale(gray, 1.1, 5, minSize=(40, 40)) if w * scale >= min_face]
        if faces:
            w, x, y, h = max(faces)
            xs.append((x + w / 2) * scale); ys.append((y + h / 2) * scale)
    elif not cap.grab():
        break
    f += 1
cap.release()
face_x = float(np.median(xs)) if xs else SRC_W / 2
face_y = float(np.median(ys)) if ys else SRC_H * 0.3

if portrait_out and SRC_W > SRC_H:
    w, h = even(SRC_H * 9 / 16), SRC_H
    x = int(np.clip(round(face_x - w / 2), 0, SRC_W - w))
    geom = {'w': w, 'h': h, 'x': x, 'y': 0}
else:  # landscape (or portrait footage): the whole frame as shot
    geom = {'w': SRC_W, 'h': SRC_H, 'x': 0, 'y': 0}
# face position inside the output frame, 0..1, for the emphasis-zoom origin
geom.update({'srcW': SRC_W, 'srcH': SRC_H, 'follow': False,
             'faceX': round((face_x - geom['x']) / geom['w'], 3), 'faceY': round((face_y - geom['y']) / geom['h'], 3)})
json.dump(geom, open('crop-geom.json', 'w'))
print(f"{'portrait' if portrait_out else 'landscape'}: fixed {geom['w']}x{geom['h']} at x={geom['x']} on {SRC_W}x{SRC_H} "
      f"(face found in {len(xs)} samples, at {geom['faceX']:.2f}, {geom['faceY']:.2f} of the frame)")
