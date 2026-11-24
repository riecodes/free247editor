// Content template: light copies of the B-roll clips in content.json "broll" -> broll/_prep/<name>.mp4
// (H.264, 30 fps, no audio, already cropped to the frame they fill), so the render stays fast whatever the source is
// (4K HEVC phone clips, stock files). build-comp.mjs uses the copy when it exists. Images are used as they are.
//   node prep-broll.mjs        (run from assets/, after editing "broll")
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const C = JSON.parse(readFileSync('content.json', 'utf8').replace(/^﻿/, ''));
const PORTRAIT = C.format !== 'landscape';
const [WW, HH] = PORTRAIT ? [1080, 1920] : [1920, 1080];
const SAFE = PORTRAIT ? C.safe : null;
mkdirSync('broll/_prep', { recursive: true });
for (const b of C.broll ?? []) {
  if (/\.(jpe?g|png|webp)$/i.test(b.file)) continue;
  if (!existsSync(b.file)) { console.error(`missing B-roll file: assets/${b.file}`); process.exitCode = 1; continue; }
  const out = `broll/_prep/${b.file.split('/').pop().replace(/\.[^.]+$/, '')}.mp4`;
  if (existsSync(out) && statSync(out).mtimeMs > statSync(b.file).mtimeMs) { console.log(`${out} (up to date)`); continue; }
  // 'full' fills the frame; 'frame' fills the 16:9 window (rendered 1.5x for a sharp push-in)
  const fw = SAFE ? SAFE.w : WW - 180;
  const [w, h] = (b.mode ?? 'full') === 'full' ? [WW, HH] : [Math.round(fw * 1.5 / 2) * 2, Math.round(fw * 1.5 * 9 / 16 / 2) * 2];
  const vf = (b.fit ?? 'cover') === 'cover'
    ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
    : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', b.file, '-an', '-vf', `${vf},fps=30,format=yuv420p`, '-c:v', 'libx264',
    '-preset', 'medium', '-crf', '19', '-g', '30', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
  console.log(`${out} (${w}x${h})`);
}
