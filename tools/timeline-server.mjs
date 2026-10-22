#!/usr/bin/env node
// Local timeline editor for one project: serves the timeline page in edit mode on http://localhost:<port>.
// Save writes <project>/assets/timeline-edits.json. Re-render runs build-comp -> prep-music -> mix-audio ->
// HyperFrames draft render, copies it to outbox/<slug>-vN.mp4, refreshes the static timeline, and the page reloads.
// Binds to 127.0.0.1 only; everything stays on this computer.
//
//   node tools/timeline-server.mjs <project-dir> [--port 4321]
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync, createReadStream, readdirSync, copyFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildData, buildPage } from './make-timeline.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: opts, positionals: [projectArg] } = parseArgs({ allowPositionals: true, options: { port: { type: 'string', default: '4321' } } });
if (!projectArg || !existsSync(join(projectArg, 'assets', 'edl.json'))) {
  console.error('Usage: node tools/timeline-server.mjs <project-dir> [--port 4321]');
  process.exit(1);
}
const project = resolve(projectArg), slug = basename(project), assets = join(project, 'assets');
const outbox = join(root, 'outbox'), sounds = join(root, 'my-sounds');
const AUDIO = /\.(mp3|wav|aiff?|m4a|ogg)$/i;

// version counter: assets/versions.json {last: N}; drafts go to outbox/<slug>-v<N>.mp4
const versionsFile = join(assets, 'versions.json');
const lastVersion = () => (existsSync(versionsFile) ? JSON.parse(readFileSync(versionsFile, 'utf8')).last : 0);
const currentVideo = () => {
  const v = join(outbox, `${slug}-v${lastVersion()}.mp4`), f = join(outbox, `${slug}-final.mp4`);
  if (existsSync(v) && (!existsSync(f) || statSync(v).mtimeMs >= statSync(f).mtimeMs)) return v;
  return existsSync(f) ? f : v;
};

const sendFile = (req, res, file, type) => {
  const size = statSync(file).size, m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const s = m[1] ? +m[1] : 0, e = m[2] ? Math.min(+m[2], size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
    createReadStream(file, { start: s, end: e }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    createReadStream(file).pipe(res);
  }
};
const inside = (dir, p) => { const f = resolve(dir, p); return f.startsWith(dir + sep) && existsSync(f) && statSync(f).isFile() ? f : null; };
const listSounds = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? listSounds(join(dir, d.name), base) : AUDIO.test(d.name) ? [relative(base, join(dir, d.name)).split(sep).join('/')] : []).sort();

// ---------- render pipeline ----------
let job = { state: 'idle', step: '', log: '' };
const step = (name, cmd, args, cwd) => new Promise((ok, fail) => {
  job.step = name;
  const p = spawn(cmd, args, { cwd, shell: process.platform === 'win32' && cmd === 'npx', windowsHide: true });
  const tail = (b) => { job.log = (job.log + b.toString()).slice(-4000); };
  p.stdout.on('data', tail); p.stderr.on('data', tail);
  p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`${name} failed (exit ${code})`))));
});
async function render() {
  job = { state: 'running', step: 'starting', log: '' };
  try {
    const n = lastVersion() + 1, draft = `renders/draft-v${n}.mp4`;
    await step('pag-apply ng edits', 'node', ['build-comp.mjs'], assets);
    await step('music', 'node', ['prep-music.mjs'], assets);
    await step('audio mix', 'node', ['mix-audio.mjs'], assets);
    await step('video render (~1-2 min)', 'npx', ['hyperframes', 'render', '--quality', 'draft', '--output', draft], project);
    job.step = 'outbox';
    const out = join(outbox, `${slug}-v${n}.mp4`);
    copyFileSync(join(project, draft), out);
    writeFileSync(versionsFile, JSON.stringify({ last: n }, null, 2));
    const staticOut = join(outbox, `${slug}-timeline.html`);
    writeFileSync(staticOut, buildPage(buildData(project, out, { videoUrl: basename(out) })));
    job = { state: 'done', step: `v${n}`, log: job.log, video: out };
    console.log(`Rendered ${out}`);
  } catch (e) {
    job = { ...job, state: 'error', step: `${job.step}: ${e.message}` };
    console.error(job.step, '\n', job.log.slice(-800));
  }
}

// ---------- http ----------
const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => ok(b)); });
const sendJson = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      const video = currentVideo();
      if (!existsSync(video)) { res.writeHead(404); return res.end(`No rendered video yet for ${slug} in outbox/.`); }
      if (job.state === 'done') job = { state: 'idle', step: '', log: '' };
      const html = buildPage(buildData(project, video, { editor: true, videoUrl: `/media/${encodeURIComponent(basename(video))}?v=${statSync(video).mtimeMs}` }));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
      const f = inside(outbox, decodeURIComponent(url.pathname.slice(7)));
      if (!f || extname(f).toLowerCase() !== '.mp4') { res.writeHead(404); return res.end(); }
      return sendFile(req, res, f, 'video/mp4');
    }
    if (req.method === 'GET' && url.pathname === '/api/sounds') return sendJson(res, 200, listSounds(sounds));
    if (req.method === 'GET' && url.pathname === '/api/sound') {
      const f = inside(sounds, url.searchParams.get('f') || '');
      if (!f || !AUDIO.test(f)) { res.writeHead(404); return res.end(); }
      return sendFile(req, res, f, /\.wav$/i.test(f) ? 'audio/wav' : 'audio/mpeg');
    }
    if (req.method === 'POST' && url.pathname === '/api/edits') {
      const e = JSON.parse(await body(req));
      const okShape = Array.isArray(e.captions) && Array.isArray(e.sfx) && Array.isArray(e.removedPieces) && typeof e.cards === 'object';
      if (!okShape) return sendJson(res, 400, { error: 'bad edits' });
      for (const c of e.sfx) if (!inside(sounds, c.file || '')) return sendJson(res, 400, { error: `sound not found in my-sounds: ${c.file}` });
      writeFileSync(join(assets, 'timeline-edits.json'), JSON.stringify(e, null, 2));
      await step('save', 'node', ['build-comp.mjs', '--data-only'], assets).catch((err) => { throw err; });
      job.step = '';
      return sendJson(res, 200, { ok: true });
    }
    if (url.pathname === '/api/render') {
      if (req.method === 'GET') return sendJson(res, 200, { state: job.state, step: job.step });
      if (job.state === 'running') return sendJson(res, 409, { error: 'already rendering' });
      render();
      return sendJson(res, 202, { ok: true });
    }
    res.writeHead(404); res.end();
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}).listen(Number(opts.port), '127.0.0.1', () => console.log(`Timeline editor for ${slug}: http://localhost:${opts.port}`));
