#!/usr/bin/env node
// Free stock B-roll from Pexels and Pixabay (both free to use, no attribution required; we still keep credits).
//   node tools/stock.mjs search "real estate house keys" [--source pexels|pixabay|both] [--orientation portrait|landscape] [--n 6]
//   node tools/stock.mjs get pexels:1234567 --out kit/video-projects/<slug>/assets/broll/house.mp4 [--max 1920]
// Keys (free) go in .env, never in chat or in code: PEXELS_API_KEY (pexels.com/api) and/or PIXABAY_API_KEY
// (pixabay.com/api/docs). "search" only lists results; "get" downloads one file, so the user okays each download
// (file name, source page, size) before it runs. Every download is logged in <out dir>/broll-credits.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(root, '.env')); } catch {}
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [cmd, query] = args;
const PEXELS = process.env.PEXELS_API_KEY, PIXABAY = process.env.PIXABAY_API_KEY;
const mb = (n) => (n ? `${(n / 1048576).toFixed(1)} MB` : 'size ?');
const die = (m) => { console.error(m); process.exit(1); };

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) die(`${new URL(url).host} answered ${r.status} ${r.statusText}`);
  return r.json();
}
// the best file not wider/taller than --max on its long side, preferring H.264 mp4
const pickPexels = (v, max) => v.video_files.filter((f) => f.file_type === 'video/mp4' && Math.max(f.width, f.height) <= max)
  .sort((a, b) => b.width * b.height - a.width * a.height)[0];
const pickPixabay = (h, max) => ['large', 'medium', 'small', 'tiny'].map((k) => h.videos[k]).filter((f) => f?.url && Math.max(f.width, f.height) <= max)[0];

async function pexels(q, orientation, n) {
  const u = new URL('https://api.pexels.com/videos/search');
  u.search = new URLSearchParams({ query: q, per_page: String(n), ...(orientation ? { orientation } : {}) });
  const j = await getJson(u, { Authorization: PEXELS });
  return j.videos.map((v) => ({ id: `pexels:${v.id}`, seconds: v.duration, size: `${v.width}x${v.height}`, by: v.user?.name, page: v.url }));
}
async function pixabay(q, orientation, n) {
  const u = new URL('https://pixabay.com/api/videos/');
  u.search = new URLSearchParams({ key: PIXABAY, q, per_page: String(Math.max(3, n)), safesearch: 'true' });
  const j = await getJson(u);
  return j.hits
    .filter((h) => !orientation || (orientation === 'portrait') === (h.videos.large?.height > h.videos.large?.width))
    .slice(0, n)
    .map((h) => ({ id: `pixabay:${h.id}`, seconds: h.duration, size: `${h.videos.large?.width}x${h.videos.large?.height}`, by: h.user, page: h.pageURL, bytes: h.videos.large?.size }));
}

if (cmd === 'search') {
  if (!query) die('usage: node tools/stock.mjs search "<words>" [--source pexels|pixabay|both] [--orientation portrait|landscape] [--n 6]');
  const src = flag('source', 'both'), orientation = flag('orientation'), n = Number(flag('n', 6));
  const want = { pexels: src !== 'pixabay', pixabay: src !== 'pexels' };
  if (want.pexels && !PEXELS && want.pixabay && !PIXABAY) die('No stock key: add PEXELS_API_KEY and/or PIXABAY_API_KEY to .env (both are free).');
  const rows = [];
  if (want.pexels && PEXELS) rows.push(...await pexels(query, orientation, n));
  if (want.pixabay && PIXABAY) rows.push(...await pixabay(query, orientation, n));
  if (!rows.length) console.log('No results.');
  for (const r of rows) console.log(`${r.id.padEnd(18)} ${String(r.seconds).padStart(3)} s  ${r.size.padEnd(10)} ${r.bytes ? mb(r.bytes).padEnd(9) : ''} by ${r.by ?? '?'}  ${r.page}`);
} else if (cmd === 'get') {
  const id = query, out = flag('out'), max = Number(flag('max', 1920));
  if (!id || !out) die('usage: node tools/stock.mjs get pexels:<id>|pixabay:<id> --out <assets/broll/name.mp4> [--max 1920]');
  const [src, num] = id.split(':');
  let file, credit;
  if (src === 'pexels') {
    if (!PEXELS) die('PEXELS_API_KEY is not set in .env');
    const v = await getJson(`https://api.pexels.com/videos/videos/${num}`, { Authorization: PEXELS });
    file = pickPexels(v, max);
    credit = { source: 'Pexels', page: v.url, author: v.user?.name, authorUrl: v.user?.url, license: 'Pexels License (free to use, no attribution required)' };
  } else if (src === 'pixabay') {
    if (!PIXABAY) die('PIXABAY_API_KEY is not set in .env');
    const j = await getJson(`https://pixabay.com/api/videos/?${new URLSearchParams({ key: PIXABAY, id: num })}`);
    const h = j.hits?.[0] ?? die(`pixabay:${num} not found`);
    const f = pickPixabay(h, max);
    file = f && { link: f.url, width: f.width, height: f.height };
    credit = { source: 'Pixabay', page: h.pageURL, author: h.user, license: 'Pixabay Content License (free to use, no attribution required)' };
  } else die('the id must look like pexels:123 or pixabay:123');
  if (!file) die(`no mp4 of ${id} at or under ${max}px`);
  const host = new URL(file.link).host;
  if (!/(^|\.)(pexels\.com|pixabay\.com)$/.test(host)) die(`refusing a download from an unexpected host: ${host}`);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  const r = await fetch(file.link);
  if (!r.ok) die(`download failed: ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(out));
  const log = join(dirname(resolve(out)), 'broll-credits.json');
  const all = existsSync(log) ? JSON.parse(readFileSync(log, 'utf8')) : [];
  all.push({ file: out.split(/[\\/]/).pop(), id, ...credit, size: `${file.width}x${file.height}`, downloaded: new Date().toISOString().slice(0, 10) });
  writeFileSync(log, JSON.stringify(all, null, 2));
  console.log(`${out} (${file.width}x${file.height}) from ${credit.page}; credits in ${log}`);
} else {
  die('usage: node tools/stock.mjs search "<words>" ... | get <source:id> --out <file>');
}
