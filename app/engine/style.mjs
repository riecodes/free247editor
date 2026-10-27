// The first-run answers to templates\default\style.md: front matter with the values, then plain
// sentences, which is what Claude Code or Codex reads. Looks are patterns from the claudeedits
// research (proven Claude-made reel styles), described in our own words.

const VIBES = {
  bigword: {
    name: 'One Big Word',
    font: 'montserrat',
    captions: 'bigword',
    position: 'upper',
    rules:
      "One keyword per sentence in big caps (heavy white sans like Montserrat ExtraBold, soft shadow) in the top 15% of the frame; it is the sentence's key word in the language it was said, and it hard-swaps when the next sentence starts. Hard cuts and punch-in zooms between sentences, no lower-third captions. One black-and-white beat on the punchline.",
  },
  forest: {
    name: 'Forest Editorial',
    font: 'archivo',
    captions: 'pills',
    position: 'lower',
    rules:
      'Two type voices: a heavy geometric sans in caps for titles and an italic serif (Instrument Serif) for emphasis words. Captions are 2 to 4 lowercase words in a small serif, cream text on a dark pill about 72% down the frame, never big. Take the palette from the footage: sample the main colour of the room for pills and full-bleed title cards. The layout changes every 2 to 3 seconds with hard cuts.',
  },
  cream: {
    name: 'Cream Card',
    font: 'inter',
    captions: 'small',
    position: 'card',
    rules:
      'An off-white canvas; the face video sits in a centered rounded card (about 65% of the width). A small pill above the card and a fixed two-line line below it in black plus one accent colour. Small captions inside the lower third of the card, a few emphasis words in bold italic. Clean widgets (checklists, progress bars) can slide over the card.',
  },
  split: {
    name: 'Kallaway Split',
    font: 'montserrat',
    captions: 'word',
    position: 'seam',
    rules:
      'A white graph-paper canvas on the top 60% with dark UI chips and stacked bold uppercase headlines; the face in a rounded rectangle on the bottom 40%, cutting back to full-frame face every few seconds. Captions one word at a time in a small black sans just above the face (white when full-frame). Only the chips move.',
  },
};

// The hook and the captions must never overlap, whichever model edits.
const HOOK_RULE = 'Hook: one short, bold line of hook text in the first 3 seconds. Captions start only after the hook card is gone, so the two never share the screen.';

const LANGS = {
  taglish: ['Taglish', 'tl'],
  tagalog: ['Tagalog', 'tl'],
  bisaya: ['Bisaya', 'auto'],
  english: ['English', 'en'],
  mixed: ['whatever language each video uses', 'auto'],
};
const APPS = { tiktok: 'TikTok', reels: 'Reels', shorts: 'Shorts' };

export function styleFile(a = {}) {
  const post = Array.isArray(a.post) ? a.post : [];
  const vertical = post.filter((p) => APPS[p]);
  const format = post.includes('youtube') ? (vertical.length ? 'both' : 'horizontal') : 'vertical';
  const pace = a.make === 'vlog' ? 'natural' : 'tight';
  const vibe = VIBES[a.vibe];
  const [langName, langHint] = LANGS[a.lang] || LANGS.taglish;
  const meta = {
    name: 'Default',
    make: a.make || 'talking',
    post: post.join(', ') || 'tiktok, reels, shorts',
    lang: a.lang || 'taglish',
    transcribe_language: langHint,
    vibe: a.vibe || 'none',
    format,
    pace,
    font: vibe?.font || 'montserrat',
    hook: 'big',
    captions: vibe?.captions || 'word',
    position: vibe?.position || 'upper',
    safe: vertical[0] || 'off',
    visuals: 'some',
    zoom: 'on',
    sfx: 'pop',
    music: 'none',
    cta: a.make === 'product' ? 'card' : 'none',
  };
  const lines = [
    format === 'horizontal'
      ? 'Horizontal 16:9 for YouTube.'
      : `Vertical 9:16 for ${(vertical.length ? vertical.map((p) => APPS[p]) : ['TikTok', 'Reels', 'Shorts']).join(', ')}${format === 'both' ? ', plus a horizontal 16:9 version for YouTube with its own framing and text placement' : ''}. Keep every caption and graphic inside the ${APPS[meta.safe] || 'Reels'} safe zone, clear of the app buttons.`,
    pace === 'tight'
      ? 'Tight pace: cut dead air, false starts and retakes; keep a short breath at each join.'
      : 'Natural pace: keep short pauses for breathing room. For a folder of clips from one day, keep them in the order they were shot.',
    vibe ? `Look: ${vibe.name}. ${vibe.rules}` : 'Captions word by word: key words in big bold caps, small filler words in lowercase, white with a soft shadow, in the upper third.',
    HOOK_RULE,
    `Captions keep the words exactly as spoken in ${langName}; never translate or "fix" them.`,
    a.make === 'tutorial' ? 'Show each step clearly; zoom into the screen or the hands when a step is shown.' : null,
    a.make === 'product' ? 'End with a follow card in the last 2 seconds.' : null,
    'Color: natural, light correction only. Sound: voice first, light pops and whooshes on cuts and graphics, no music bed.',
  ].filter(Boolean);
  return render(meta, lines);
}

