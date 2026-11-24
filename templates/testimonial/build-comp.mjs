// Testimonial template: builds index.html (landscape 1920x1080 or portrait 1080x1920) from cut.json word
// timing + edl.json + testimonial.json, then applies any timeline-edits.json (left over from the removed
// timeline editor; absent normally) and writes:
//   index.html          the HyperFrames composition (output time)
//   sfx-cues.json       SFX cues for mix-audio.mjs (output time)
//   timeline-data.json  captions/cards/sfx in base time (a record of the edit; no longer read by any tool)
//   render-inputs.json  which video/voice files and duration the render uses
// Base time = the full cut (cut.mp4, all EDL pieces). Removed pieces are cut out of a copy
// (cut-edit.mp4 / voice-edit.wav) and every later item shifts left with them.
// Style (my-style.md): Poppins Bold 42px white captions with drop shadow (3 words/line portrait, 6 landscape),
// red #aa0000 hook/pills/cards, zoom only on emphasis, RTC logo end screen.
//   node build-comp.mjs [--data-only]   (--data-only: only refresh timeline-data.json, no render files)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const here = (p) => new URL(p, import.meta.url);
const DATA_ONLY = process.argv.includes('--data-only');
// step-by-step review (my-rules): --stage=subs (step 2: subtitles only), --stage=graphics (step 3: + hook,
// cards, zooms, end screen), default full (steps 4-5: + SFX cues for the mix)
const STAGE = (process.argv.find((a) => a.startsWith('--stage=')) ?? '--stage=full').slice(8);
const C = JSON.parse(readFileSync(here('./testimonial.json'), 'utf8').replace(/^\uFEFF/, '')); // BOM-safe (Notepad)
const rawWords = JSON.parse(readFileSync(here('./cut.json'))).words;
const edl = JSON.parse(readFileSync(here('./edl.json')));
const FPS = edl.fps, BASE = +(edl.totalFrames / FPS).toFixed(3);
const PORTRAIT = C.format === 'portrait';
const [WW, HH] = PORTRAIT ? [1080, 1920] : [1920, 1080];
const RED = '#aa0000'; // brand color (my-style.md)
const E = existsSync(here('./timeline-edits.json')) ? JSON.parse(readFileSync(here('./timeline-edits.json'))) : {};

