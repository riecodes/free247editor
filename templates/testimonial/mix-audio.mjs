// Mixes the voice + SFX from the user's my-sounds/ packs + a ducked music bed -> mix.wav.
// Each SFX is aligned by its audible onset (leading silence measured), so the hit lands on the cue.
// Voice file and music level come from render-inputs.json (build-comp.mjs, which applies timeline edits).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, sep } from 'node:path';

const SOUNDS = resolve('../../../../my-sounds');
const R = existsSync('render-inputs.json') ? JSON.parse(readFileSync('render-inputs.json')) : {};
const C = existsSync('testimonial.json') ? JSON.parse(readFileSync('testimonial.json', 'utf8').replace(/^\uFEFF/, '')) : {};
const VOICE = R.voice || 'voice.wav';
const BED = process.env.BED || 'bed-music.wav'; // from prep-music.mjs (testimonial.json "music")
// dB on the -20 LUFS bed before ducking; -1 = halved on note "hinaan mo pa ng kalahati" (~19 dB under the voice).
// The timeline editor's music slider overrides it via render-inputs.json.
// dB on the -20 LUFS bed before ducking. Tune testimonial.json "bedGain" per track so the bed sits about
// 19-20 dB under the voice while speaking (my-rules; Success Story -1, Moving Up -2.5). The editor's slider overrides it.
const BED_GAIN = Number(process.env.BED_GAIN ?? R.bedGain ?? C.bedGain ?? -2);
const SFX_TRIM = Number(process.env.SFX_TRIM ?? C.sfxTrim ?? 3); // dB added to every cue's gain (+3 dB on v4 note "laksan mo ng konti"); testimonial.json "sfxTrim" overrides
const NO_BED = C.music === false; // "music": false = voice + SFX only, no music bed (user note 2026-11-18)
const SFX_PEAK = -3; // every SFX file is peak-normalized to this first, so cue gains mean the same across packs
const BED_STEM = process.env.BED_STEM;               // optional: also write the ducked bed alone, for level checks

const ff = (args, capture) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8', stdio: capture ? 'pipe' : ['ignore', 'inherit', 'inherit'] });
  if (r.status) { console.error(r.stderr); process.exit(r.status); }
  return r.stderr;
};
const onset = (f) => { // seconds of leading silence
  const err = ff(['-i', f, '-af', 'silencedetect=noise=-40dB:d=0.01', '-f', 'null', '-'], true);
  const m = err.match(/silence_start: (-?[\d.]+)[\s\S]*?silence_end: ([\d.]+)/);
  return m && Number(m[1]) <= 0.01 ? Number(m[2]) : 0;
};
const peak = (f, len = 2.5) => Number(ff(['-i', f, '-af', `atrim=0:${len},volumedetect`, '-f', 'null', '-'], true).match(/max_volume: (-?[\d.]+) dB/)[1]);

const { duration, cues } = JSON.parse(readFileSync('sfx-cues.json'));
// steps 2-3 of the step-by-step review: voice only (no music, no SFX yet), padded to the full length
if (process.argv.includes('--voice-only')) {
  ff(['-i', VOICE, '-af', `aformat=sample_rates=48000:channel_layouts=stereo,apad=whole_dur=${duration},loudnorm=I=-14:TP=-2:LRA=9,aresample=48000,atrim=0:${duration}`,
    '-c:a', 'pcm_s16le', 'mix.wav'], true);
  console.log('mix.wav written (voice only)');
  process.exit(0);
}
const used = {};
const inputs = NO_BED ? ['-i', VOICE] : ['-i', VOICE, '-i', BED];
const SFX0 = NO_BED ? 1 : 2; // input index of the first SFX
const chains = [];
cues.forEach((c, i) => {
  const f = resolve(SOUNDS, c.file);
  if (!f.startsWith(SOUNDS + sep) || !existsSync(f)) { console.error(`missing or outside my-sounds: ${c.file}`); process.exit(1); }
  const len = c.len ?? 2.5; // "len" lets risers and stingers run longer; "pre" starts them before the cue time
  used[c.file + len] ??= { onset: c.pre ? 0 : onset(f), peakDb: peak(f, len) };
  const u = used[c.file + len];
  inputs.push('-i', f);
  const ms = Math.max(0, Math.round((c.t - (c.pre ?? 0) - u.onset) * 1000));
  const gain = SFX_PEAK - u.peakDb + c.gain + SFX_TRIM;
  chains.push(`[${i + SFX0}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${len},afade=t=out:st=${(len - 0.4).toFixed(2)}:d=0.4,volume=${gain.toFixed(2)}dB,adelay=${ms}|${ms}[s${i}]`);
});
// voice padded to the full length so the mix (and music) runs through the logo end screen
chains.push(`[0:a]aformat=sample_rates=48000:channel_layouts=stereo,apad=whole_dur=${duration}${NO_BED ? '[v]' : ',asplit=2[v][key]'}`);
if (!NO_BED) chains.push(`[1:a]aformat=sample_rates=48000:channel_layouts=stereo,acompressor=threshold=0.1:ratio=3:attack=3:release=120,volume=${BED_GAIN}dB,atrim=0:${duration}[bedraw]`);
if (!NO_BED) chains.push(`[bedraw][key]sidechaincompress=threshold=0.03:ratio=4:attack=80:release=600:makeup=1${BED_STEM ? ',asplit=2[bed][bedstem]' : '[bed]'}`);
chains.push(`[v]${NO_BED ? '' : '[bed]'}${cues.map((_, i) => `[s${i}]`).join('')}amix=inputs=${cues.length + SFX0}:normalize=0:duration=first,loudnorm=I=-14:TP=-2:LRA=9,aresample=48000,apad=whole_dur=${duration},atrim=0:${duration}[out]`);
ff([...inputs, '-filter_complex', chains.join(';'), '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le', 'mix.wav',
  ...(BED_STEM && !NO_BED ? ['-map', '[bedstem]', '-c:a', 'pcm_s16le', BED_STEM] : [])], true);
writeFileSync('sfx-provenance.json', JSON.stringify({
  bed: NO_BED ? null : BED, bedSource: NO_BED ? null : `my-sounds/${C.music ?? '?'}`,
  bedGainDb: BED_GAIN, voice: VOICE, sfxPeakDb: SFX_PEAK, sfx: used,
}, null, 2));
console.log('mix.wav written');
