// Word timings (tools/transcribe.mjs output) to SRT captions: at most 42 characters and 2.5 s
// per cue, breaking at sentence ends and at pauses longer than 0.6 s.
import { readFileSync, writeFileSync } from 'node:fs';

export function cues(words, { maxChars = 42, maxSecs = 2.5, pause = 0.6 } = {}) {
  const out = [];
  let cur = null;
  for (const w of words) {
    const text = String(w.text).trim();
    if (!text) continue;
    if (cur) {
      const fits = cur.text.length + 1 + text.length <= maxChars && w.end - cur.start <= maxSecs;
      if (fits && w.start - cur.end <= pause && !/[.?!…]["')\]]?$/.test(cur.text)) {
        cur.text += ` ${text}`;
        cur.end = w.end;
        continue;
      }
      out.push(cur);
    }
    cur = { start: w.start, end: w.end, text };
  }
  if (cur) out.push(cur);
  // Whisper's word times can overlap; a cue ends no later than the next one starts.
  for (let i = 0; i < out.length - 1; i++) out[i].end = Math.min(out[i].end, out[i + 1].start);
  return out;
}

const pad = (n, size = 2) => String(n).padStart(size, '0');
export function timestamp(secs) {
  const ms = Math.max(0, Math.round(secs * 1000));
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export function toSrt(words, opts) {
  return cues(words, opts)
    .map((c, i) => `${i + 1}\n${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.text}\n`)
    .join('\n');
}

export function writeSrt(transcriptJson, srtPath) {
  const { words } = JSON.parse(readFileSync(transcriptJson, 'utf8'));
  writeFileSync(srtPath, toSrt(words));
}