// ---------- anchors: config times are resolved against the cut transcript ----------
const FIX = { BMB: 'BMV', ...(C.spellingFixes ?? {}) }; // spelling fixes from my-rules.md
const clean = (t) => t.replace(/[\u201c\u201d"]/g, '').replace(/[A-Za-z&]+/g, (w) => FIX[w.toUpperCase()] ?? w);
const bare = (t) => clean(t).toLowerCase().replace(/[^a-z0-9%'&]/g, '');
// misheard runs in cut.json fixed before anything else, e.g. {"seq": ["bmb"], "text": "BMV"}
// ("seq" uses bare words: lowercase, punctuation stripped; trailing punctuation of the last word is kept)
const words = [];
for (let i = 0; i < rawWords.length; i++) {
  const fix = (C.wordFixes ?? []).find((f) => f.seq.every((s, k) => rawWords[i + k] && bare(rawWords[i + k].text) === s));
  if (!fix) { words.push(rawWords[i]); continue; }
  const run = rawWords.slice(i, i + fix.seq.length), last = run[run.length - 1];
  const parts = fix.text.split(' ');
  if (parts.length === run.length) { // same word count: fix each word in place, keeping its own timing (anchors still work)
    run.forEach((w, k) => words.push({ ...w, text: parts[k] + (k === run.length - 1 ? (last.text.match(/[,.?!]+$/)?.[0] ?? '') : '') }));
  } else {
    words.push({ text: fix.text + (last.text.match(/[,.?!]+$/)?.[0] ?? ''), start: run[0].start, end: last.end });
  }
  i += fix.seq.length - 1;
}
// Whisper sometimes starts a word before the one it follows ("income" at 35.58 before "and if your" at 35.68):
// keep starts in order, or a caption chunk ends before it begins and is dropped (user note 2026-11-18)
for (let i = 1; i < words.length; i++) if (words[i].start < words[i - 1].start) words[i] = { ...words[i], start: words[i - 1].start };
const findWord = (w, after = 0) => {
  const x = words.find((y) => y.start >= after && bare(y.text) === w.toLowerCase());
  if (!x) throw new Error(`anchor word "${w}" after ${after}s not found in cut.json`);
  return x;
};
const sectionStart = (label) => {
  const p = edl.pieces.find((q) => q.label === label);
  if (!p) throw new Error(`anchor section "${label}" not found in edl.json`);
  return p.outStart;
};
const hookEnd = () => { const ps = edl.pieces.filter((p) => p.label === 'hook'); return ps.length ? ps[ps.length - 1].outEnd - 0.05 : 0; };
// anchor forms: number | "hookEnd" | "end" | "section:<label>" | {word, after?} | {wordEnd, after?}
const at = (a) => {
  if (typeof a === 'number') return a;
  if (a === 'hookEnd') return hookEnd();
  if (a === 'end') return BASE;
  if (typeof a === 'string' && a.startsWith('section:')) return sectionStart(a.slice(8));
  if (a?.word) return findWord(a.word, a.after ?? 0).start;
  if (a?.wordEnd) return findWord(a.wordEnd, a.after ?? 0).end;
  throw new Error(`bad anchor ${JSON.stringify(a)}`);
};
// "hook.minSeconds" keeps the hook card up long enough to read when the hook line itself is very short
const HOOK_END = C.hook ? Math.max(hookEnd(), C.hook.minSeconds ?? 0) : 0;
const OUTRO = C.outro ? (C.outro.seconds ?? 3.2) : 0;

// ---------- default captions (base time) ----------
const MAX_WORDS = PORTRAIT ? 3 : 6, MAX_CHARS = PORTRAIT ? 24 : 40; // one line (my-style.md)
const units = []; // glue "no money down" and a number + its noun so they never split
for (let i = 0; i < words.length; i++) {
  const b = (k) => (words[i + k] ? bare(words[i + k].text) : '');
  let n = 1;
  if (b(0) === 'no' && b(1) === 'money' && b(2) === 'down') n = 3;
  else if (/^\d/.test(b(0)) && !/%/.test(b(0)) && words[i + 1] && !/[,.?!]$/.test(words[i].text)) n = 2;
  units.push(words.slice(i, i + n));
  i += n - 1;
}
const chunks = [];
let cur = [];
const len = (ws) => ws.map((x) => x.text).join(' ').length;
units.forEach((u, i) => {
  cur.push(...u);
  const next = units[i + 1];
  const last = u[u.length - 1];
  // don't strand the last word of a sentence on its own line ("trust the | process"): let it ride along
  // when it finishes the sentence and the line still fits with a little slack
  const finishes = next && units.indexOf(next) === units.length - 1 || (next && /[,.?!]$/.test(next[next.length - 1].text));
  const fitsTight = next && cur.length + next.length <= MAX_WORDS && len(cur) + 1 + len(next) <= MAX_CHARS;
  const fitsSlack = next && finishes && next.length === 1 && cur.length + 1 <= MAX_WORDS + 1 && len(cur) + 1 + len(next) <= MAX_CHARS + 6;
  const end = !next || /[,.?!]$/.test(last.text) || next[0].start - last.end > 0.3 || !(fitsTight || fitsSlack);
  if (end) { chunks.push(cur); cur = []; }
});
const defaultCaps = [];
chunks.forEach((c, i) => {
  const start = Math.max(0, c[0].start - 2 / FPS);
  if (C.hook && STAGE !== 'subs' && start < HOOK_END - 0.1) return; // the hook card carries the opening line (no hook card in step 2)
  const nextStart = chunks[i + 1] ? Math.max(0, chunks[i + 1][0].start - 2 / FPS) : BASE;
  const lastEnd = c[c.length - 1].end;
  const end = Math.min(nextStart, nextStart - lastEnd < 0.6 ? nextStart : lastEnd + 0.25, BASE);
  const text = c.map((w) => clean(w.text).replace(/[,.?!]+$/, '').replace(/\.\.\.$/, '')).join(' ').replace(/no money down/gi, 'No Money Down');
  // per-word times for capStyle "kinetic" (a fixed word like "RM2,000 per" splits into tokens sharing its time)
  const toks = text.split(' ');
  const times = c.flatMap((w) => clean(w.text).replace(/[,.?!]+$/, '').replace(/\.\.\.$/, '').split(' ').map(() => +w.start.toFixed(3)));
  defaultCaps.push({ start: +start.toFixed(3), end: +end.toFixed(3), text, words: toks.length === times.length ? toks.map((x, k) => ({ text: x, t: times[k] })) : null });
});

// ---------- default cards and SFX from testimonial.json (base time) ----------
// paths relative to D:\free247editor\my-sounds (the user's own packs)
const SFX = {
  thump: 'Epedemic SFX/ES_Designed, Boom, Low Hit - Epidemic Sound.mp3',
  whoosh: 'Overused SFX by Creators/Simple Whoosh 1.wav',
  whoosh2: 'Overused SFX by Creators/Simple Whoosh 2.wav',
  whoosh3: 'Overused SFX by Creators/Whoosh Short 2.mp3',
  swish: 'Epedemic SFX/ES_Swooshes, Swish, Classic, Clean - Epidemic Sound.mp3',
  rip: 'Paper SFX (Free Sound Pack)- by MrJustinEdits/Newspaper Rip 4.wav',
  page: 'Paper SFX (Free Sound Pack)- by MrJustinEdits/Newspaper Page Turn 4.wav',
  pop: 'Overused SFX by Creators/Pop 1.wav',
  ding: 'Overused SFX by Creators/Bell Ding Sound Effect.wav',
  // "sounds": { name: 'pack/file' } in testimonial.json adds any file from my-sounds under a short name
  ...(C.sounds ?? {}),
};
const cardsDef = [], sfxDef = [], inner = {}; // inner: emphasis beats as offsets from the card's default start
if (C.hook) { cardsDef.push({ id: 'hook', label: `Hook: ${C.hook.big}`, start: 0, duration: HOOK_END }); sfxDef.push({ t: 0, k: 'thump', gain: -19 }); }
if (C.name) {
  const s = C.name.at != null ? at(C.name.at) : HOOK_END + 0.1;
  cardsDef.push({ id: 'name', label: `Name: ${C.name.name}`, start: s, duration: C.name.duration ?? 3.6 });
  sfxDef.push({ t: s, k: 'whoosh', gain: -18 });
}
(C.pills ?? []).forEach((p, i) => {
  const s = at(p.at) + (p.offset ?? 0);
  cardsDef.push({ id: `pill${i}`, label: `Pill: ${p.text}`, text: p.text, start: s, duration: p.duration ?? 2.6 });
  sfxDef.push({ t: s, k: p.sfx ?? ['whoosh2', 'whoosh3', 'page'][i % 3], gain: -17 }); // "sfx" avoids two of a kind back to back
});
(C.emphasis ?? []).forEach((e, i) => {
  const id = `emph${i}`, s = e.at != null ? at(e.at) + (e.offset ?? -0.1) : null; // a stack times itself from its lines
  if (e.type === 'strike') {
    const st = at(e.strikeAt) - 0.1, rv = at(e.revealAt);
    const end = e.until != null ? at(e.until) : rv + 3;
    cardsDef.push({ id, label: `${e.struck} struck: ${e.replace}`, start: s, duration: end - s });
    inner[id] = { strike: st - s, reveal: rv - s };
    sfxDef.push({ t: s, k: 'page', gain: -16 }, { t: st, k: 'rip', gain: -14 }, { t: rv, k: 'pop', gain: -16 });
  } else if (e.type === 'stack') {
    // lines that land one by one as they are said: [{ text, at, style: "gold" | "dim" | "white" }]
    const ts = e.lines.map((l) => at(l.at) - 0.08);
    const end = e.until != null ? at(e.until) : ts[ts.length - 1] + (e.hold ?? 2.2);
    const s0 = Math.min(s ?? ts[0], ts[0]);
    cardsDef.push({ id, label: e.lines.map((l) => l.text).join(' / '), start: s0, duration: end - s0 });
    inner[id] = { lines: ts.map((t) => t - s0) };
    ts.forEach((t, j) => sfxDef.push({ t, k: j ? 'pop' : (e.sfx ?? 'swish'), gain: j ? -17 : -18 }));
  } else if (e.type === 'kinetic') {
    // kinetic text like the approved motion-text hook (my-style-refs/motion-text-style.md): each word lands as it is spoken.
    // Line markup: *italic serif words*, [RED BOX words] (or [SHOWN=spoken] when they differ), other words big bold.
    // A word starting with ~ is not looked up (it lands 0.22 s after the previous one).
    const toks = [];
    e.lines.forEach((ln, li) => {
      for (const m of ln.matchAll(/\*([^*]+)\*|\[([^\]]+)\]|(\S+)/g)) {
        if (m[1]) m[1].trim().split(/\s+/).forEach((w) => toks.push({ li, kind: 'ser', text: w }));
        else if (m[2]) { const [show, said] = m[2].split('='); toks.push({ li, kind: 'box', text: show.trim(), match: (said ?? show.split(' ')[0]).trim() }); }
        else toks.push({ li, kind: 'hero', text: m[3] });
      }
    });
    let wi = words.findIndex((w) => w.start >= at(e.from) - 0.05);
    let tPrev = at(e.from);
    toks.forEach((k) => {
      const free = k.text.startsWith('~');
      if (free) k.text = k.text.slice(1);
      const want = bare(k.match ?? k.text);
      let hit = -1;
      if (!free && want) for (let j = wi; j >= 0 && j < Math.min(words.length, wi + 7); j++) if (bare(words[j].text) === want) { hit = j; break; }
      k.t = hit >= 0 ? words[hit].start : tPrev + 0.22;
      if (hit >= 0) wi = hit + 1;
      tPrev = k.t;
    });
    // "start" holds the card back (e.g. until the previous card has been read); words already spoken by then
    // land together at the start
    const s0 = Math.max(toks[0].t - 0.12, e.start != null ? at(e.start) : -Infinity);
    // the last word lands (0.4 s) and holds (0.35 s) before the 0.3 s exit, even when "until" is earlier
    const end = Math.max(e.until != null ? at(e.until) : toks[toks.length - 1].t + (e.hold ?? 1.1), toks[toks.length - 1].t + 1.05);
    cardsDef.push({ id, label: 'Kinetic: ' + e.lines.join(' / ').replace(/[*[\]~]/g, ''), start: s0, duration: end - s0 });
    inner[id] = { toks: toks.map((k, j) => ({ ...k, t: Math.max(0.04 * Math.min(j, 3), k.t - s0) })) };
    sfxDef.push({ t: s0, k: e.sfx ?? 'whoosh3', gain: -20 });
    toks.filter((k) => k.kind === 'box').forEach((k) => sfxDef.push({ t: k.t, k: e.boxSfx ?? 'pop', gain: e.boxGain ?? -17 }));
  } else if (e.type === 'title') {
    // a headline revealed word by word, with a small gold label above it (catches more attention than a pill)
    cardsDef.push({ id, label: `${e.label ?? ''} ${e.text}`.trim(), start: s, duration: e.duration ?? 2.8 });
    sfxDef.push({ t: s + 0.05, k: e.sfx ?? 'whoosh2', gain: e.gain ?? -17 });
  } else {
    cardsDef.push({ id, label: e.type === 'big' ? e.text : e.lines.join(' '), start: s, duration: e.duration ?? (e.type === 'big' ? 2.4 : 2.8) });
    // "sfx" in the config picks another sound (vary repeated cards: playbook says no percussion loops)
    const k = e.sfx ?? (e.type === 'big' ? 'ding' : 'swish');
    sfxDef.push({ t: s + 0.05, k, gain: e.gain ?? (k === 'ding' ? -20 : k === 'thump' ? -17 : -18) });
  }
});
(C.zooms ?? []).forEach((z, i) => {
  const s = at(z.from) - 0.25, e = at(z.to) + (z.to === 'hookEnd' || z.to === 'end' ? 0 : 0.6);
  cardsDef.push({ id: `zoom${i}`, label: `Zoom: ${z.label}`, start: s, duration: Math.max(1.2, e - s) });
});
// split layouts (content/ad style): the footage zooms out into a framed card and a data panel slides in above it
(C.splits ?? []).forEach((p, i) => {
  const s = at(p.from) - 0.35, e = at(p.to) + 0.4;
  cardsDef.push({ id: `split${i}`, label: `Split: ${p.title}`, start: s, duration: Math.max(3, e - s) });
  sfxDef.push({ t: s, k: 'whoosh', gain: -18 }, { t: e - 0.75, k: 'whoosh2', gain: -20, splitOut: true });
});
// "extraSfx": [{ at: anchor, k, gain?, offset?, len?, pre? }]: sounds on a word (user note 2026-11-23: "gamitin mo lahat ng pwedeng
// ilagay ... sound effects"). "pre" starts the file that many seconds before the word (a riser that peaks on it), "len"
// lets a longer sound play past the 2.5 s default.
(C.extraSfx ?? []).forEach((x) => sfxDef.push({ t: at(x.at) + (x.offset ?? 0), k: x.k, gain: x.gain ?? -18, len: x.len, pre: x.pre }));
if (C.outro) { cardsDef.push({ id: 'outro', label: 'End screen: logo', start: BASE - 0.4, duration: OUTRO + 0.4 }); sfxDef.push({ t: BASE - 0.2, k: 'whoosh', gain: -18 }); }
const defaultCards = cardsDef.map((c) => ({ ...c, start: +Math.max(0, c.start).toFixed(3), duration: +c.duration.toFixed(3), hidden: false }));
// a split's exit whoosh right before another card's own sound reads as two sounds for one animation (user note
// note at 0:46): drop the exit whoosh when another cue follows within 1.2 s
for (let i = sfxDef.length - 1; i >= 0; i--) {
  const c = sfxDef[i];
  if (c.splitOut && sfxDef.some((d) => d !== c && !d.splitOut && d.t > c.t && d.t - c.t < 1.2)) sfxDef.splice(i, 1);
}
for (const c of sfxDef) if (!SFX[c.k]) throw new Error(`unknown sound "${c.k}" (add it under "sounds")`);
const defaultSfx = sfxDef.map((c) => ({ t: +Math.max(0, c.t).toFixed(3), file: SFX[c.k], gain: c.gain, ...(c.len ? { len: c.len } : {}), ...(c.pre ? { pre: c.pre } : {}) }));

// ---------- apply the user's edits (still base time) ----------
const captions = (E.captions ?? defaultCaps).map((c) => ({ ...c })).sort((a, b) => a.start - b.start);
const cards = defaultCards.map((c) => ({ ...c, ...(E.cards?.[c.id] ?? {}) }));
const sfx = (E.sfx ?? defaultSfx).map((c) => ({ ...c })).sort((a, b) => a.t - b.t);
const removed = new Set((E.removedPieces ?? []).filter((i) => i >= 0 && i < edl.pieces.length));
const bedGain = E.bedGain ?? null;

writeFileSync(here('./timeline-data.json'), JSON.stringify({
  duration: +(BASE + OUTRO).toFixed(3), captions, cards, sfx, removedPieces: [...removed].sort((a, b) => a - b), bedGain,
}, null, 2));
if (DATA_ONLY) { console.log('timeline-data.json refreshed'); process.exit(0); }

// ---------- base -> output time (removed pieces collapse to nothing) ----------
const pieces = edl.pieces.map((p, i) => ({ i, s: p.outStart, e: p.outEnd, removed: removed.has(i) }));
const mapT = (t) => {
  let shift = 0;
  for (const p of pieces) {
    if (!p.removed) continue;
    if (t >= p.e) shift += p.e - p.s;
    else if (t > p.s) return p.s - shift; // inside a removed piece: collapse to its cut point
  }
  return t - shift;
};
const inRemoved = (t) => pieces.some((p) => p.removed && t >= p.s && t < p.e);
const DUR = +mapT(BASE).toFixed(3); // end of the speech (video length)
const outroOn = STAGE !== 'subs' && !!C.outro && !cards.find((c) => c.id === 'outro')?.hidden;
const TOTAL = +(DUR + (outroOn ? OUTRO : 0)).toFixed(3);

// ---------- render inputs: cut the removed pieces out of the video and voice ----------
const key = [...removed].sort((a, b) => a - b).join(',');
// FOOTAGE=cut-4k.mp4 (from CUT_SCALE=2 node render-cut.mjs) feeds a 4K render (--resolution portrait-4k)
let video = process.env.FOOTAGE ?? 'cut.mp4', voice = 'voice.wav';
if (removed.size) {
  video = 'cut-edit.mp4'; voice = 'voice-edit.wav';
  const prev = existsSync(here('./render-inputs.json')) ? JSON.parse(readFileSync(here('./render-inputs.json'))) : {};
  if (prev.key !== key || !existsSync(here(`./${video}`)) || !existsSync(here(`./${voice}`))) {
    let f0 = 0;
    const parts = [], keep = [];
    edl.pieces.forEach((p, i) => {
      const n = p.srcFrameOut - p.srcFrameIn;
      if (!removed.has(i)) keep.push([f0, f0 + n]);
      f0 += n;
    });
    keep.forEach(([a, z], k) => {
      parts.push(`[0:v]trim=start_frame=${a}:end_frame=${z},setpts=PTS-STARTPTS[v${k}]`);
      const sa = a / FPS, sz = z / FPS, d = sz - sa;
      parts.push(`[1:a]atrim=start=${sa.toFixed(6)}:end=${sz.toFixed(6)},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st=${(d - 0.008).toFixed(6)}:d=0.008[a${k}]`);
    });
    parts.push(`${keep.map((_, k) => `[v${k}]`).join('')}concat=n=${keep.length}:v=1:a=0[vo]`);
    parts.push(`${keep.map((_, k) => `[a${k}]`).join('')}concat=n=${keep.length}:v=0:a=1[ao]`);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', 'cut.mp4', '-i', 'voice.wav', '-filter_complex', parts.join(';'),
      '-map', '[vo]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-g', String(Math.round(FPS)), '-keyint_min', String(Math.round(FPS)), '-movflags', '+faststart', video,
      '-map', '[ao]', '-c:a', 'pcm_s16le', voice], { cwd: new URL('.', import.meta.url), stdio: 'inherit' });
    if (r.status) process.exit(r.status);
  }
}
writeFileSync(here('./render-inputs.json'), JSON.stringify({ key, video, voice, duration: TOTAL, videoDuration: DUR, bedGain }, null, 2));

// ---------- output-time items ----------
const outCaps = captions
  .map((c) => ({ text: c.text, start: mapT(c.start), end: mapT(c.end), words: c.words?.map((w) => ({ ...w, t: mapT(w.t) })) }))
  .filter((c) => c.end - c.start >= 0.05)
  .sort((a, b) => a.start - b.start);
outCaps.forEach((c, i) => { if (outCaps[i + 1]) c.end = Math.min(c.end, outCaps[i + 1].start); });
// drop captions that would sit under a kinetic text card, unless "kineticCaptions": true (user note 2026-11-23: "yung iba
// walang subtitle"), which keeps every caption and lifts the kinetic cards above the caption line
if (!C.kineticCaptions) {
  const kw = cards.filter((c) => c.id.startsWith('emph') && !c.hidden && C.emphasis[Number(c.id.slice(4))]?.type === 'kinetic' && STAGE !== 'subs')
    .map((c) => [mapT(c.start), mapT(c.start + c.duration)]);
  // keep the words spoken outside the card (a caption line that runs past the card would otherwise vanish whole and
  // leave a stretch with no subtitle: user note 2026-11-23 "yung iba walang subtitle", then "huwag mo nang lagyan ng
  // subtitle kapag may ganitong text")
  for (let i = outCaps.length - 1; i >= 0; i--) {
    const c = outCaps[i], k = kw.find(([a, z]) => c.start < z - 0.1 && c.end > a + 0.1);
    if (!k) continue;
    const [a, z] = k, parts = [];
    if (c.words) {
      const before = c.words.filter((w) => w.t < a - 0.05), after = c.words.filter((w) => w.t >= z - 0.15);
      if (before.length && a - c.start >= 0.3) parts.push({ text: before.map((w) => w.text).join(' '), start: c.start, end: a, words: before });
      if (after.length && c.end - z >= 0.3) parts.push({ text: after.map((w) => w.text).join(' '), start: z, end: c.end, words: after });
    }
    outCaps.splice(i, 1, ...parts);
    i += parts.length; // check the kept parts again: a line can run under two cards back to back
  }
}
// "name": { ..., "hideCaptions": true }: no caption under the name card while she says her name (the card already says it)
const nameCard = cards.find((c) => c.id === 'name' && !c.hidden);
if (C.name?.hideCaptions && nameCard && STAGE !== 'subs') {
  const [a, z] = [mapT(nameCard.start), mapT(nameCard.start + nameCard.duration)];
  for (let i = outCaps.length - 1; i >= 0; i--) if (outCaps[i].start < z - 0.1 && outCaps[i].end > a + 0.1) outCaps.splice(i, 1);
}
// no caption flashes: a piece shorter than 0.4 s left between cards joins the next caption when they touch, or goes
for (let i = outCaps.length - 1; i >= 0; i--) {
  const c = outCaps[i], n = outCaps[i + 1];
  if (c.end - c.start >= 0.4) continue;
  if (n && n.start - c.end < 0.1) outCaps.splice(i, 2, { ...n, text: `${c.text} ${n.text}`, start: c.start, words: c.words && n.words ? [...c.words, ...n.words] : n.words });
  else outCaps.splice(i, 1);
}
const outCards = cards
  .filter((c) => !c.hidden && STAGE !== 'subs')
  .map((c) => ({ ...c, s: mapT(c.start), d: mapT(c.start + c.duration) - mapT(c.start) }))
  .filter((c) => c.d >= 0.3);
const card = (id) => outCards.find((c) => c.id === id);
const outSfx = STAGE === 'full' ? sfx.filter((c) => !inRemoved(c.t)).map((c) => ({ ...c, t: +mapT(c.t).toFixed(3) })) : [];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f3 = (n) => n.toFixed(3);
const fit = (text, max, width, em = 0.78) => Math.round(Math.min(max, width / (String(text).length * em))); // px so a line fits
const clipAttrs = (c, track, cls = 'clip') => `class="${cls}" data-start="${f3(c.s)}" data-duration="${f3(c.d)}" data-track-index="${track}"`;
// capKeywords: words/phrases (bare, e.g. "room rental") shown in the hook style inside their caption, with a pop
const KW = (C.capKeywords ?? []).map((k) => k.toLowerCase().split(' '));
const capLine = (text) => {
  const ws = String(text).split(' '), out = [];
  for (let i = 0; i < ws.length; i++) {
    const k = KW.find((p) => p.every((s, j) => ws[i + j] && bare(ws[i + j]) === s));
    if (!k) { out.push(esc(ws[i])); continue; }
    out.push(`<span class="kw">${esc(ws.slice(i, i + k.length).join(' '))}</span>`);
    i += k.length - 1;
  }
  return out.join(' ');
};
// capStyle "kinetic" (my-style-refs/motion-text-style.md, like the approved motion-text reels): each word appears as it is
// spoken with a blur-in; small connector words in italic serif, other words in bold sans, capKeywords in a
// red box that wipes in with a pop. Captions without word times (timeline edits) fall back to the plain line.
const KINETIC = C.capStyle === 'kinetic';
const SMALL = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'but', 'so', 'is', 'are', 'it', 'its', "it's",
  'you', "you're", 'your', 'i', "i'll", 'we', 'they', 'that', 'this', 'with', 'from', 'by', 'be', 'if', 'as', 'do', 'can', 'just', 'what', 'how', 'gonna', 'going', 'some', 'like', 'okay', 'right', 'up', 'out', 'into', 'then', 'there', 'which', 'let\'s', 'say']);
