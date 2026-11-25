// Personal-brand template: the plan for one video of a creator's personal brand (TikTok / Reels: the speaker sits at a
// desk and talks to camera: one mindset or money lesson, a quotable flip, two everyday examples, a sign-off line). The
// style was rebuilt from one creator's best-performing video and the notes on its remake (2026-11-24/25).
// Copy to <P>/assets/plan-cut.mjs, fill in the parts marked FILL, run `node plan-cut.mjs` (writes brand.json, the
// config this template's scripts read). See templates/personal-brand/README.md.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// ---------- energy curve: every edge snaps to the quietest 20 ms within +-0.18 s, so cuts land between words ----------
if (!existsSync('../review/mono.pcm')) {
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', 'raw.mp4', '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 's16le', '../review/mono.pcm']);
}
const pcm = readFileSync('../review/mono.pcm'), sr = 16000, N = pcm.length / 2;
const db = (t) => {
  const i0 = Math.max(0, Math.floor(t * sr)), w = Math.floor(0.02 * sr);
  let s = 0, n = 0;
  for (let i = i0; i < i0 + w && i < N; i++) { const v = pcm.readInt16LE(i * 2) / 32768; s += v * v; n++; }
  return 10 * Math.log10(s / Math.max(n, 1) + 1e-12);
};
const snap = (t) => {
  let best = t, bv = Infinity;
  for (let x = Math.max(0, t - 0.18); x <= t + 0.18; x += 0.01) { const v = db(x); if (v < bv) { bv = v; best = x; } }
  return Math.max(0, Math.round((best + 0.01) * 100) / 100);
};

// ---------- step 1: cut + story ----------
// A content video is usually one long take. Story: the hook first (the strongest or recap line, moved to the open and
// removed from its old place), then the talk in order, ending on ONE call to action. Keep it short: under 3 min,
// shorter is better (client note, 2026-11-19). [label, start, end, note, exact?] in play order (raw.mp4 seconds).
// The speaker does several takes in one clip: keep the last clean take of each line, in the script's order.
const sections = [
  // FILL: e.g. ['hook', 165.14, 169.06, 'Hook: "So that\'s why in these three simple steps ..."'],
  //            ['talk', 0.0, 165.14, 'the 3 steps'], ['talk', 169.06, 293.95, 'example + workshop CTA'],
].map(([l, a, z, n, exact]) => (exact ? [l, a, z, n] : [l, snap(a), snap(z), n]));

// repeats, false starts, held uh/um, asides to the room, a second CTA: [start, end, note, exact?]
const fillers = [
  // FILL: e.g. [17.85, 26.15, 'repeats while writing: "take your net income, net income"'],
].map(([a, z, n, exact]) => (exact ? [a, z, n] : [snap(a), snap(z), n]));

