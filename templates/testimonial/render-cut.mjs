// Testimonial template: one-pass cut + fixed framing from edl.json -> cut.mp4 and voice.wav.
// Output 1920x1080 (landscape) or 1080x1920 (portrait) per testimonial.json; crop from crop-geom.json
// (track-face.py). Voice cleanup per my-rules.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const here = (p) => new URL(p, import.meta.url);
const C = JSON.parse(readFileSync(here('./testimonial.json'), 'utf8').replace(/^\uFEFF/, '')); // BOM-safe (Notepad)
const edl = JSON.parse(readFileSync(here('./edl.json')));
const G = JSON.parse(readFileSync(here('./crop-geom.json')));
// CUT_SCALE=2 writes cut-4k.mp4 at double size (2160x3840 / 3840x2160) for a 4K final; voice.wav is left as is
const SCALE = Number(process.env.CUT_SCALE ?? 1);
const OUT = SCALE > 1 ? 'cut-4k.mp4' : 'cut.mp4';
const [OW, OH] = (C.format === 'portrait' ? [1080, 1920] : [1920, 1080]).map((n) => n * SCALE);
const FADE = 0.008; // tiny audio fades so joins never click
const parts = [];
edl.pieces.forEach((p, i) => {
  const a = p.srcFrameIn / edl.fps, z = p.srcFrameOut / edl.fps, d = z - a;
  parts.push(`[0:v]trim=start_frame=${p.srcFrameIn}:end_frame=${p.srcFrameOut},setpts=PTS-STARTPTS[v${i}]`);
  parts.push(`[0:a]atrim=start=${a.toFixed(6)}:end=${z.toFixed(6)},asetpts=PTS-STARTPTS,afade=t=in:d=${FADE},afade=t=out:st=${(d - FADE).toFixed(6)}:d=${FADE}[a${i}]`);
});
const n = edl.pieces.length;
parts.push(`${edl.pieces.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${n}:v=1:a=1[cv][ca]`);
// fixed framing, no face tracking (my-rules): one crop that never moves (portrait), or the full frame (landscape)
const frame = `crop=${G.w}:${G.h}:${G.x ?? 0}:${G.y ?? 0},scale=${OW}:${OH}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${OW}:${OH}:(ow-iw)/2:(oh-ih)/2`;
// "keepColor": true leaves a footage the user already color-corrected as it is (no contrast/saturation lift)
parts.push(`[cv]${frame}${C.keepColor ? '' : ',eq=contrast=1.03:saturation=1.04'},unsharp=5:5:0.3[vo]`);
// voice cleanup (my-rules): rumble cut, FFT denoise, mud cut, presence lift, de-ess, compression.
// Noisy rooms (floor above about -60 dB) get the stronger denoise + soft gate used on Jane's video.
const noisy = (C.noisyRoom ?? false);
const denoise = noisy ? 'afftdn=nr=24:nf=-46:tn=1,agate=threshold=0.012:ratio=2:range=0.25:attack=5:release=250' : 'afftdn=nr=12:nf=-60:tn=1';
parts.push(`[ca]highpass=f=85,${denoise},equalizer=f=280:t=q:w=1.2:g=-2,equalizer=f=3200:t=q:w=1.0:g=1.5,deesser=i=0.35,acompressor=threshold=-20dB:ratio=2.5:attack=10:release=150,loudnorm=I=-16:TP=-2:LRA=9[ao]`);
writeFileSync(here('../review/cut.filter'), parts.join(';\n'));

const fps = String(edl.fps), gop = String(Math.round(edl.fps));
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', 'raw.mp4', '-/filter_complex', '../review/cut.filter',
  '-map', '[vo]', '-map', '[ao]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', fps, '-g', gop, '-keyint_min', gop, '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', OUT], { cwd: here('.'), stdio: 'inherit' });
if (r.status) process.exit(r.status);
if (SCALE === 1) spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', 'cut.mp4', '-vn', '-c:a', 'pcm_s16le', 'voice.wav'], { cwd: here('.'), stdio: 'inherit' });
console.log(`${OUT} (${OW}x${OH})${SCALE === 1 ? ' + voice.wav' : ''} written`);