const kinetic = (c, i) => {
  const ws = c.words, parts = [];
  for (let j = 0; j < ws.length; j++) {
    const k = KW.find((p) => p.every((s, n) => ws[j + n] && bare(ws[j + n].text) === s));
    const n = k ? k.length : 1, text = ws.slice(j, j + n).map((w) => w.text).join(' '), t = ws[j].t;
    const id = `cap${i}w${parts.length}`;
    if (k) {
      parts.push(`<span id="${id}" class="kw-h"><span class="bx"></span><span class="tx">${esc(text)}</span></span>`);
      tweens.push(`tl.fromTo('#${id}',{opacity:0,scale:.6},{opacity:1,scale:1,duration:.32,ease:'back.out(2.2)'},${f3(Math.max(c.start, t - 0.04))});`,
        `tl.fromTo('#${id} .bx',{scaleX:0},{scaleX:1,duration:.22,ease:'power2.out'},${f3(Math.max(c.start, t + 0.04))});`);
    } else {
      parts.push(`<span id="${id}" class="${SMALL.has(bare(text)) ? 'kw-s' : 'kw-b'}">${esc(text)}</span>`);
      tweens.push(`tl.fromTo('#${id}',{opacity:0,y:16,filter:'blur(8px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.24,ease:'power3.out'},${f3(Math.max(c.start, t - 0.04))});`);
    }
    j += n - 1;
  }
  const d = c.end - c.start;
  if (d > 0.45) tweens.push(`tl.to('#cap${i} .line',{opacity:0,y:-10,filter:'blur(6px)',duration:.12,ease:'power2.in'},${f3(c.end - 0.18)});`, `tl.set('#cap${i} .line',{opacity:0},${f3(c.end - 0.02)});`);
  return parts.join(' ');
};
const tweens = [];
const capHtml = outCaps.map((c, i) => `<div id="cap${i}" class="clip cap${KINETIC && c.words ? ' kin' : ''}" data-start="${f3(c.start)}" data-duration="${f3(c.end - c.start)}" data-track-index="${10 + (i % 2)}"><span class="line">${KINETIC && c.words ? kinetic(c, i) : capLine(c.text)}</span></div>`).join('\n');
const pillCards = outCards.filter((c) => c.id.startsWith('pill'));
const pillHtml = pillCards.map((c) => `<div id="${c.id}" ${clipAttrs(c, 20 + Number(c.id.slice(4)), 'clip pill')}><span>${esc(c.text)}</span></div>`).join('\n');
const H = card('hook'), N = card('name'), OU = card('outro');
const zoomCards = outCards.filter((c) => c.id.startsWith('zoom')).sort((a, b) => a.s - b.s);
const emphCards = outCards.filter((c) => c.id.startsWith('emph'));