const render = (meta, lines) => `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n${lines.join('\n')}\n`;

const FONTS = { anton: 'Anton', bebas: 'Bebas Neue', montserrat: 'Montserrat ExtraBold', poppins: 'Poppins Bold', archivo: 'Archivo Black' };
const KEYS = { yellow: 'white with yellow key words', indigo: 'white with indigo key words', rose: 'white with rose key words', box: 'black text on a white box' };
const STYLES = { word: 'word by word', pills: 'as key-word pills (key words on a coloured pill)', sentence: 'as full-sentence subtitles' };
export const GUIDED_DEFAULTS = { format: 'vertical', pace: 'tight', colour: 'yellow', font: 'anton', hook: 'big', captions: 'word', position: 'upper', safe: 'off', visuals: 'some', zoom: 'on', sfx: 'pop', music: 'none', cta: 'none' };

// A template saved from the Guided wizard: the picks as front matter, then the sentences the
// engine reads. `fontFile` is the bundled font copied beside the template, so the render matches.
export function guidedFile(name, picks = {}, fontFile = null) {
  const c = { ...GUIDED_DEFAULTS, ...picks };
  const lines = [
    c.format === 'both' ? 'Vertical 9:16, plus a horizontal 16:9 version with its own framing and text placement.' : 'Vertical 9:16.',
    c.pace === 'tight' ? 'Tight pace: cut every breath and pause.' : 'Natural pace: keep short pauses for breathing room.',
    c.captions === 'none'
      ? 'No captions.'
      : `Captions ${STYLES[c.captions] || STYLES.word} in ${FONTS[c.font] || FONTS.anton}${fontFile ? ` (font file ${fontFile})` : ''}, ${KEYS[c.colour] || KEYS.yellow}, in the ${c.position === 'middle' ? 'middle' : `${c.position === 'lower' ? 'lower' : 'upper'} third`}.`,
    c.safe !== 'off' ? `Keep every caption and graphic inside the ${{ tiktok: 'TikTok', reels: 'Reels', shorts: 'Shorts' }[c.safe] || 'Reels'} safe zone.` : null,
    c.hook === 'none'
      ? 'No hook text.'
      : `${c.hook === 'question' ? 'Hook: a white question card at the top for the first 3 seconds.' : 'Hook: one short, bold line of hook text in the first 3 seconds, taken from what I say.'} Captions start only after the hook card is gone.`,
    { minimal: 'Graphics: minimal, captions only.', heavy: 'Graphics: motion graphics on most sentences.' }[c.visuals] || 'Graphics: a few motion cards at the key points.',
    c.zoom === 'on' ? 'Zoom in on key words without covering the face.' : 'No zoom-ins.',
    c.sfx === 'pop' ? 'Light pops and whooshes on cuts and cards.' : 'No sound effects.',
    c.music === 'bed' ? 'A quiet music bed from my-sounds.' : 'No music.',
    c.cta === 'card' ? 'End with a follow card in the last 2 seconds.' : null,
  ].filter(Boolean);
  return render({ name, ...c }, lines);
}
