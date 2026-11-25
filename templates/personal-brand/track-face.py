# Personal-brand template: fixed framing (no face tracking: "alisin mo na ang pag track sa center ng video",
# 2026-10-22). Finds where the speaker usually is (median face position over the kept pieces) only to:
#   portrait from landscape footage: place ONE fixed full-height 9:16 crop around the speaker (never moves)
#   landscape: keep the full frame as shot (no crop)
#   both: set the emphasis-zoom origin on the speaker's face (build-comp.mjs reads crop-geom.json)
# Writes crop-geom.json for render-cut.mjs and build-comp.mjs.
#   python -E -P track-face.py   (run from assets/; needs opencv-python-headless<5)
import json
import cv2
import numpy as np

STRIDE = 5  # a face sample every 5 frames, so short pieces get their own median position
even = lambda v: int(v) // 2 * 2

cfg = json.load(open('brand.json', encoding='utf-8-sig'))  # BOM-safe (Notepad)
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
label_of, piece_of = {}, {}
for i, p in enumerate(pieces):
    for fr in range(p['srcFrameIn'], p['srcFrameOut'], STRIDE):
        label_of[fr] = p['label']; piece_of[fr] = i
by_piece, samples = {}, []
xs, ys, f = [], [], 0
by_label = {}  # face x per story section: a speaker who moved between answers gets one fixed crop per section
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
            by_label.setdefault(label_of[f], []).append((x + w / 2) * scale)
            by_piece.setdefault(piece_of[f], []).append((x + w / 2) * scale)
            samples.append((f, (x + w / 2) * scale))
    elif not cap.grab():
        break
    f += 1
cap.release()
face_x = float(np.median(xs)) if xs else SRC_W / 2
face_y = float(np.median(ys)) if ys else SRC_H * 0.3

# "cropZoom": 1.3 (with "faceAt": 0.34, the face's height in the frame) punches in on footage shot wide in the output's
# own shape, e.g. a phone propped far away (user note 2026-11-24: like the posted version of the same video)
zoom = float(cfg.get('cropZoom') or 1)
cropped = (portrait_out and SRC_W > SRC_H) or zoom > 1
if cropped:
    if portrait_out and SRC_W > SRC_H:
        w, h = even(SRC_H * 9 / 16 / zoom), even(SRC_H / zoom)
    else:
        w, h = even(SRC_W / zoom), even(SRC_H / zoom)
    x = int(np.clip(round(face_x - w / 2), 0, SRC_W - w))
    y = int(np.clip(round(face_y - float(cfg.get('faceAt', 0.36)) * h), 0, SRC_H - h)) if h < SRC_H else 0
    geom = {'w': w, 'h': h, 'x': x, 'y': y}
    # user note 2026-11-23 ("nawala sa alignment ang tao ... pakiayos para sa pag-center"): each section gets its own
    # fixed crop centered on where the speaker stands in it (still no tracking: the crop never moves inside a section)
    # "steady": true keeps ONE fixed crop for the whole video (user note 2026-11-24: per-piece crops jumped at every cut and
    # the smooth follow drifted; "nakakahilo, gawin mong steady"). Use it when the speaker sits still.
    if cfg.get('centerPerSection', True) and not cfg.get('steady'):
        geom['sectionX'] = {lab: int(np.clip(round(float(np.median(v)) - w / 2), 0, SRC_W - w)) for lab, v in by_label.items() if len(v) >= 2}
        # user note 2026-11-23 #3 ("hindi parin maganda ang pagkakacenter"): she drifts inside a long answer, so every
        # cut piece gets its own fixed crop (falls back to its section's when a piece has too few face samples)
        # "reframe": "smooth" (user note 2026-11-23 #3): a slow, heavily smoothed follow inside each piece
        # (1.6 s moving median of the face position, so a stray detection is ignored), for a speaker who drifts a lot; render-cut turns it into a crop x(t)
        if cfg.get('reframe') == 'smooth':
            fps = edl['fps']; track = []
            for i, p in enumerate(pieces):
                pts = sorted((fr, fx) for fr, fx in samples if p['srcFrameIn'] <= fr < p['srcFrameOut'])
                if len(pts) < 2:
                    track.append(None); continue
                win = 0.8 * fps
                keys = []
                for fr in range(p['srcFrameIn'], p['srcFrameOut'] + 1, 6):
                    near = [fx for f2, fx in pts if abs(f2 - fr) <= win] or [min(pts, key=lambda q: abs(q[0] - fr))[1]]
                    keys.append([round((fr - p['srcFrameIn']) / fps, 3), int(np.clip(round(float(np.median(near)) - w / 2), 0, SRC_W - w))])
                track.append(keys)
            # "centerNudge": [{"from": s, "to": s, "x": px}] (source seconds): moves the crop where the face detector is off,
            # e.g. a head turned 3/4 puts the face box beside the body (user note 2026-11-23 "10 hanggang 12 seconds ... hindi nakacenter")
            for nd in cfg.get('centerNudge', []):
                for i, p in enumerate(pieces):
                    for kk in (track[i] or []):
                        t_src = p['srcFrameIn'] / fps + kk[0]
                        if nd['from'] <= t_src <= nd['to']:
                            kk[1] = int(np.clip(kk[1] + nd['x'], 0, SRC_W - w))
            geom['pieceTrack'] = track
        geom['pieceX'] = [int(np.clip(round(float(np.median(by_piece[i])) - w / 2), 0, SRC_W - w)) if len(by_piece.get(i, [])) >= 2
                          else geom['sectionX'].get(p['label'], x) for i, p in enumerate(pieces)]
else:  # footage already in the output's shape and no cropZoom: the whole frame as shot
    geom = {'w': SRC_W, 'h': SRC_H, 'x': 0, 'y': 0}
# face position inside the output frame, 0..1, for the emphasis-zoom origin
geom.update({'srcW': SRC_W, 'srcH': SRC_H, 'follow': False,
             'faceX': round((face_x - geom['x']) / geom['w'], 3), 'faceY': round((face_y - geom['y']) / geom['h'], 3)})
json.dump(geom, open('crop-geom.json', 'w'))
print(f"{'portrait' if portrait_out else 'landscape'}: fixed {geom['w']}x{geom['h']} at x={geom['x']} on {SRC_W}x{SRC_H} "
      f"(face found in {len(xs)} samples, at {geom['faceX']:.2f}, {geom['faceY']:.2f} of the frame)"
      + (f"; per section x: {geom['sectionX']}" if geom.get('sectionX') else ''))