// fade finishes before the hard kill, both inside the clip
// the extra set right after the fade satisfies lint when another clip happens to start on the fade's last frame
const exit = (sel, c, lead = 0.25) => `tl.to('${sel}',{opacity:0,duration:${(lead - 0.06).toFixed(2)}},${f3(c.s + c.d - lead)});tl.set('${sel}',{opacity:0},${f3(c.s + c.d - 0.05)});tl.set('${sel}',{opacity:0},${f3(c.s + c.d - 0.02)});`;
outCaps.forEach((c, i) => { if (KW.length && !(KINETIC && c.words) && capLine(c.text).includes('class="kw"')) tweens.push(`tl.fromTo('#cap${i} .kw',{scale:.6},{scale:1,duration:.3,ease:'back.out(2.4)'},${f3(c.start)});`); });
const PREMIUM = C.look === 'premium';
if (H && C.hook.sub) tweens.push(`tl.fromTo('#hook .sub',{opacity:0,y:12},{opacity:1,y:0,duration:.45,ease:'power2.out'},${f3(H.s + 0.7)});`);
if (H && PREMIUM) tweens.push(`tl.fromTo('#hook .in',{opacity:0,y:30,filter:'blur(10px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.6,ease:'power3.out'},${f3(H.s)});`,
  `tl.fromTo('#hook .big',{y:24,opacity:0},{y:0,opacity:1,duration:.55,ease:'power3.out'},${f3(H.s + 0.15)});`, exit('#hook .in', H, 0.25));
else if (H) tweens.push(`tl.fromTo('#hook .big',{scale:1.12},{scale:1,duration:.45,ease:'power3.out'},${f3(H.s)});`,
  `tl.from('#hook .q',{y:-16,duration:.35,ease:'power2.out'},${f3(H.s)});`, exit('#hook .in', H, 0.17));
if (N) tweens.push(`tl.from('#name .in',{x:-60,opacity:0,duration:.4,ease:'power3.out'},${f3(N.s)});`,
  `tl.from('#name .r',{y:10,opacity:0,duration:.3,ease:'power2.out'},${f3(N.s + 0.5)});`, exit('#name .in', N));
