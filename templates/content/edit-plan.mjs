// Content template: builds the frame-aligned EDL from content.json "sections" (source ranges chosen
// at real silence, in story order) minus "fillers" (uhm/uh and false starts). Internal pauses longer than
// MAX_PAUSE are tightened (style: tight), keeping PAD each side. Writes edl.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const here = (p) => new URL(p, import.meta.url);
const C = JSON.parse(readFileSync(here('./content.json'), 'utf8').replace(/^\uFEFF/, '')); // BOM-safe (Notepad)
// "maxPause" / "padIn" / "padOut" (user note 2026-11-24: "hindi pa tapos magsalita, nakakat na"): a speaker whose words trail
// off softly needs a longer tail kept after each word (padOut) and a little more before the next one (padIn)
const MAX_PAUSE = C.maxPause ?? 0.28, PAD_IN = C.padIn ?? 0.09, PAD_OUT = C.padOut ?? 0.09;
// "pauseTo": 0.3 evens every pause out (user note 2026-11-24 "ayusin mo yung mga pauses"): a longer pause becomes exactly
// that long, 60% of it kept after the word that ends (its soft tail) and 40% before the next one
let maxPause = MAX_PAUSE, padIn = PAD_IN, padOut = PAD_OUT;
if (C.pauseTo) { maxPause = C.pauseTo; padOut = C.pauseTo * 0.6; padIn = C.pauseTo * 0.4; }
const probe = (entries) => spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', entries, '-of', 'csv=p=0', 'raw.mp4'],
  { cwd: here('.'), encoding: 'utf8' }).stdout.trim();
const [num, den] = probe('stream=r_frame_rate').split('/').map(Number);
const FPS = Math.round((num / (den || 1)) * 1000) / 1000;

// mono 16 kHz PCM of the raw audio for silence detection
mkdirSync(here('../review'), { recursive: true });
if (!existsSync(here('../review/mono.pcm'))) {
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', 'raw.mp4', '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 's16le', '../review/mono.pcm'], { cwd: here('.') });
}
const pcm = readFileSync(here('../review/mono.pcm'));
const sr = 16000, hop = 0.02;
const db = (t) => {
  const i0 = Math.floor(t * sr), w = Math.floor(hop * sr);
  let s = 0;
  for (let i = i0; i < i0 + w && i < pcm.length / 2; i++) { const v = pcm.readInt16LE(i * 2) / 32768; s += v * v; }
  return 10 * Math.log10(s / w + 1e-12);
};
// silence threshold: from the room's noise floor (10th percentile), clamped to -50..-40 dB
const levels = [];
for (let t = 0; t < pcm.length / 2 / sr - hop; t += 0.1) levels.push(db(t));
const floor = levels.sort((a, b) => a - b)[Math.floor(levels.length * 0.1)];
const THRESH = C.silenceDb ?? Math.max(-50, Math.min(-40, floor + 30));

// split each section around the filler spans
const ranges = [];
for (const [label, a0, z0, note] of C.sections) {
  let a = a0;
  for (const [fs, fe] of (C.fillers ?? []).filter(([fs, fe]) => fe > a0 && fs < z0).sort((x, y) => x[0] - y[0])) {
    if (fs > a) ranges.push([label, a, fs, note]);
    a = Math.max(a, fe);
  }
  if (z0 > a) ranges.push([label, a, z0, note]);
}

const pieces = [];
for (const [label, a, z, note] of ranges) {
  let runStart = null, cur = a;
  const cuts = [];
  let end = z;
  for (let t = a; t < z; t += hop) {
    const quiet = db(t) < THRESH;
    if (quiet && runStart === null) runStart = t;
    if (!quiet && runStart !== null) {
      if (t - runStart > maxPause && runStart - a > 0.1) cuts.push([runStart + padOut, t - padIn]);
      // a pause at the very start of a range (right after a filler cut) is trimmed too
      else if (t - runStart > maxPause) cur = Math.max(cur, t - padIn);
      runStart = null;
    }
  }
  // and a pause at the very end of a range (right before a filler cut), which left a frozen beat before a
  // jump at the join (user note 2026-11-18)
  if (runStart !== null && z - runStart > maxPause && runStart - a > 0.1) end = runStart + padOut;
  for (const [s, e] of cuts) { pieces.push({ label, note, start: cur, end: s }); cur = e; }
  pieces.push({ label, note, start: cur, end });
}

const fr = (t) => Math.round(t * FPS);
const edl = pieces.map((p) => ({ ...p, srcFrameIn: fr(p.start), srcFrameOut: fr(p.end) })).filter((r) => r.srcFrameOut - r.srcFrameIn >= 3);
let acc = 0;
for (const r of edl) { const n = r.srcFrameOut - r.srcFrameIn; r.outStart = acc / FPS; r.outEnd = (acc + n) / FPS; acc += n; }
writeFileSync(here('./edl.json'), JSON.stringify({ fps: FPS, totalFrames: acc, duration: acc / FPS, pieces: edl }, null, 2));
console.log(`${edl.length} pieces, ${(acc / FPS).toFixed(2)} s at ${FPS} fps (silence below ${THRESH.toFixed(0)} dB, floor ${floor.toFixed(0)} dB)`);
