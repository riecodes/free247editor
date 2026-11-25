// Personal-brand template: one-pass cut + fixed framing from edl.json -> cut.mp4 and voice.wav.
// Output 1920x1080 (landscape) or 1080x1920 (portrait) per brand.json; crop from crop-geom.json
// (track-face.py). Voice cleanup per my-rules.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const here = (p) => new URL(p, import.meta.url);
const C = JSON.parse(readFileSync(here('./brand.json'), 'utf8').replace(/^\uFEFF/, '')); // BOM-safe (Notepad)
const edl = JSON.parse(readFileSync(here('./edl.json')));
const G = JSON.parse(readFileSync(here('./crop-geom.json')));
// CUT_SCALE=2 writes cut-4k.mp4 at double size (2160x3840 / 3840x2160) for a 4K final; voice.wav is left as is
const SCALE = Number(process.env.CUT_SCALE ?? 1);
const OUT = SCALE > 1 ? 'cut-4k.mp4' : 'cut.mp4';
const [OW, OH] = (C.format === 'portrait' ? [1080, 1920] : [1920, 1080]).map((n) => n * SCALE);
// audio fades at every join: 8 ms stops clicks; "joinFade": 0.03 also softens a breath or room tone change (user note 2026-11-24)
const FADE = C.joinFade ?? 0.008;
const parts = [];
edl.pieces.forEach((p, i) => {
  const a = p.srcFrameIn / edl.fps, z = p.srcFrameOut / edl.fps, d = z - a;
  // per-section crop (crop-geom.json sectionX): each story section stays centered on the speaker, fixed within it
  const sx = G.pieceX?.[i] ?? G.sectionX?.[p.label];
  // "reframe": "smooth": crop x follows the smoothed face track (pieceTrack keys [t, x]), linear between keys
  const keys = G.pieceTrack?.[i];
  const lerp = (k) => k.length === 1 ? String(k[0][1]) : k.slice(0, -1).reduceRight((acc, [t0, x0], j) => {
    const [t1, x1] = k[j + 1];
    return `if(lt(t,${t1}),${x0}+(${x1 - x0})*(t-${t0})/${(t1 - t0).toFixed(3)},${acc})`;
  }, String(k[k.length - 1][1]));
  const cx = keys?.length ? `'${lerp(keys)}'` : (sx ?? G.x ?? 0);
  const crop = G.sectionX ? `,crop=${G.w}:${G.h}:${cx}:${G.y ?? 0}` : '';
  parts.push(`[0:v]trim=start_frame=${p.srcFrameIn}:end_frame=${p.srcFrameOut},setpts=PTS-STARTPTS${crop}[v${i}]`);
  parts.push(`[0:a]atrim=start=${a.toFixed(6)}:end=${z.toFixed(6)},asetpts=PTS-STARTPTS,afade=t=in:d=${FADE},afade=t=out:st=${(d - FADE).toFixed(6)}:d=${FADE}[a${i}]`);
});
const n = edl.pieces.length;
parts.push(`${edl.pieces.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${n}:v=1:a=1[cv][ca]`);
// "lcuts": [{ at: 'section:<label>' | output seconds, seconds, from: raw seconds }] (user note 2026-11-24: "i-J-cut ... yung
// part na tumingin siya sa baba"): for `seconds` from `at`, show other raw footage (usually the end of the shot before,
// where she still looks at the camera) while her voice goes on: an L-cut that hides a look-away at the start of a take
let vIn = 'cv';
(C.lcuts ?? []).forEach((l, k) => {
  const at = typeof l.at === 'string' && l.at.startsWith('section:') ? edl.pieces.find((p) => p.label === l.at.slice(8)).outStart : Number(l.at);
  const crop = G.sectionX ? `,crop=${G.w}:${G.h}:${G.x ?? 0}:${G.y ?? 0}` : '';
  parts.push(`[0:v]trim=start=${Number(l.from).toFixed(3)}:duration=${Number(l.seconds).toFixed(3)},setpts=PTS-STARTPTS+${at.toFixed(3)}/TB${crop}[lc${k}]`);
  parts.push(`[${vIn}][lc${k}]overlay=enable='between(t,${at.toFixed(3)},${(at + Number(l.seconds) - 0.001).toFixed(3)})'[cvl${k}]`);
  vIn = `cvl${k}`;
});
// fixed framing, no face tracking (my-rules): one crop that never moves (portrait), or the full frame (landscape)
const frame = `${G.sectionX ? '' : `crop=${G.w}:${G.h}:${G.x ?? 0}:${G.y ?? 0},`}scale=${OW}:${OH}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${OW}:${OH}:(ow-iw)/2:(oh-ih)/2`;
// "keepColor": true leaves a footage the user already color-corrected as it is (no contrast/saturation lift)
parts.push(`[${vIn}]${frame}${C.keepColor ? '' : ',eq=contrast=1.03:saturation=1.04'},unsharp=5:5:0.3[vo]`);
// voice cleanup (my-rules): rumble cut, FFT denoise, mud cut, presence lift, de-ess, compression.
// Noisy rooms (floor above about -60 dB) get the stronger denoise + soft gate used on an earlier noisy-room testimonial.
const noisy = (C.noisyRoom ?? false);
// "cleanVoice": "medium" (user note 2026-11-24 "palinis ng audio"): more denoise and a soft gate that lowers room tone and
// breaths between words by half, without the pumping of the noisy-room setting
const medium = C.cleanVoice === 'medium';
const denoise = medium ? 'afftdn=nr=18:nf=-55:tn=1,agate=threshold=0.006:ratio=1.6:range=0.5:attack=8:release=220' : noisy ? 'afftdn=nr=24:nf=-46:tn=1,agate=threshold=0.012:ratio=2:range=0.25:attack=5:release=250' : 'afftdn=nr=12:nf=-60:tn=1';
parts.push(`[ca]highpass=f=85,${denoise},equalizer=f=280:t=q:w=1.2:g=-2,equalizer=f=3200:t=q:w=1.0:g=1.5,deesser=i=0.35,acompressor=threshold=-20dB:ratio=2.5:attack=10:release=150,loudnorm=I=-16:TP=-2:LRA=9[ao]`);
writeFileSync(here('../review/cut.filter'), parts.join(';\n'));

// the cut is always written at 30 fps (the render's rate): a 24 fps phone clip made every rendered frame seek, and a
// 90 s draft took 39 min instead of a few (2026-11-24)
const fps = String(C.outFps ?? 30), gop = String(Math.round(Number(fps)));
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', 'raw.mp4', '-/filter_complex', '../review/cut.filter',
  '-map', '[vo]', '-map', '[ao]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', fps, '-g', gop, '-keyint_min', gop, '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', OUT], { cwd: here('.'), stdio: 'inherit' });
if (r.status) process.exit(r.status);
if (SCALE === 1) spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', 'cut.mp4', '-vn', '-c:a', 'pcm_s16le', 'voice.wav'], { cwd: here('.'), stdio: 'inherit' });
console.log(`${OUT} (${OW}x${OH})${SCALE === 1 ? ' + voice.wav' : ''} written`);