pillCards.forEach((c) => {
  tweens.push(`tl.from('#${c.id} span',{y:-40,opacity:0,duration:.35,ease:'back.out(1.6)'},${f3(c.s)});`);
  if (c.s + c.d < DUR - 0.05) tweens.push(exit(`#${c.id} span`, c));
});
// "safe": { x, y, w, h } keeps text inside the apps' safe zone (my-style-refs/social-safe-zone-portrait.png:
// x 203, y 278, w 712, h 1179 in 1080x1920): captions, pills, cards, kinetic text and split panels
const SAFE = C.safe ?? null;
// user note (2026-11-19): only the text has to sit in the safe zone; cards and panels keep their own layout
const SAFE_CARDS = SAFE && C.safeCards ? SAFE : null;
const EMPH_W = SAFE_CARDS ? SAFE_CARDS.w : PORTRAIT ? 900 : 540, EMPH_IN = EMPH_W - 60;
const emphHtml = emphCards.map((c, k) => {
  const e = C.emphasis[Number(c.id.slice(4))];
  const track = 30 + k;
  // "top" moves one card (e.g. a big word a little higher than emphTop); applied to the clip's own style
  const pos = e.top != null ? ` style="top:${e.top}px"` : '';
  if (e.type === 'stack') {
    const o = inner[c.id];
    e.lines.forEach((l, j) => tweens.push(`tl.fromTo('#${c.id} .sl${j}',{opacity:0,y:24,filter:'blur(8px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.45,ease:'power3.out'},${f3(c.s + o.lines[j])});`));
    tweens.push(`tl.fromTo('#${c.id} .bar',{scaleX:0},{scaleX:1,duration:.5,ease:'power2.out'},${f3(c.s + 0.2)});`, exit(`#${c.id} .in`, c));
    const longest = e.lines.reduce((a, b) => (b.text.length > a.length ? b.text : a), '');
    const fs = fit(longest, PORTRAIT ? 80 : 60, EMPH_IN, 0.78);
    return `<div id="${c.id}" ${clipAttrs(c, track, 'clip emph')}${pos}><div class="in box">${e.lines.map((l, j) => `<div class="sl sl${j} ${l.style ?? 'white'}" style="font-size:${fs}px">${esc(l.text)}</div>`).join('')}<div class="bar"></div></div></div>`;
  }
  if (e.type === 'kinetic') {
    const { toks } = inner[c.id];
    const nLines = Math.max(...toks.map((k) => k.li)) + 1;
    const lines = [];
    let kh = 0; // rough height of the block, to keep it above the safe zone's bottom
    for (let li = 0; li < nLines; li++) {
      const lt = toks.map((k, j) => ({ ...k, j })).filter((k) => k.li === li);
      // fit: rough width of the line at base size 100px, scaled down so it stays inside 1000 px (landscape 900)
      const est = lt.reduce((w, k) => w + 22 + (k.kind === 'ser' ? 0.46 * 70 : k.kind === 'hero' ? 0.74 * 112 : 0.76 * 104 + 0.6) * k.text.length + (k.kind === 'box' ? 64 : 0), 0);
      const base = Math.min(e.full ? 150 : 100, Math.round(100 * (SAFE ? SAFE.w - 24 : PORTRAIT ? 1000 : 900) / est));
      kh += base * (lt.some((k) => k.kind !== 'ser') ? 1.3 : 0.86);
      lines.push(`<div class="kl" style="font-size:${base}px">${lt.map((k) => {
        const id = `${c.id}k${k.j}`, t = f3(c.s + k.t);
        if (k.kind === 'ser') {
          tweens.push(`tl.fromTo('#${id}',{opacity:0,y:18,filter:'blur(10px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.3,ease:'power3.out'},${t});`);
          return `<span id="${id}" class="ks">${esc(k.text)}</span>`;
        }
        if (k.kind === 'hero') {
          tweens.push(`tl.set('#${id}',{opacity:1},${t});`, `tl.fromTo('#${id} .ch',{opacity:0,filter:'blur(6px)',x:(i,_,a)=>(i-(a.length-1)/2)*30},{opacity:1,filter:'blur(0px)',x:0,duration:.38,ease:'power3.out',stagger:.012},${t});`);
          return `<span id="${id}" class="kh">${[...k.text].map((ch) => `<span class="ch">${esc(ch)}</span>`).join('')}</span>`;
        }
        tweens.push(`tl.fromTo('#${id}',{opacity:0,scale:.6},{opacity:1,scale:1,duration:.4,ease:'back.out(2)'},${t});`, `tl.fromTo('#${id} .bx',{scaleX:0},{scaleX:1,duration:.26,ease:'power2.out'},${f3(c.s + k.t + 0.08)});`);
        return `<span id="${id}" class="kb"><span class="bx"></span><span class="tx">${esc(k.text)}</span></span>`;
      }).join(' ')}</div>`);
    }
    if (e.full) {
      // "full": true (user note 2026-11-23, like the approved full motion-text reel): a full-screen text scene with no face. The fluid
      // brand-red background (or white with "theme": "light") covers the footage; the words land on the voice, centered
      // in the safe zone. The voice keeps playing under it.
      const z = SAFE ?? { x: 60, y: 140, w: WW - 120, h: HH - 280 };
      // back-to-back full scenes (user note 2026-11-23: longer full scenes, no face peeking between them): the first runs
      // until the next starts and keeps its background up; the next starts with its background already up
      const isFull = (o) => o?.id.startsWith('emph') && C.emphasis[Number(o.id.slice(4))]?.type === 'kinetic' && C.emphasis[Number(o.id.slice(4))]?.full;
      const nxt = outCards.find((o) => o !== c && isFull(o) && o.s > c.s && o.s - (c.s + c.d) < 0.25);
      const prv = outCards.find((o) => o !== c && isFull(o) && o.s < c.s && c.s - (o.s + o.d) < 0.25);
      // transitions like the approved motion reel (my-style-refs/motion/approved-motion-reel.mp4, user note
      // 2026-11-23: use it as the reference): the scene's color sweeps up from the bottom as a wave with a
      // moving wavy edge, and at the end lifts off upward back onto the footage. Back-to-back scenes of the same color
      // keep the background and only the words change; a scene of another color comes up as a new wave over the last.
      // The words leave with one of the reel's exits in turn: zoom through, slide away, squash, shrink.
      const theme = (o) => C.emphasis[Number(o.id.slice(4))]?.theme === 'light' ? 'light' : 'dark';
      const sameBg = prv && theme(prv) === theme(c);
      const textEnd = nxt ? nxt.s : c.s + c.d;
      if (nxt) c.d = nxt.s - c.s + 0.6;
      const WV = (y, a) => `path('M0 ${y} C 180 ${y - a}, 360 ${y + a}, 540 ${y} S 900 ${y - a}, 1080 ${y} L1080 2400 L0 2400 Z')`; // colour below a wavy edge
      const LF = (y, a) => `path('M0 -400 L1080 -400 L1080 ${y} C 900 ${y + a}, 720 ${y - a}, 540 ${y} S 180 ${y + a}, 0 ${y} Z')`; // colour above a wavy edge
      if (sameBg) tweens.push(`tl.set('#${c.id} .fbg',{opacity:1,clipPath:"${WV(-400, 0)}"},${f3(c.s)});`);
      else tweens.push(`tl.fromTo('#${c.id} .fbg',{opacity:1,clipPath:"${WV(2080, 110)}"},{clipPath:"${WV(-360, -90)}",duration:.55,ease:'power3.inOut'},${f3(c.s - (prv ? 0 : 0.2))});`,
        `tl.fromTo('#${c.id} .fwrap',{opacity:0},{opacity:1,duration:.15,ease:'power1.out'},${f3(c.s + (prv ? 0.3 : 0.15))});`); // words show once the wave is up
      tweens.push(
        ...[[240, -170, 1.15], [-280, -240, .9], [-200, 210, 1.2]].map(([x, y, sc], j) => `tl.fromTo('#${c.id} .fb${j + 1}',{x:0,y:0,scale:1},{x:${x},y:${y},scale:${sc},duration:${f3(c.d + 0.2)},ease:'sine.inOut'},${f3(c.s - 0.2)});`),
        `tl.to('#${c.id} .in',{scale:1.05,duration:${f3(Math.max(0.3, textEnd - c.s - 0.4))},ease:'none'},${f3(c.s)});`);
      const nFull = outCards.filter((o) => isFull(o) && o.s < c.s).length;
      const out = [
        `{scale:2.8,opacity:0,filter:'blur(16px)',duration:.3,ease:'power2.in'}`,
        `{x:-700,opacity:0,filter:'blur(14px)',duration:.24,ease:'power2.in'}`,
        `{scaleY:.02,scaleX:1.2,opacity:0,duration:.18,ease:'power2.in'}`,
        `{scale:.3,opacity:0,duration:.2,ease:'power2.in'}`,
      ][nFull % 4];
      const tOut = textEnd - (nxt ? 0.32 : 0.62);
      tweens.push(`tl.to('#${c.id} .in',${out},${f3(tOut)});`, `tl.set('#${c.id} .in',{opacity:0},${f3(tOut + 0.31)});`);
      if (!nxt) tweens.push(`tl.fromTo('#${c.id} .fbg',{clipPath:"${LF(2100, 100)}"},{clipPath:"${LF(-380, -90)}",duration:.42,ease:'power3.in'},${f3(c.s + c.d - 0.44)});`, `tl.set('#${c.id} .fbg',{opacity:0},${f3(c.s + c.d - 0.02)});`);
      return `<div id="${c.id}" ${clipAttrs(c, track, `clip kin-card kin-full ${e.theme === 'light' ? 'light' : 'dark'}`)}><div class="fbg"><i class="fb1"></i><i class="fb2"></i><i class="fb3"></i></div><div class="fwrap" style="left:${z.x}px;width:${z.w}px;top:${z.y}px;height:${z.h}px"><div class="in">${lines.join('')}</div></div></div>`;
    }
    tweens.push(`tl.fromTo('#${c.id} .ksh',{opacity:0},{opacity:1,duration:.3},${f3(c.s)});`,
      `tl.to('#${c.id} .in',{opacity:0,y:-18,filter:'blur(8px)',duration:.3,ease:'power2.in'},${f3(c.s + c.d - 0.34)});`, `tl.to('#${c.id} .ksh',{opacity:0,duration:.3,ease:'power1.in'},${f3(c.s + c.d - 0.34)});`, `tl.set('#${c.id} .ksh',{opacity:0},${f3(c.s + c.d - 0.02)});`, // the shade fades with the words (it used to cut off)
      `tl.set('#${c.id} .in',{opacity:0},${f3(c.s + c.d - 0.05)});`, `tl.set('#${c.id} .in',{opacity:0},${f3(c.s + c.d - 0.02)});`);
    return `<div id="${c.id}" ${clipAttrs(c, track, 'clip kin-card')} style="top:${Math.round(SAFE ? Math.max(SAFE.y + 20, Math.min(e.top ?? 1080, SAFE.y + SAFE.h - kh - 20, C.kineticCaptions && C.capTop ? C.capTop - kh - 24 : Infinity)) : e.top ?? (PORTRAIT ? 1080 : 620))}px${SAFE ? `;left:${SAFE.x}px;right:auto;width:${SAFE.w}px` : ''}"><div class="ksh"></div><div class="in">${lines.join('')}</div></div>`;
  }
  if (e.type === 'title') {
    const ws = e.text.split(' ');
    tweens.push(`tl.fromTo('#${c.id} .in',{opacity:0},{opacity:1,duration:.25},${f3(c.s)});`,
      `tl.fromTo('#${c.id} .lab',{opacity:0,y:-10},{opacity:1,y:0,duration:.35,ease:'power2.out'},${f3(c.s)});`,
      `tl.fromTo('#${c.id} .tw',{opacity:0,y:30,filter:'blur(10px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.45,ease:'power3.out',stagger:.09},${f3(c.s + 0.12)});`,
      `tl.fromTo('#${c.id} .bar',{scaleX:0},{scaleX:1,duration:.5,ease:'power2.out'},${f3(c.s + 0.25 + ws.length * 0.09)});`, exit(`#${c.id} .in`, c));
    return `<div id="${c.id}" ${clipAttrs(c, track, 'clip emph')}${pos}><div class="in box ttl">${e.label ? `<div class="lab">${esc(e.label)}</div>` : ''}<div class="tt">${ws.map((w) => `<span class="tw">${esc(w)}</span>`).join(' ')}</div><div class="bar"></div></div></div>`;
  }
  if (e.type === 'strike') {
    const o = inner[c.id];
    tweens.push(`tl.from('#${c.id} .word',{scale:.85,opacity:0,duration:.35,ease:'power3.out'},${f3(c.s)});`,
      `tl.fromTo('#${c.id} .strike',{scaleX:0},{scaleX:1,duration:.35,ease:'power2.inOut'},${f3(c.s + Math.min(c.d - 1, o.strike))});`,
      `tl.from('#${c.id} .done',{y:20,opacity:0,scale:.9,duration:.35,ease:'back.out(1.8)'},${f3(c.s + Math.min(c.d - 0.6, o.reveal))});`, exit(`#${c.id} .in`, c, 0.3));
    return `<div id="${c.id}" ${clipAttrs(c, track, 'clip emph')}${pos}><div class="in box"><div class="word" style="font-size:${fit(e.struck, PORTRAIT ? 72 : 52, EMPH_IN)}px">${esc(e.struck)}<div class="strike"></div></div><div><span class="done" style="font-size:${fit(e.replace, PORTRAIT ? 48 : 38, EMPH_IN - 60)}px">${esc(e.replace)}</span></div></div></div>`;
  }
  if (e.type === 'big') {
    tweens.push(PREMIUM
      ? `tl.fromTo('#${c.id} .big',{opacity:0,y:34,scale:.97,filter:'blur(10px)'},{opacity:1,y:0,scale:1,filter:'blur(0px)',duration:.6,ease:'power3.out'},${f3(c.s)});`
      : `tl.fromTo('#${c.id} .big',{scale:.6,opacity:0},{scale:1,opacity:1,duration:.4,ease:'back.out(2)'},${f3(c.s)});`, exit(`#${c.id} .in`, c));
    return `<div id="${c.id}" ${clipAttrs(c, track, 'clip emph')}${pos}><div class="in"><div class="big" style="font-size:${fit(e.text, PORTRAIT ? 200 : 170, SAFE ? SAFE.w - 60 : EMPH_W, 0.7)}px">${esc(e.text)}</div></div></div>`;
  }
  tweens.push(PREMIUM ? `tl.fromTo('#${c.id} .in',{opacity:0,y:26,filter:'blur(8px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.55,ease:'power3.out'},${f3(c.s)});` : `tl.from('#${c.id} .in',{x:60,opacity:0,duration:.4,ease:'power3.out'},${f3(c.s)});`,
    `tl.fromTo('#${c.id} .bar',{scaleX:0},{scaleX:1,duration:.5,ease:'power2.out'},${f3(c.s + 0.25)});`, exit(`#${c.id} .in`, c));
  const longest = e.lines.reduce((a, b) => (b.length > a.length ? b : a), '');
  return `<div id="${c.id}" ${clipAttrs(c, track, 'clip emph')}${pos}><div class="in box"><div class="t" style="font-size:${fit(longest, PORTRAIT ? 84 : 62, EMPH_IN, 0.82)}px">${e.lines.map(esc).join('<br>')}</div><div class="bar"></div></div></div>`;
}).join('\n');
// ---------- split layouts ----------
// footage in #vframe shrinks (origin top-left) into SPL.card; a blurred copy (#bgv) fills the frame behind it;
// the panel shows a tag, a title and either bars (count up, grow from the base) or stat rows
const SPL = PORTRAIT
  ? SAFE_CARDS ? { card: { x: 221, y: 770, k: 0.59 }, panel: `left:${SAFE_CARDS.x}px;top:${SAFE_CARDS.y + 6}px;width:${SAFE_CARDS.w}px`, chartH: 150 }
    : { card: { x: 216, y: 730, k: 0.6 }, panel: 'left:70px;top:110px;width:940px', chartH: 170 }
  : { card: { x: 712, y: 250, k: 0.6 }, panel: 'left:64px;top:230px;width:600px', chartH: 260 };
const SPL_W = Math.round(WW * SPL.card.k), SPL_H = Math.round(HH * SPL.card.k);
const splitCards = outCards.filter((c) => c.id.startsWith('split'));
const money = (n, like) => like.replace(/[\d,.]+/, Math.round(n).toLocaleString('en-US'));
const splitHtml = splitCards.map((c) => {
  const k = Number(c.id.slice(5)), p = C.splits[k], ch = p.chart ?? { type: 'stats', items: [] };
  const a = c.s, z = c.s + c.d, id = c.id;
  const { x, y, k: sc } = SPL.card;
  tweens.push(
    `tl.set('#vframe',{borderRadius:${Math.round(30 / sc)}},${f3(a)});`,
    `tl.to('#vframe',{x:${x},y:${y},scale:${sc},duration:.75,ease:'power3.inOut'},${f3(a)});`,
    `tl.to('#bgv',{opacity:1,duration:.6,ease:'power1.out'},${f3(a)});`,
    `tl.fromTo('#${id}f',{opacity:0,scale:1.04},{opacity:1,scale:1,duration:.35,ease:'power2.out'},${f3(a + 0.55)});`,
    `tl.fromTo('#${id} .panel',{y:-70,opacity:0,scale:.96},{y:0,opacity:1,scale:1,duration:.6,ease:'power3.out'},${f3(a + 0.2)});`,
    `tl.fromTo('#${id} .acc2',{scaleX:0},{scaleX:1,duration:.7,ease:'power2.out'},${f3(a + 0.45)});`,
    `tl.fromTo('#${id} .tag',{scale:.6,opacity:0},{scale:1,opacity:1,duration:.35,ease:'back.out(2)'},${f3(a + 0.45)});`,
    `tl.fromTo('#${id} .ttl',{x:-30,opacity:0},{x:0,opacity:1,duration:.45,ease:'power3.out'},${f3(a + 0.55)});`,
    `tl.fromTo('#${id} .note',{opacity:0},{opacity:.7,duration:.4},${f3(a + 0.7)});`,
  );
  ch.items.forEach((it, j) => {
    // an item can carry its own anchor ("at") so a row lands as it is said; otherwise rows stagger in
    const t0 = it.at != null ? Math.max(a + 0.7, mapT(at(it.at)) - 0.1) : a + 0.85 + j * 0.25;
    if (ch.type === 'bars') {
      tweens.push(`tl.fromTo('#${id}b${j} .bar',{scaleY:0},{scaleY:1,duration:.7,ease:'power3.out'},${f3(t0)});`,
        `tl.fromTo('#${id}b${j} .val',{opacity:0,y:12},{opacity:1,y:0,duration:.35,ease:'power2.out'},${f3(t0 + 0.1)});`,
        `tl.fromTo('#${id}b${j} .lbl',{opacity:0},{opacity:1,duration:.35},${f3(t0)});`);
    } else {
      tweens.push(`tl.fromTo('#${id}b${j}',{x:-40,opacity:0},{x:0,opacity:1,duration:.45,ease:'power3.out'},${f3(t0)});`);
    }
    if (it.value != null) {
      tweens.push(`(()=>{const o={v:0},el=document.querySelector('#${id}b${j} .val');tl.to(o,{v:${it.value},duration:.9,ease:'power2.out',onUpdate:()=>{el.textContent=${JSON.stringify(it.display)}.replace(/[\\d,.]+/,Math.round(o.v).toLocaleString('en-US'));}},${f3(t0 + 0.1)});})();`);
    }
  });
  // out: panel lifts away, the footage grows back to the full frame (hard kills inside the clip)
  tweens.push(
    `tl.to('#${id} .panel',{y:-70,opacity:0,duration:.4,ease:'power2.in'},${f3(z - 0.8)});`, `tl.set('#${id} .panel',{opacity:0},${f3(z - 0.37)});`, `tl.set('#${id} .panel',{opacity:0},${f3(z - 0.02)});`,
    `tl.to('#${id}f',{opacity:0,duration:.15,ease:'power1.in'},${f3(z - 0.87)});`, `tl.set('#${id}f',{opacity:0},${f3(z - 0.7)});`, `tl.set('#${id}f',{opacity:0},${f3(z - 0.02)});`,
    `tl.to('#vframe',{x:0,y:0,scale:1,duration:.75,ease:'power3.inOut'},${f3(z - 0.78)});`,
    `tl.to('#bgv',{opacity:0,duration:.5,ease:'power1.in'},${f3(z - 0.6)});`, `tl.set('#bgv',{opacity:0},${f3(z - 0.09)});`,
    `tl.set('#vframe',{borderRadius:0},${f3(z)});`,
  );
  const max = Math.max(...ch.items.map((it) => it.value ?? 1));
  const body = ch.type === 'bars'
    ? `<div class="bars">${ch.items.map((it, j) => `<div class="b" id="${id}b${j}"><div class="val">${esc(it.value != null ? money(0, it.display) : it.display)}</div><div class="bar${it.gold ? ' gold' : ''}" style="height:${Math.max(18, Math.round(SPL.chartH * (it.value ?? 1) / max))}px"></div><div class="lbl">${esc(it.label)}</div></div>`).join('')}</div>`
    : `<div class="stats">${ch.items.map((it, j) => `<div class="st" id="${id}b${j}"><div class="lbl">${esc(it.label)}</div><div class="val${it.gold ? ' gold' : ''}">${esc(it.value != null ? money(0, it.display) : it.display)}</div></div>`).join('')}</div>`;
  return `<div id="${id}" ${clipAttrs(c, 50 + k, 'clip split')}><div class="panel"><div class="acc"><div class="acc2"></div></div>
<div class="hdr"><span class="tag">${esc(p.tag)}</span>${p.note ? `<span class="note">${esc(p.note)}</span>` : ''}</div><div class="ttl">${esc(p.title)}</div>${body}</div></div>
<div id="${id}f" ${clipAttrs(c, 60 + k, 'clip sframe')}></div>`;
}).join('\n');

if (OU && outroOn) tweens.push(`tl.to('#outro',{opacity:1,duration:.4,ease:'power1.out'},${f3(OU.s)});`,
  `tl.fromTo('#outro img',{scale:.92,opacity:0},{scale:1,opacity:1,duration:.7,ease:'power3.out'},${f3(OU.s + 0.3)});`);

// layout per format; everything else (fonts, colors, motion) is shared
const L = PORTRAIT ? {
  origin: '540px 650px', capTop: 1395, pillTop: 205, pillFont: 38, hookTop: 1130, hookQ: 46, hookMax: 124,
  name: `left:${SAFE ? SAFE.x + 10 : 90}px;top:1130px`, nameN: 58, nameR: 30, emph: `left:${(WW - EMPH_W) / 2}px;top:${C.emphTop ?? 1020}px;width:${EMPH_W}px`, logo: 860,
} : {
  origin: '960px 340px', capTop: 905, pillTop: 56, pillFont: 30, hookTop: 640, hookQ: 38, hookMax: 108,
  name: 'left:110px;top:770px', nameN: 50, nameR: 24, emph: `right:70px;top:300px;width:${EMPH_W}px`, logo: 900,
};
const hookBig = C.hook ? fit(C.hook.big.split('\n').sort((a, b) => b.length - a.length)[0], L.hookMax, C.safe ? C.safe.w - 60 : WW - 120, 0.72) : 0;
// emphasis zooms push in on the speaker's face (crop-geom.json from track-face.py), since framing is fixed
const G = existsSync(here('./crop-geom.json')) ? JSON.parse(readFileSync(here('./crop-geom.json'))) : null;
const zoomOrigin = G?.faceX != null ? `${Math.round(G.faceX * WW)}px ${Math.round(G.faceY * HH)}px` : L.origin;

// "look": "premium" (user note 2026-11-18: "mas mukhang premium, hindi cheap"): frosted glass panels with hairline
// borders, refined Poppins (tracking, weight contrast, no thick outlines), thin red-to-gold accent lines
const GLASS = 'background:linear-gradient(180deg,rgba(24,24,28,.62),rgba(10,10,12,.62));backdrop-filter:blur(22px) saturate(1.2);-webkit-backdrop-filter:blur(22px) saturate(1.2);border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08)';
const GOLD = '#e8c27a', LINE = 'linear-gradient(90deg,' + RED + ',#d4462f 45%,' + '#e8c27a)';
const PREMIUM_CSS = `
#hook{font-family:Poppins,Arial,sans-serif}
#hook .in{display:inline-block;${GLASS};border-radius:30px;padding:30px 46px 38px}
#hook .q{background:none;padding:0;border-radius:0;font-weight:600;font-size:${Math.round(L.hookQ * 0.62)}px;letter-spacing:7px;color:${GOLD}}
#hook .big{color:#fff;-webkit-text-stroke:0;font-weight:800;letter-spacing:-1px;margin-top:14px;font-size:${Math.round(hookBig * 0.82)}px;text-shadow:0 10px 30px rgba(0,0,0,.35)}
#hook .sub{color:rgba(255,255,255,.85);font-weight:600;font-size:${Math.round(L.hookQ * 0.6)}px;letter-spacing:4px;margin-top:16px}
.emph .sl{font-weight:800}.emph .sl.gold{color:${GOLD}}
.emph .tt{font-weight:800}
#hook .big::after{content:'';display:block;width:120px;height:5px;border-radius:3px;margin:22px auto 0;background:${LINE}}
.pill span{${GLASS};font-family:Poppins,Arial,sans-serif;font-weight:600;font-size:${Math.round(L.pillFont * 0.72)}px;letter-spacing:5px;padding:14px 30px 14px 26px;border-radius:999px;color:#fff}
.pill span::before{content:'';display:inline-block;width:12px;height:12px;border-radius:50%;background:${RED};box-shadow:0 0 0 4px rgba(170,0,0,.25);margin-right:16px;vertical-align:2px}
.emph{font-family:Poppins,Arial,sans-serif}
.emph .box{${GLASS};border-radius:28px;padding:30px 40px 34px}
.emph .t{font-weight:800;letter-spacing:.5px;line-height:1.15}
.emph .bar{height:4px;width:110px;margin:20px auto 0;background:${LINE}}
.emph .big{color:#fff;-webkit-text-stroke:0;font-weight:800;letter-spacing:10px;text-shadow:0 18px 50px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.35)}
.emph .big::after{content:'';display:block;width:140px;height:6px;border-radius:3px;margin:16px auto 0;background:${LINE}}
.emph .word{font-weight:700;opacity:.8}
.emph .strike{height:5px;outline:none;background:${RED}}
.emph .done{background:none;border:1px solid rgba(232,194,122,.7);color:${GOLD};font-weight:700;letter-spacing:4px}
.split .panel{${GLASS};border-radius:32px;background:linear-gradient(180deg,rgba(22,22,26,.72),rgba(8,8,10,.72))}
.split .acc{height:3px;background:rgba(255,255,255,.08)}
.split .acc2{width:100%;background:${LINE}}
.split .tag{background:none;padding:0;color:${GOLD};font-weight:600;letter-spacing:5px;font-size:${PORTRAIT ? 22 : 19}px}
.split .tag::before{content:'';display:inline-block;width:10px;height:10px;border-radius:50%;background:${RED};margin-right:12px;vertical-align:2px}
.split .note{opacity:.6;letter-spacing:2px;font-weight:500}
.split .ttl{font-weight:700;letter-spacing:-.5px;margin-top:16px}
.split .st{background:none;border-radius:0;border-top:1px solid rgba(255,255,255,.1);padding:18px 4px}
.split .st .lbl{font-weight:500;letter-spacing:3px;opacity:.6;font-size:${PORTRAIT ? 22 : 19}px}
.split .st .val{font-weight:700}
.split .st .val.gold{color:${GOLD}}
.split .b .bar{background:linear-gradient(180deg,#c3132b,#6e0712);border-radius:12px 12px 0 0;box-shadow:inset 0 1px 0 rgba(255,255,255,.2)}
.split .b .bar.gold{background:linear-gradient(180deg,#f3d08a,#b88934)}
.split .b .val{font-weight:700}
.split .b .lbl{font-weight:500;letter-spacing:3px;opacity:.65;border-top:1px solid rgba(255,255,255,.18)}
.sframe{border:2px solid rgba(232,194,122,.9);border-radius:32px;box-shadow:0 0 0 1px rgba(0,0,0,.4),0 30px 80px rgba(0,0,0,.6)}
`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(C.title ?? 'Testimonial')}</title>
<script src="assets/gsap.min.js"></script>
<style>
*{box-sizing:border-box}html,body{margin:0;width:${WW}px;height:${HH}px;overflow:hidden;background:#000;font-family:Montserrat,Arial,sans-serif}
#reel{position:relative;width:${WW}px;height:${HH}px;overflow:hidden;background:#000}
#vframe{position:absolute;left:0;top:0;width:${WW}px;height:${HH}px;overflow:hidden;transform-origin:0 0;z-index:1}
#bgv{position:absolute;inset:0;opacity:0;overflow:hidden}
#bgv video{position:absolute;inset:-6%;width:112%;height:112%;object-fit:cover;filter:blur(36px) brightness(.45) saturate(1.1)}
.split{position:absolute;${SPL.panel};z-index:16}
.split .panel{position:relative;background:linear-gradient(180deg,rgba(22,22,26,.94),rgba(10,10,12,.94));border-radius:28px;padding:42px 44px 36px;overflow:hidden;
  box-shadow:0 30px 70px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06);font-family:Poppins,Arial,sans-serif}