// verbal tags ("okay", "right", "alright", "all right") are cut automatically when the energy curve has a clear dip on
// both sides (client note "alisin ang okay / right"); set cutTags = false for a speaker who uses them on purpose
const cutTags = true;
if (cutTags && existsSync('raw-fillers.json')) {
  const raw = JSON.parse(readFileSync('raw-fillers.json', 'utf8')).words;
  const bw = (w) => (w ? w.text.toLowerCase().replace(/[^a-z']/g, '') : '');
  const inCut = (t) => fillers.some(([a, z]) => t >= a - 0.05 && t <= z + 0.05);
  const kept = (t) => !sections.length || sections.some(([, a, z]) => t >= a && t <= z);
  const argmin = (a, z) => { let best = a, bv = Infinity; for (let t = a; t <= z; t += 0.01) { const v = db(t); if (v < bv) { bv = v; best = t; } } return [best, bv]; };
  raw.forEach((w, i) => {
    const x = bw(w), n = bw(raw[i + 1]), p = bw(raw[i - 1]);
    const pair = x === 'all' && n === 'right';
    // "right" is a tag only when it closes a phrase ("..., right?"), never inside one ("asking the right questions" was cut once)
    const closes = /[,?.!]$/.test(w.text.trim());
    const isTag = x === 'okay' || x === 'alright' || (x === 'right' && closes && n !== 'now' && p !== 'all') || pair;
    if (!isTag || inCut(w.start) || !kept(w.start)) return;
    const last = pair ? raw[i + 1] : w, next = raw[i + (pair ? 2 : 1)], prev = raw[i - 1];
    const [a, da] = argmin(Math.max(prev ? prev.end - 0.03 : 0, w.start - 0.3), w.start + 0.06);
    const hi = Math.min(next ? next.start + 0.03 : last.end + 0.3, w.start + 0.9);
    const [z, dz] = argmin(Math.min(last.end - 0.1, hi - 0.05), hi);
    let peak = -Infinity;
    for (let t = a; t <= z; t += 0.01) peak = Math.max(peak, db(t));
    if (z - a < 0.15 || z - a > 0.95 || peak - Math.max(da, dz) < 5) return; // no clean dip: leave it in
    fillers.push([Math.round(a * 100) / 100, Math.round((z + 0.01) * 100) / 100, `tag "${w.text}"`]);
  });
}

// ---------- the room and the voice (approved on the remake, 2026-11-24) ----------
const silenceDb = -48;       // that room's floor was about -57 dB and the word endings trailed down to about -45 (-42 clipped them)
const steady = true;         // one fixed frame for the whole video (per-cut crops and following were "nakakahilo")
const reframe = null, centerNudge = [];
const cropZoom = 1.3, faceAt = 0.45; // the phone was propped wide: punch in so the wall sign shows on top and the speaker is centered
const pauseTo = 0.3, padIn = 0.12, padOut = 0.24, joinFade = 0.03; // even 0.3 s pauses, the soft tail of each word kept
const cleanVoice = 'medium';  // more denoise and a soft gate for room tone and breaths

// ---------- step 2: the brand captions ----------
// white Poppins Bold, 2-3 words, on the upper chest, a rounded gold highlight behind each word while it is said,
// punctuation kept ("I can't.", "how can I?"); they step aside under every pop-out text and scene
const wordFixes = [
  // FILL: misheard Taglish words, e.g. { seq: ['matuloy'], text: 'matuto?' }
];
const capStyle = 'karaoke', capPunct = true, capTop = 1240, capKeywords = [];
const safe = { x: 203, y: 278, w: 712, h: 1179 };
const keepColor = false;

// ---------- step 3: the brand graphics ----------
// brand: gold (the caption highlight) for highlight boxes and gold words; no logo end screen
const brand = { color: '#d2ae63', gold: '#d2ae63', light: '#f1ddb0' };
const look = 'premium', hook = null, name = null, pills = [], splits = [], zooms = [], outro = null;
const emphTop = 1185;
const T = 350; // pop-out text sits between the wall sign and the head
const emphasis = [
  // FILL. The vocabulary (see the README), e.g.:
  // 1) the hook: two blocks that stay up together, captions hidden
  // { type: 'overlay', top: T, align: 'left', until: 5.6, hideCaps: true, sfx: false, lines: [
  //   { text: 'Stop saying', at: 0, style: 'small' }, { text: "I can't", at: { word: "can't" }, style: 'gold' }] },
  // { type: 'overlay', top: 1150, align: 'right', until: 5.6, hideCaps: true, lines: [
  //   { text: 'And start asking', at: { word: 'and' }, style: 'small' }, { text: 'How can I?', at: { word: 'how' }, style: 'gold' }] },
  // 2) small / BIG / small stacks above the head on the key phrases (one every 10-20 s), captions hidden
  // { type: 'overlay', top: T, hideCaps: true, until: 52.65, lines: [
  //   { text: 'no', at: { word: 'no' }, style: 'small' }, { text: 'money', at: { word: 'money' }, style: 'big' }, { text: 'to start', at: { word: 'start' }, style: 'goldSmall' }] },
  // 3) motion-graphic B-roll: full scenes in the two looks, words landing as she says them, an icon on the idea
  //    "paper": warm cream, swoosh arc, halftone dots, turning asterisk, gold highlight box (ideas, answers, examples)
  //    "grid": charcoal with a fine grid that pans, a soft light gliding over it lighting the lines gold, lines sweeping
  //    in from the center (the problem, the hard truth). From the user's reference picture (note 2026-11-25)
  // { type: 'kinetic', from: { word: 'your' }, lines: ['*Your brain*', 'STOPS', '[THINKING.=thinking]'], full: true, theme: 'grid', sfx: 'deepwhoosh', boxSfx: 'hit' },
  // { type: 'kinetic', from: { word: 'but' }, lines: ['*But the moment*', '*you ask,*', '[HOW CAN I?=how]'], full: true, theme: 'paper', art: { type: 'icon', name: 'bulb' }, sfx: 'whoosh2', boxSfx: 'confirm' },
  //    icons: house, key, money, chart, growth, calendar, target, bulb, people, check, phone, book
  //    back-to-back scenes of one look keep the background; start a scene's first line on a spoken word
  // 4) the sign-off
  // { type: 'overlay', top: T, hideCaps: true, hold: 1.0, lines: [
  //   { text: 'See you', at: { word: 'see' }, style: 'small' }, { text: 'tomorrow!', at: { word: 'tomorrow' }, style: 'gold' }] },
];
const broll = []; // clips are optional; the look is motion-graphic B-roll (scenes above)

// ---------- step 4: sound ----------
// no music bed (user note 2026-11-25 "tanggalin mo na yung background music ... puro sound effects kada litaw ng mga text"):
// textSfx puts a soft pluck on every new line, a deep hit on big words, a fast whoosh as a scene leaves
const music = false, musicEven = true, bedGain = -5, sfxTrim = 4, textSfx = true;
const sounds = {
  deepwhoosh: 'Overused SFX by Creators/Deep Whoosh 1.wav',
  hit: 'Overused SFX by Creators/Hit 1.mp3',
  impact: 'Overused SFX by Creators/Impact.wav',
  confirm: 'Overused SFX by Creators/UI Confirm.wav',
  click: 'Overused SFX by Creators/Mouse Click 1.wav',
};
const extraSfx = []; // no sub drop on the intro (user note 2026-11-25: "pangit siya")

writeFileSync('brand.json', JSON.stringify({ format: 'portrait', title: 'FILL - personal brand', noisyRoom: false, steady, reframe, centerNudge,
  cropZoom, faceAt, pauseTo, padIn, padOut, joinFade, cleanVoice, silenceDb, sections, fillers, broll, wordFixes, capStyle, capPunct,
  capTop, capKeywords, safe, keepColor, look, brand, emphTop, hook, name, pills, emphasis, splits, zooms, outro, music, musicEven, textSfx,
  bedGain, sfxTrim, sounds, extraSfx }, null, 2));
console.log(JSON.stringify(sections.map((s) => s.slice(0, 3))), `${fillers.length} cuts`);
