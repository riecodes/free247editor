import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guidedFile, styleFile } from './style.mjs';

const meta = (text) => Object.fromEntries(text.split('---')[1].trim().split('\n').map((l) => l.split(': ')));

test('short-form apps make it vertical with that safe zone', () => {
  const m = meta(styleFile({ make: 'talking', post: ['reels', 'tiktok'], lang: 'taglish', vibe: 'bigword' }));
  assert.equal(m.format, 'vertical');
  assert.equal(m.safe, 'reels');
  assert.equal(m.pace, 'tight');
  assert.equal(m.transcribe_language, 'tl');
  assert.equal(m.vibe, 'bigword');
});

test('YouTube alone is horizontal; YouTube plus an app is both', () => {
  assert.equal(meta(styleFile({ post: ['youtube'] })).format, 'horizontal');
  assert.equal(meta(styleFile({ post: ['youtube', 'shorts'] })).format, 'both');
});

test('vlogs are natural pace, products end on a follow card, Bisaya is auto-detected', () => {
  assert.equal(meta(styleFile({ make: 'vlog' })).pace, 'natural');
  const product = styleFile({ make: 'product', lang: 'bisaya' });
  assert.equal(meta(product).cta, 'card');
  assert.equal(meta(product).transcribe_language, 'auto');
  assert.match(product, /follow card/);
});

test('a Guided template keeps every pick in the front matter and says it in sentences', () => {
  const text = guidedFile('Style ko 1', { font: 'bebas', colour: 'box', safe: 'tiktok', hook: 'question', cta: 'card' }, 'fonts/bebas.woff2');
  const m = meta(text);
  assert.equal(m.name, 'Style ko 1');
  assert.equal(m.font, 'bebas');
  assert.equal(m.pace, 'tight');
  assert.match(text, /Bebas Neue \(font file fonts\/bebas\.woff2\), black text on a white box/);
  assert.match(text, /TikTok safe zone/);
  assert.match(text, /question card/);
  assert.match(text, /follow card/);
});

test('skipping every question still gives a usable default', () => {
  const text = styleFile({});
  assert.equal(meta(text).format, 'vertical');
  assert.match(text, /Hook: /);
  assert.match(text, /Taglish/);
});
