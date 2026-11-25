// Prepares a music track from my-sounds/ as the bed: trim from START to the video length, fade in/out,
// loudness-normalize to -20 LUFS so BED_GAIN in mix-audio.mjs means the same for any track. -> bed-music.wav
//   MUSIC="Epedemic Music/ES_Success Story - Lukas Got Lucky.mp3" START=0 node prep-music.mjs
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const C = existsSync('brand.json') ? JSON.parse(readFileSync('brand.json', 'utf8').replace(/^\uFEFF/, '')) : {};
const MUSIC = process.env.MUSIC || C.music || 'Epedemic Music/ES_Success Story - Lukas Got Lucky.mp3'; // uplifting instrumental (my-style)
const START = Number(process.env.START ?? C.musicStart ?? 0);
const { duration } = JSON.parse(readFileSync('sfx-cues.json'));
const src = resolve('../../../../my-sounds', MUSIC);
// "musicEven": true evens out a track's quiet intro/breaks so the bed is heard the whole way (user note 2026-10-24)
const EVEN = C.musicEven ? 'dynaudnorm=f=750:g=21:m=8,' : '';
const len = duration, fadeIn = 1.5, fadeOut = 2.5; // fade ends exactly at the video's end (no hard cut after the logo)

const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(START), '-t', len.toFixed(3), '-i', src,
  '-af', `aformat=sample_rates=48000:channel_layouts=stereo,${EVEN}afade=t=in:d=${fadeIn},afade=t=out:st=${(len - fadeOut).toFixed(3)}:d=${fadeOut},loudnorm=I=-20:TP=-2:LRA=11,aresample=48000`,
  '-c:a', 'pcm_s16le', 'bed-music.wav'], { stdio: 'inherit' });
if (r.status) process.exit(r.status);
console.log(`bed-music.wav from "${MUSIC}" @ ${START}s, ${len.toFixed(1)} s`);
