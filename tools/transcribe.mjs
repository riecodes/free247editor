#!/usr/bin/env node
// Free word-level transcription in the format Herk Edit Kit's cutting tools expect:
// { text, audio_duration_secs, words: [{ text, start, end }] }, written beside the video.
//
//   node tools/transcribe.mjs <video> [--local] [--model large-v3]
//
// Default: Groq whisper-large-v3 (free key from console.groq.com, GROQ_API_KEY in .env).
// --local: faster-whisper on this computer (needs Python and `pip install faster-whisper`).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: opts, positionals: [video] } = parseArgs({
  allowPositionals: true,
  options: {
    local: { type: 'boolean' }, model: { type: 'string', default: 'large-v3' },
    // --prompt biases Groq's Whisper, e.g. a disfluent prompt ("Um, uh, so, um...") makes it keep fillers
    prompt: { type: 'string' }, out: { type: 'string' },
    // --language (ISO-639-1, e.g. en) stops Whisper from guessing a language and translating into it
    language: { type: 'string' },
  },
});
const { local, model, prompt } = opts;
if (!video || !existsSync(video)) {
  console.error('Usage: node tools/transcribe.mjs <video> [--local] [--model large-v3] [--prompt <text>] [--language en] [--out <json>]');
  process.exit(1);
}
try { process.loadEnvFile(join(root, '.env')); } catch {}

const run = (cmd, cmdArgs) => {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true });
  if (r.error || r.status !== 0) throw new Error(`${cmd} failed: ${r.error?.message || r.stderr.trim().split('\n').pop()}`);
  return r.stdout;
};

const { dir, name } = parse(resolve(video));
const out = opts.out ? resolve(opts.out) : join(dir, `${name}.json`);
const duration = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]));

let words;
if (local) {
  const json = run('python', [join(root, 'tools', 'transcribe_local.py'), resolve(video), model]);
  words = JSON.parse(json);
} else {
  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys and put it in .env, or use --local.');
    process.exit(2);
  }
  // ponytail: one upload, Groq's free tier caps files at 25 MB (about 50 min of 64 kbps mono).
  // Split the audio and offset each chunk's times if longer recordings ever matter.
  const audio = join(dir, `${name}.transcribe.mp3`);
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', audio]);
  const form = new FormData();
  form.append('file', new Blob([readFileSync(audio)]), 'audio.mp3');
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  if (prompt) form.append('prompt', prompt);
  if (opts.language) form.append('language', opts.language);
  form.append('timestamp_granularities[]', 'word');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });
  rmSync(audio, { force: true });
  if (!res.ok) {
    console.error(`Groq transcription failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    process.exit(3);
  }
  const body = await res.json();
  words = (body.words || []).map((w) => ({ text: w.word.trim(), start: w.start, end: w.end }));
}

words = words.filter((w) => w.text && w.end >= w.start);
if (!words.length) {
  console.error('No words with timestamps came back. Is there speech in this video?');
  process.exit(4);
}
writeFileSync(out, JSON.stringify({
  text: words.map((w) => w.text).join(' '),
  audio_duration_secs: duration,
  words,
}, null, 2));
console.log(`Wrote ${words.length} words (${duration.toFixed(1)} s) to ${out}`);