.split .acc{position:absolute;left:0;right:0;top:0;height:9px;background:${RED}}
.split .acc2{position:absolute;left:0;top:0;bottom:0;width:26%;background:#f3c35b;transform-origin:left center}
.split .hdr{display:flex;align-items:center;justify-content:space-between;gap:20px}
.split .tag{display:inline-block;background:${RED};color:#fff;font-weight:800;font-size:${PORTRAIT ? 28 : 24}px;letter-spacing:1px;padding:8px 18px 9px;border-radius:12px}
.split .note{color:#fff;font-weight:600;font-size:${PORTRAIT ? 22 : 19}px}
.split .ttl{color:#fff;font-weight:800;font-size:${PORTRAIT ? 46 : 38}px;line-height:1.12;margin-top:20px;letter-spacing:-.5px}
.split .bars{display:flex;align-items:flex-end;justify-content:center;gap:${SAFE_CARDS ? 30 : PORTRAIT ? 70 : 44}px;margin-top:30px}
.split .b{display:flex;flex-direction:column;align-items:center;min-width:${SAFE_CARDS ? 160 : PORTRAIT ? 190 : 150}px}
.split .b .val{color:#fff;font-weight:800;font-size:${PORTRAIT ? 36 : 30}px;margin-bottom:10px;white-space:nowrap}
.split .b .bar{width:${PORTRAIT ? 150 : 120}px;background:${RED};border-radius:14px 14px 0 0;transform-origin:50% 100%}
.split .b .bar.gold,.split .val.gold{background:#f3c35b}
.split .b .lbl{align-self:stretch;text-align:center;border-top:3px solid rgba(255,255,255,.25);padding-top:12px;color:#fff;opacity:.85;font-weight:700;font-size:${PORTRAIT ? 24 : 20}px;letter-spacing:1px;white-space:nowrap}
.split .stats{margin-top:26px;display:flex;flex-direction:column;gap:16px}
.split .st{display:flex;align-items:center;justify-content:space-between;gap:24px;background:rgba(255,255,255,.06);border-radius:16px;padding:16px 24px}
.split .st .lbl{color:#fff;opacity:.85;font-weight:700;font-size:${PORTRAIT ? 26 : 22}px;letter-spacing:1px}
.split .st .val{color:#fff;font-weight:800;font-size:${PORTRAIT ? 40 : 32}px;white-space:nowrap}
.split .st .val.gold{background:none;color:#f3c35b}
.sframe{position:absolute;left:${SPL.card.x - 6}px;top:${SPL.card.y - 6}px;width:${SPL_W + 12}px;height:${SPL_H + 12}px;border:6px solid ${RED};border-radius:34px;z-index:2;
  box-shadow:0 0 0 2px rgba(243,195,91,.55),0 24px 60px rgba(0,0,0,.55);pointer-events:none}
#vwrap{position:absolute;inset:0;transform-origin:${zoomOrigin}}
#vwrap video{width:${WW}px;height:${HH}px;object-fit:cover;display:block}
.cap{position:absolute;${SAFE ? `left:${SAFE.x}px;width:${SAFE.w}px` : 'left:0;right:0'};top:${C.capTop ?? L.capTop}px;display:flex;justify-content:center;z-index:20}
.cap .line{font-family:Poppins,Arial,sans-serif;font-weight:700;font-size:42px;color:#fff;white-space:nowrap;line-height:1.1;
  text-shadow:0 3px 0 #000,0 4px 12px rgba(0,0,0,.9),0 0 6px rgba(0,0,0,.85)} /* solid black shadow (user note, 2026-11-18) */
.cap .kw{display:inline-block;transform-origin:50% 60%;font-weight:900;font-size:60px;color:${RED};text-transform:uppercase;letter-spacing:-1px;vertical-align:-4px;
  -webkit-text-stroke:5px #fff;paint-order:stroke fill;text-shadow:0 6px 22px rgba(0,0,0,.7)}
.cap.kin .line{display:flex;align-items:center;gap:14px;font-size:0}
.kin .kw-s,.kin .kw-b,.kin .kw-h{display:inline-block;opacity:0;line-height:1.1;text-shadow:0 3px 10px rgba(0,0,0,.8),0 1px 2px rgba(0,0,0,.6)}
.kin .kw-s{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:700;font-size:50px;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,.9),0 0 3px rgba(0,0,0,.8)}
.kin .kw-b{font-family:Poppins,Arial,sans-serif;font-weight:800;font-size:52px;color:#fff;letter-spacing:-.5px}
.kin .kw-h{position:relative;padding:2px 18px 8px;transform-origin:50% 60%}
.kin .kw-h .bx{position:absolute;inset:0;background:${RED};border-radius:12px;transform-origin:left center;box-shadow:0 10px 26px rgba(0,0,0,.45)}
.kin .kw-h .tx{position:relative;font-family:Poppins,Arial,sans-serif;font-weight:900;font-size:56px;color:#fff;text-transform:uppercase;letter-spacing:-1px;text-shadow:none}
.pill{position:absolute;top:${SAFE_CARDS ? Math.max(L.pillTop, SAFE_CARDS.y + 16) : L.pillTop}px;${SAFE_CARDS ? `left:${SAFE_CARDS.x}px;width:${SAFE_CARDS.w}px` : 'left:0;right:0'};display:flex;justify-content:center;z-index:15}
.pill span{background:${RED};color:#fff;font-weight:900;font-size:${L.pillFont}px;letter-spacing:3px;padding:12px 30px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.35);white-space:nowrap}
#hook{position:absolute;left:0;right:0;top:${C.hook?.top ?? L.hookTop}px;text-align:center;z-index:20}
#hook .q{display:inline-block;background:rgba(12,10,6,.66);color:#fff;font-weight:800;font-size:${L.hookQ}px;letter-spacing:2px;padding:10px 26px;border-radius:14px}
#hook .big{font-weight:900;font-size:${hookBig}px;color:${RED};letter-spacing:-2px;line-height:1;margin-top:16px;white-space:nowrap;-webkit-text-stroke:7px #fff;paint-order:stroke fill;text-shadow:0 8px 30px rgba(0,0,0,.75)}
#name{position:absolute;${L.name};z-index:18;padding:16px 28px 18px 30px;background:rgba(12,10,6,.7);border-radius:16px;border-left:9px solid ${RED}}
#name .n{color:#fff;font-weight:900;font-size:${SAFE && C.name ? Math.min(L.nameN, fit(C.name.name, L.nameN, SAFE.w - 90, 0.72)) : L.nameN}px;letter-spacing:1px;white-space:nowrap}
#name .r{color:#fff;opacity:.85;font-weight:800;font-size:${L.nameR}px;letter-spacing:2px;margin-top:4px}
.emph{position:absolute;${SAFE_CARDS ? `left:${SAFE_CARDS.x}px;top:${C.emphTop ?? 1215}px;width:${SAFE_CARDS.w}px` : L.emph};text-align:center;z-index:18}
.emph .box{background:rgba(12,10,6,.64);border-radius:18px;padding:24px 30px 28px}
.emph .t{color:#fff;font-weight:900;line-height:1.08;white-space:nowrap}
.emph .bar{height:10px;background:${RED};border-radius:6px;margin:18px auto 0;width:70%;transform-origin:left center}
.emph .word{position:relative;display:inline-block;color:#fff;font-weight:900;letter-spacing:1px;white-space:nowrap}
.emph .strike{position:absolute;left:-10px;right:-10px;top:52%;height:11px;background:${RED};outline:3px solid #fff;border-radius:6px;transform-origin:left center}
.emph .done{display:inline-block;margin-top:16px;background:${RED};color:#fff;font-weight:900;letter-spacing:2px;padding:10px 26px;border-radius:999px;white-space:nowrap}
.emph .big{display:inline-block;font-weight:900;color:${RED};-webkit-text-stroke:8px #fff;paint-order:stroke fill;text-shadow:0 10px 34px rgba(0,0,0,.7);white-space:nowrap}
#hook .sub{color:#fff;font-weight:700;font-size:${Math.round(L.hookQ * 0.7)}px;letter-spacing:2px;margin-top:14px}
.emph .sl{color:#fff;font-weight:900;line-height:1.12;white-space:nowrap}
.emph .sl.gold{color:#f3c35b}.emph .sl.dim{color:rgba(255,255,255,.55)}
.emph .ttl{padding:30px 40px 34px}
.emph .lab{color:#f3c35b;font-weight:700;font-size:${PORTRAIT ? 28 : 22}px;letter-spacing:6px;margin-bottom:10px}
.emph .tt{color:#fff;font-weight:900;font-size:${PORTRAIT ? 84 : 60}px;line-height:1.06;letter-spacing:-1px}
.emph .tw{display:inline-block}
.kin-card{position:absolute;left:0;right:0;z-index:19;text-align:center}
.kin-card .in{position:relative}
.kin-card .ksh{position:absolute;left:-120px;right:-120px;top:-180px;bottom:-200px;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,.55) 0%,rgba(0,0,0,.25) 45%,rgba(0,0,0,0) 72%);opacity:0}
.kin-card .kl{line-height:1.06;margin:.06em 0;white-space:nowrap}
.kin-card .ks,.kin-card .kh,.kin-card .kb{display:inline-block;opacity:0;vertical-align:middle;margin:0 .09em}
.kin-card .ks{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:700;font-size:.7em;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.55),0 4px 18px rgba(0,0,0,.85),0 0 4px rgba(0,0,0,.7)}
.kin-card .kh{font-family:Poppins,Arial,sans-serif;font-weight:800;font-size:1.12em;letter-spacing:-.02em;color:#fff;text-shadow:0 8px 30px rgba(0,0,0,.6)}
.kin-card .kh .ch{display:inline-block;white-space:pre}
.kin-card .kb{position:relative;padding:.02em .3em .12em;transform-origin:50% 60%}
.kin-card .kb .bx{position:absolute;inset:0;background:${RED};border-radius:.2em;transform-origin:left center;box-shadow:0 18px 50px rgba(0,0,0,.4)}
.kin-full{inset:0;z-index:30}
.kin-full .fbg{position:absolute;inset:0;overflow:hidden;opacity:0;background:radial-gradient(ellipse at 50% 40%,#3a0000 0%,#0d0000 75%)}
.kin-full .fbg i{position:absolute;border-radius:50%;filter:blur(90px)}
.kin-full .fb1{width:900px;height:900px;left:-200px;top:200px;background:#c00010;opacity:.85}
.kin-full .fb2{width:800px;height:800px;left:420px;top:900px;background:#7a0008;opacity:.9}
.kin-full .fb3{width:700px;height:700px;left:300px;top:-150px;background:#e0102a;opacity:.55}
.kin-full.light .fbg{background:#fff}.kin-full.light .fbg i{background:#ffd6d6;opacity:.55}
.kin-full .fwrap{position:absolute;display:flex;flex-direction:column;justify-content:center;align-items:center}
.kin-full .in{transform-origin:50% 50%}
.kin-full.light .ks{color:#2a2a2a;text-shadow:none}.kin-full.light .kh{color:${RED};text-shadow:none}
.kin-full.dark .kb .bx{background:#fff}.kin-full.dark .kb .tx{color:${RED}}
.kin-card .kb .tx{position:relative;font-family:Poppins,Arial,sans-serif;font-weight:800;font-size:1.04em;letter-spacing:-.02em;color:#fff}
#outro{position:absolute;inset:0;z-index:40;opacity:0;background:radial-gradient(ellipse at center,#1f1f23 0%,#0d0d0f 70%)}
#outro .in{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
#outro img{width:${L.logo}px;height:${L.logo}px;object-fit:contain}
${PREMIUM ? PREMIUM_CSS : ''}
</style></head><body>
<div id="reel" data-composition-id="reel" data-start="0" data-duration="${TOTAL}" data-width="${WW}" data-height="${HH}">
${splitCards.length ? `<div id="bgv"><video id="footage-bg" src="assets/${video}" data-start="0" data-duration="${DUR}" data-track-index="2" muted playsinline></video></div>` : ''}
<div id="vframe"><div id="vwrap"><video id="footage" src="assets/${video}" data-start="0" data-duration="${DUR}" data-track-index="0" muted playsinline></video></div></div>
${splitHtml}
<audio id="mix" src="assets/mix.wav" data-start="0" data-duration="${TOTAL}" data-track-index="1" data-volume="1"></audio>
${H ? `<div id="hook" ${clipAttrs(H, 3)}><div class="in"><div class="q">${esc(C.hook.q)}</div><div class="big">${C.hook.big.split('\n').map(esc).join('<br>')}</div>${C.hook.sub ? `<div class="sub">${esc(C.hook.sub)}</div>` : ''}</div></div>` : ''}
${N ? `<div id="name" ${clipAttrs(N, 4)}><div class="in"><div class="n">${esc(C.name.name)}</div><div class="r">${esc(C.name.role)}</div></div></div>` : ''}
${emphHtml}
${pillHtml}
${capHtml}
${OU && outroOn ? `<div id="outro" ${clipAttrs({ s: OU.s, d: TOTAL - OU.s }, 9)}><div class="in"><img src="assets/${esc(C.outro.logo)}" alt="logo"></div></div>` : ''}
</div>
<script>
const tl=gsap.timeline({paused:true});
${zoomCards.map((z) => `tl.to('#vwrap',{scale:1.1,duration:.5,ease:'power2.inOut'},${f3(z.s)});tl.to('#vwrap',{scale:1,duration:.5,ease:'power2.inOut'},${f3(Math.max(z.s + 0.5, z.s + z.d - 0.5))});`).join('\n')}
${tweens.join('\n')}
window.__timelines=window.__timelines||{};window.__timelines['reel']=tl;
</script></body></html>
`;
writeFileSync(here('../index.html'), html);
writeFileSync(here('./sfx-cues.json'), JSON.stringify({ duration: TOTAL, cues: outSfx }, null, 2));
console.log(`${C.format} [stage ${STAGE}]: ${zoomCards.length} zooms, ${emphCards.length} emphasis cards, outro ${outroOn ? OUTRO + 's' : 'off'}, ${outCaps.length} captions, ${outSfx.length} sfx, ${removed.size} cuts removed, ${DUR}s`);
