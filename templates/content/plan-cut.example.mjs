// Content template: the plan for one content video (tips, explainer, "3 simple steps", ad with one CTA).
// Copy to <P>/assets/plan-cut.mjs, fill in the parts marked FILL, run `node plan-cut.mjs` (writes content.json,
// the config this template's scripts read). Built from the approved content edits (2026-11-18/19) and the
// motion style in my-style-refs (2026-11-23). See templates/content/README.md.
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
    const isTag = x === 'okay' || x === 'alright' || (x === 'right' && n !== 'now' && p !== 'all') || pair;
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

// whiteboard talks are quiet: set silenceDb about 15 dB under the soft words (earlier quiet rooms: -58 / -60), never the
// automatic threshold, which once cut quiet words. "reframe": "smooth" keeps a moving speaker centered.
const silenceDb = -40; // FILL: about 13 dB over the room floor and under the soft words (quiet rooms have needed -58 / -60;
// a value under the floor finds no pauses and the cut comes out empty)
const reframe = 'smooth', centerNudge = [];

// ---------- step 2: captions ----------
// money and numbers the way they are written on screen: RM/â‚±/$ amounts with commas, "70%" (check every number)
const wordFixes = [
  // FILL: { seq: ['ten', 'thousand'], text: 'RM10,000' }, { seq: ['seventy', 'percent'], text: '70%' },
];
const capTop = 1380, capKeywords = [];
const safe = { x: 203, y: 278, w: 712, h: 1179 }; // social apps' safe zone (my-style-refs/social-safe-zone-portrait.png)
const keepColor = false; // true when the user sends an already graded clip

// ---------- step 3: motion graphics (my-style-refs + the approved motion reel; see the template README) ----------
const look = 'premium';
const hook = null; // the hook is kinetic text (first emphasis cards), not the old hook card
const name = null; // FILL { name, role, at, duration: 2.8, hideCaptions: true } when the speaker introduces himself
const pills = [
  // one CTA pill only, e.g. { text: 'REGISTER FOR THE WORKSHOP', at: { word: 'register', after: 138 }, duration: 2.9 },
];
const emphasis = [
  // hook: 2-3 kinetic cards on the opening line, the payoff as a full red scene, e.g.
  // { type: 'kinetic', from: 0, lines: ["*So, that's why in these*", '[3 SIMPLE=three]', 'STEPS'] },
  // { type: 'kinetic', from: { word: 'you', after: 2 }, start: 2.9, lines: ['*you can get to know*', 'HOW MUCH', '[LOAN]'], full: true, sfx: 'deepwhoosh' },
  // each step / key idea: a kinetic card (STEP words as the hero, the key word boxed); the strongest lines as long
  // full scenes (back-to-back full scenes of one color keep the background; use theme: 'light' for contrast)
];
// numbers get a data panel: the footage zooms out into a framed card and a panel drops in above (bars count up,
// stat rows slide in as they are said)
const splits = [
  // { from: anchor, to: anchor, tag: 'STEP 1', title: 'Net income x 70%', chart: { type: 'stats', items: [
  //   { label: 'NET INCOME', display: 'RM10,000', at: { word: 'rm10000' } }, { label: 'x 70% DSR', display: 'RM7,000', gold: true, at: { word: '70' } } ] } },
];
const zooms = []; // a push-in (1.10) on a key line or two that no card covers
const outro = null; // { logo: 'rtc-logo.png', seconds: 3.2 } for RTC content; client content has no logo end screen

// ---------- step 4: sound ----------
// content: a chill, upbeat bed (lo-fi / jazzy, never sad), heard from the start, about 20 dB under the voice
const music = 'Epedemic Music/ES_Dawn - Cushy.mp3', musicEven = true, bedGain = -3.5, sfxTrim = 5;
const sounds = {
  deepwhoosh: 'Overused SFX by Creators/Deep Whoosh 1.wav',
  hit: 'Overused SFX by Creators/Hit 1.mp3',
  impact: 'Overused SFX by Creators/Impact.wav',
  subdrop: 'Overused SFX by Creators/Sub Drop.mp3',
  confirm: 'Overused SFX by Creators/UI Confirm.wav',
  money: 'Sound Pack 1/money-soundfx.mp3',
  chaching: 'Overused SFX by Creators/Cash Register Cha-Ching  Sound Effect - 128.mp3',
  glitch: 'Overused SFX by Creators/Glitch 1.mp3',
  click: 'Overused SFX by Creators/Mouse Click 1.wav',
  riser: 'Risers/riser3.mp3',
  flare: 'Sound Pack 1/lens flare.mp3',
};
const extraSfx = [
  { at: 0, k: 'subdrop', gain: -21 }, // the video opens on the hook
  // { at: { word: 'register' }, k: 'riser', pre: 2.84, len: 2.84, gain: -26 }, // builds into the CTA
];

writeFileSync('content.json', JSON.stringify({ format: 'portrait', title: 'FILL - content', noisyRoom: false, reframe, centerNudge,
  silenceDb, sections, fillers, wordFixes, capTop, capKeywords, safe, keepColor, look, hook, name, pills, emphasis, splits, zooms, outro,
  music, musicEven, bedGain, sfxTrim, sounds, extraSfx }, null, 2));
console.log(JSON.stringify(sections.map((s) => s.slice(0, 3))), `${fillers.length} cuts`);
