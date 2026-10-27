import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cues, timestamp, toSrt } from './srt.mjs';

const w = (text, start, end) => ({ text, start, end });

test('timestamps use HH:MM:SS,mmm', () => {
  assert.equal(timestamp(0), '00:00:00,000');
  assert.equal(timestamp(3661.5), '01:01:01,500');
  assert.equal(timestamp(59.9996), '00:01:00,000');
});

test('words join into one cue until a limit', () => {
  const c = cues([w('Kumusta', 0, 0.4), w('kayo', 0.45, 0.8), w('lahat', 0.85, 1.2)]);
  assert.deepEqual(c, [{ start: 0, end: 1.2, text: 'Kumusta kayo lahat' }]);
});

test('a cue never passes 42 characters', () => {
  const words = 'ito ay isang mahabang pangungusap na walang tigil at tuloy tuloy lang'
    .split(' ')
    .map((t, i) => w(t, i * 0.2, i * 0.2 + 0.15));
  for (const c of cues(words, { maxSecs: 99 })) assert.ok(c.text.length <= 42, c.text);
});

test('a cue never passes 2.5 seconds', () => {
  const words = Array.from({ length: 12 }, (_, i) => w('oo', i * 0.5, i * 0.5 + 0.4));
  for (const c of cues(words)) assert.ok(c.end - c.start <= 2.5, `${c.start} ${c.end}`);
});

test('breaks at sentence ends and at pauses over 0.6 s', () => {
  const c = cues([w('Tapos.', 0, 0.5), w('Next', 0.6, 0.9), w('part', 1.0, 1.3), w('dito', 2.0, 2.3)]);
  assert.deepEqual(c.map((x) => x.text), ['Tapos.', 'Next part', 'dito']);
});

test('cues never overlap even when word times do', () => {
  const c = cues([w('and', 0, 1.2), w('then', 1.25, 2.5), w('from', 2.06, 2.4)], { maxSecs: 2.5 });
  for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].end <= c[i].start, `${c[i - 1].end} > ${c[i].start}`);
});

test('toSrt numbers cues and separates them with a blank line', () => {
  assert.equal(
    toSrt([w('Hello.', 0, 0.5), w('World', 1.5, 2)]),
    '1\n00:00:00,000 --> 00:00:00,500\nHello.\n\n2\n00:00:01,500 --> 00:00:02,000\nWorld\n'
  );
});
