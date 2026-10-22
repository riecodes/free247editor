#!/usr/bin/env node
// Interactive edit timeline: one self-contained HTML page (tools/timeline-page.html) with the video on top
// and lanes below (story sections, cuts with thumbnails, cards, subtitles, SFX, voice and music waveforms).
// Click or drag the lanes to seek; the playhead follows playback. Local only: it shows private footage.
// tools/timeline-server.mjs serves the same page in edit mode (drag, trim, delete, Save, Re-render).
//
//   node tools/make-timeline.mjs <project-dir> --video <mp4> [--out <html>]
//
// Reads <project>/assets/{edl.json, cut.json, timeline-data.json, render-inputs.json, sfx-cues.json,
// cut.mp4, voice.wav, bed-music.wav}. All lanes are in base time (the full cut); removed cuts show hatched.
// Default output: <dir of video>/<slug>-timeline.html, so the page's relative <video src> resolves.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const run = (cmd, args, binary) => {
  const r = spawnSync(cmd, args, { maxBuffer: 1 << 28, windowsHide: true, encoding: binary ? 'buffer' : 'utf8' });
  if (r.error || r.status !== 0) throw new Error(`${cmd} failed: ${r.error?.message || String(r.stderr).trim().split('\n').pop()}`);
  return r.stdout;
};
const probe = (f) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));

// thumbnails and waveforms are slow to extract; cache them per file + mtime (the server reuses them)
const cache = new Map();
const cached = (f, tag, fn) => {
  const k = `${f}|${tag}|${existsSync(f) ? statSync(f).mtimeMs : 0}`;
  if (!cache.has(k)) cache.set(k, fn());
  return cache.get(k);
};
const thumbs = (f, times) => cached(f, times.join(','), () => times.map((t) => {
  const jpg = run('ffmpeg', ['-v', 'error', '-ss', t.toFixed(3), '-i', f, '-frames:v', '1',
    '-vf', 'scale=90:160', '-q:v', '7', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'], true);
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}));
const wave = (f, maxT) => (!existsSync(f) ? null : cached(f, `wave${maxT}`, () => {
  const pcm = run('ffmpeg', ['-v', 'error', '-i', f, '-t', String(maxT), '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], true);
  const step = 400, peaks = []; // peak per 50 ms, 0..1
  for (let i = 0; i + 2 <= pcm.length; i += step * 2) {
    let m = 0;
    for (let j = i; j < Math.min(i + step * 2, pcm.length - 1); j += 2) m = Math.max(m, Math.abs(pcm.readInt16LE(j)));
    peaks.push(+(m / 32768).toFixed(3));
  }
  return peaks;
}));

export function buildData(projectDir, videoPath, { editor = false, videoUrl } = {}) {
  const project = resolve(projectDir), slug = basename(project), video = resolve(videoPath);
  const asset = (f) => join(project, 'assets', f);
  const json = (f) => (existsSync(asset(f)) ? JSON.parse(readFileSync(asset(f), 'utf8')) : null);
  const edl = json('edl.json');
  if (!edl) throw new Error(`No assets/edl.json in ${project}`);
  const base = +(edl.totalFrames / edl.fps).toFixed(3);
  const td = json('timeline-data.json');
  const ri = json('render-inputs.json');

  const pieces = edl.pieces.map((p, i) => ({
    i, label: p.label, note: p.note, start: p.outStart, end: p.outEnd,
    srcStart: p.srcFrameIn / edl.fps, srcEnd: p.srcFrameOut / edl.fps,
  }));
  const sections = [];
  for (const p of pieces) {
    const last = sections[sections.length - 1];
    if (last && last.label === p.label) last.end = p.end;
    else sections.push({ label: p.label, note: p.note, start: p.start, end: p.end });
  }
  // thumbnails from the full cut (base time), so removed cuts still show what they were
  const thumbSrc = existsSync(asset('cut.mp4')) ? asset('cut.mp4') : video;
  thumbs(thumbSrc, pieces.map((p) => Math.min(base - 0.05, (p.start + p.end) / 2))).forEach((t, k) => { pieces[k].thumb = t; });

  let captions = td?.captions, sfx = td?.sfx, cards = td?.cards ?? [];
  if (!captions) { // older projects: group the cut transcript in threes
    const words = json('cut.json')?.words ?? [];
    captions = [];
    for (let i = 0; i < words.length; i += 3) {
      const g = words.slice(i, i + 3);
      captions.push({ start: g[0].start, end: g[g.length - 1].end, text: g.map((w) => w.text).join(' ') });
    }
  }
  if (!sfx) sfx = (json('sfx-cues.json')?.cues ?? []).map((c) => ({ t: c.t, file: c.file ?? c.kind, gain: c.gain ?? -17 }));

  const renderedRemoved = ri?.key ? ri.key.split(',').map(Number) : [];
  const editsFile = asset('timeline-edits.json'), riFile = asset('render-inputs.json');
  const pending = existsSync(editsFile) && existsSync(riFile) && statSync(editsFile).mtimeMs > statSync(riFile).mtimeMs;
  const m = basename(video).match(/-(v\d+|final)\.mp4$/i);
  return {
    slug, label: m ? m[1] : basename(video), editor, pending,
    duration: base, outDuration: probe(video),
    video: videoUrl ?? relative(dirname(video), video).split('\\').join('/'),
    pieces, sections, captions, cards, sfx,
    removed: td?.removedPieces ?? renderedRemoved, renderedRemoved,
    bedGain: td?.bedGain ?? null, bedDefault: -1,
    defaultSfxFile: sfx[1]?.file ?? sfx[0]?.file ?? '',
    voice: wave(asset('voice.wav'), base), music: wave(asset('bed-music.wav'), base),
  };
}

export function buildPage(data) {
  const tpl = readFileSync(join(here, 'timeline-page.html'), 'utf8');
  return tpl.replace('/*__DATA__*/null', JSON.stringify(data).replace(/</g, '\\u003c'));
}

// CLI: static, view-only page next to the video
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values: opts, positionals: [projectArg] } = parseArgs({
    allowPositionals: true,
    options: { video: { type: 'string' }, out: { type: 'string' } },
  });
  if (!projectArg || !opts.video || !existsSync(projectArg) || !existsSync(opts.video)) {
    console.error('Usage: node tools/make-timeline.mjs <project-dir> --video <mp4> [--out <html>]');
    process.exit(1);
  }
  const out = resolve(opts.out || join(dirname(resolve(opts.video)), `${basename(resolve(projectArg))}-timeline.html`));
  const data = buildData(projectArg, opts.video, { videoUrl: relative(dirname(out), resolve(opts.video)).split('\\').join('/') });
  const html = buildPage(data);
  writeFileSync(out, html);
  console.log(`Timeline: ${out} (${(html.length / 1024).toFixed(0)} KB, ${data.pieces.length} cuts, ${data.captions.length} subtitles, ${data.cards.length} cards, ${data.sfx.length} sfx)`);
}
