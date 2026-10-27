#!/usr/bin/env node
// The engine the app window talks to: JSON lines on stdin and stdout.
// Request: {id, cmd, ...args}. Replies: {id, type: 'progress' | 'result' | 'error', ...}.
// Unprompted: {type: 'ready'} once at start. Nothing else is written to stdout.
//
//   node app/engine/main.mjs --selftest
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { edit as claudeEdit } from './drivers/claude.mjs';
import { edit as codexEdit } from './drivers/codex.mjs';
import { CODEX_JS, DEV, ENGINE, HOME, NPM_CLI, SOURCE, TOOLS, TRANSCRIBE_PROVIDER, WORK, childEnv, findClaude, kill, lastLine, run } from './lib.mjs';
import { setup, STEPS, TEST_VIDEO, syncWorkspace } from './setup.mjs';
import { toSrt, writeSrt } from './srt.mjs';
import { stepOf } from './steps.mjs';
import { guidedFile, styleFile } from './style.mjs';

const VERSION = '0.1.0';
const JOBS = join(HOME, 'jobs');
const OUTBOX = join(WORK, 'outbox');
const VIDEO = /\.(mp4|mov|m4v|mkv|webm)$/i;
const DRIVERS = { claude: claudeEdit, codex: codexEdit };

if (process.argv.includes('--selftest')) {
  const problems = [];
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'setup.mjs', '.env.example', join('tools', 'transcribe.mjs'), join('.agents', 'skills', 'free247editor', 'SKILL.md')]) {
    if (!existsSync(join(SOURCE, f))) problems.push(`missing workspace file ${f}`);
  }
  if (!existsSync(NPM_CLI)) problems.push('missing npm: run npm run fetch-node');
  for (const f of ['default-style.md', 'sample.mp3']) if (!existsSync(join(ENGINE, f))) problems.push(`missing engine/${f}`);
  if (!toSrt([{ text: 'ok', start: 0, end: 1 }]).includes('00:00:00,000 --> 00:00:01,000')) problems.push('srt output is wrong');
  console.log(problems.length ? problems.join('\n') : 'ok');
  process.exit(problems.length ? 1 : 0);
}

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const fail = (message, code) => Object.assign(new Error(message), { code });

// One long job (setup, edit, note, approve) at a time; Cancel stops its whole process tree.
let current = null;
function startJob() {
  if (current) throw fail('Something is still running. Wait or cancel it first.', 'busy');
  return (current = { children: new Set(), cancelled: false });
}
const endJob = (job) => current === job && (current = null);

// ---------- status ----------

async function claudeStatus() {
  const exe = findClaude();
  if (!exe) return { installed: false, loggedIn: false };
  const r = await run(exe, ['auth', 'status', '--json'], { cwd: HOME, timeout: 20000 });
  try {
    const j = JSON.parse(r.out);
    const sub = j.subscriptionType ? `Claude ${j.subscriptionType[0].toUpperCase()}${j.subscriptionType.slice(1)}` : null;
    return { installed: true, loggedIn: Boolean(j.loggedIn), plan: sub || (j.authMethod === 'claude.ai' ? 'Claude' : 'Claude API') };
  } catch {
    return { installed: true, loggedIn: false, message: lastLine(r.err || r.out) };
  }
}

async function codexStatus() {
  if (!existsSync(CODEX_JS)) return { installed: false, loggedIn: false };
  const r = await run(process.execPath, [CODEX_JS, 'login', 'status'], { cwd: HOME, timeout: 20000 });
  const text = `${r.out}\n${r.err}`.trim();
  const loggedIn = r.code === 0 && /logged in/i.test(text) && !/not logged in/i.test(text);
  // codex only says how it is signed in (ChatGPT or an API key), not which ChatGPT plan.
  return { installed: true, loggedIn, plan: loggedIn ? (/chatgpt/i.test(text) ? 'ChatGPT' : 'API key') : null, message: lastLine(text) };
}

function jobFile(slug) {
  return join(JOBS, `${slug}.json`);
}
function loadJob(slug) {
  if (!/^[a-z0-9-]+$/.test(slug) || !existsSync(jobFile(slug))) throw fail("Can't find this video.");
  return JSON.parse(readFileSync(jobFile(slug), 'utf8'));
}
function saveJob(rec) {
  mkdirSync(JOBS, { recursive: true });
  writeFileSync(jobFile(rec.slug), JSON.stringify(rec, null, 2));
  return view(rec);
}
// What the window needs: the files for every version, which one is current, and the final if any.
function view(rec) {
  const files = {};
  for (const v of rec.versions) files[v] = { mp4: join(OUTBOX, `${rec.slug}-v${v}.mp4`), srt: join(OUTBOX, `${rec.slug}-v${v}.srt`) };
  return { ...rec, files };
}
function listJobs() {
  if (!existsSync(JOBS)) return [];
  return readdirSync(JOBS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, t: statSync(join(JOBS, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(0, 8)
    .map(({ f }) => view(JSON.parse(readFileSync(join(JOBS, f), 'utf8'))));
}

async function status() {
  // App updates bring new workspace files; copying them is quick, so it never sends the buyer
  // back to the first-run screens.
  if (STEPS.find((s) => s.id === 'preflight') && existsSync(WORK)) syncWorkspace(true);
  const [claude, codex] = await Promise.all([claudeStatus(), codexStatus()]);
  const steps = STEPS.map((s) => ({ id: s.id, weight: s.weight, done: s.id === 'preflight' || s.done() }));
  return {
    steps,
    setupDone: steps.every((s) => s.done),
    claude,
    codex,
    jobs: listJobs(),
    testVideo: existsSync(TEST_VIDEO) ? TEST_VIDEO : null,
    work: WORK,
  };
}

// ---------- sign-in ----------

// Opens the CLI's own sign-in in a visible console and resolves when that window closes.
function signIn(exe, args) {
  const quoted = [exe, ...args].map((a) => `"${a}"`).join(' ');
  return run(process.env.ComSpec || 'cmd.exe', [`/d /c start "free247editor sign-in" /wait ${quoted}`], { cwd: HOME, verbatim: true });
}

async function login({ engine, device }) {
  if (engine === 'claude') {
    const exe = findClaude();
    if (!exe) throw fail('Claude Code is not installed yet.');
    await signIn(exe, ['auth', 'login', '--claudeai']);
    return claudeStatus();
  }
  if (!existsSync(CODEX_JS)) throw fail('The Codex CLI is not installed yet.');
  await signIn(process.execPath, [CODEX_JS, 'login', ...(device ? ['--device-auth'] : [])]);
  return codexStatus();
}

async function logout({ engine }) {
  if (engine === 'claude') {
    const exe = findClaude();
    if (exe) await run(exe, ['auth', 'logout'], { cwd: HOME, timeout: 20000 });
    return claudeStatus();
  }
  if (existsSync(CODEX_JS)) await run(process.execPath, [CODEX_JS, 'logout'], { cwd: HOME, timeout: 20000 });
  return codexStatus();
}

// ---------- transcription ----------

const P = TRANSCRIBE_PROVIDER.name;
const GROQ_ERRORS = [
  [/HTTP 401/, `That key didn't work. Copy the whole key from ${P} again.`, 'badKey'],
  [/HTTP 429/, `${P}'s free limit is used up for now. Try again in a few minutes.`, 'groqLimit'],
  [/HTTP \d+/, `${P} has a problem right now. Try again later.`, 'groq'],
  [/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT/i, `Can't reach ${P}. Check your internet.`, 'offline'],
  [/API_KEY is not set/, `No ${P} key yet. Add it first.`, 'noKey'],
  [/No words/, 'No speech was heard in the video.', 'noWords'],
];

// tools/transcribe.mjs writes <name>.json beside the media file: { text, audio_duration_secs, words }.
async function transcribe(media, job, env) {
  const r = await run(process.execPath, [join(WORK, 'tools', 'transcribe.mjs'), media], { cwd: WORK, job, env });
  if (r.code === 0) return JSON.parse(readFileSync(media.replace(/\.[^.\\/]+$/, '.json'), 'utf8'));
  if (job?.cancelled) throw fail('Cancelled.', 'cancelled');
  const text = `${r.err}\n${r.out}`;
  const known = GROQ_ERRORS.find(([re]) => re.test(text));
  throw fail(known ? known[1] : `Transcription failed: ${lastLine(text)}`, known?.[2]);
}

// Checks a pasted Groq key on a bundled 3-second sample. On success this engine keeps the key in
// memory; the window then saves it in Credential Manager (never in a file).
async function testKey({ key }) {
  key = String(key || '').trim();
  if (!new RegExp(TRANSCRIBE_PROVIDER.keyPattern).test(key)) {
    throw fail(`That doesn't look like a whole ${P} key (it starts with ${TRANSCRIBE_PROVIDER.keyHint}). Copy it again.`, 'badKey');
  }
  syncWorkspace(true);
  const dir = join(HOME, 'tmp');
  mkdirSync(dir, { recursive: true });
  const sample = join(dir, 'keytest.mp3');
  copyFileSync(join(ENGINE, 'sample.mp3'), sample);
  const { text } = await transcribe(sample, null, childEnv({ GROQ_API_KEY: key }));
  process.env.GROQ_API_KEY = key;
  return { text };
}

// ---------- editing ----------

export function slugify(name) {
  return name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'video';
}

const STEP_LINES = {
  cut: 'Cutting dead air and retakes',
  captions: 'Making the captions',
  hook: 'Writing the hook and motion graphics',
  render: 'Rendering the draft',
};
const firstSentence = (s) => (String(s).trim().split(/(?<=[.!?])\s|\n/)[0] || '').slice(0, 160);

// Runs one engine turn and turns its events into the five plain progress steps.
async function runEngine(engine, { brief, resume, speed, job, progress }) {
  const driver = DRIVERS[engine];
  if (!driver) throw fail('Pick Claude or ChatGPT first.');
  let step = 'cut';
  const order = ['cut', 'captions', 'hook', 'render'];
  // Steps only move forward.
  const advance = (name, input) => {
    const next = stepOf(name, input);
    if (next && order.indexOf(next) > order.indexOf(step)) step = next;
  };
  progress({ step, line: 'Reading your transcript and style' });
  return driver({
    brief,
    resume,
    model: MODELS[speed],
    job,
    onTool: (name, input) => {
      advance(name, input);
      const file = basename(String(input.file_path || ''));
      const line =
        input.description ||
        (name === 'Write' || name === 'Edit' ? `Writing ${file}` : name === 'Read' ? `Reading ${file}` : name === 'Skill' ? 'Reading the editing skill' : STEP_LINES[step]);
      progress({ step, line });
    },
    onText: (text) => {
      const line = firstSentence(text);
      if (line) progress({ step, line });
    },
  });
}

// The draft is the DRAFT: line if it points into outbox, else the newest outbox/<slug>*.mp4 made
// during this run. It is copied to the canonical <slug>-v<n>.mp4 name if the engine chose another.
function findDraft(slug, version, text, since) {
  const want = join(OUTBOX, `${slug}-v${version}.mp4`);
  const said = /DRAFT:\s*(\S+\.mp4)/i.exec(text || '')?.[1];
  let found = said && resolve(WORK, said);
  if (!found || !found.startsWith(OUTBOX) || !existsSync(found)) {
    found = readdirSync(OUTBOX)
      .filter((f) => f.startsWith(slug) && f.endsWith('.mp4'))
      .map((f) => join(OUTBOX, f))
      .filter((f) => statSync(f).mtimeMs >= since - 2000)
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  }
  if (!found) throw fail(`No draft came out. ${firstSentence(text)}`);
  if (resolve(found) !== resolve(want)) copyFileSync(found, want);
  return want;
}

// SRT timing comes from the final cut itself, so it always lines up.
async function makeSrt(mp4, job) {
  await transcribe(mp4, job);
  writeSrt(mp4.replace(/\.mp4$/, '.json'), mp4.replace(/\.mp4$/, '.srt'));
}

// The app shows the draft itself, so the skill's "open it" step must not pop up a player.
const BRIEF_END =
  'Do not ask questions; when something is unclear, choose the default and say which. ' +
  'Do not open the video or any other file or window; the app shows the draft. ' +
  'Render once and finish: skip self-lint, extra frame reviews and re-render loops unless a check fails. ' +
  'The hook text and the captions never share the screen: captions start only after the hook card is gone.';
const MODELS = { fast: 'sonnet' };

// Copies the dropped file into work\inbox under a fresh slug and transcribes it.
async function intake(path, job, progress) {
  if (!VIDEO.test(String(path)) || !existsSync(path)) throw fail(`${basename(String(path))} isn't a video. Use MP4, MOV, MKV or WEBM.`, 'notVideo');
  const ext = extname(path).toLowerCase();
  const base = slugify(basename(path));
  let slug = base;
  for (let n = 2; existsSync(jobFile(slug)); n++) slug = `${base}-${n}`;
  syncWorkspace(true);
  for (const d of ['inbox', 'outbox']) mkdirSync(join(WORK, d), { recursive: true });
  progress({ step: 'transcribe', line: 'Copying the video' });
  const src = join('inbox', `${slug}${ext}`);
  await copyFile(path, join(WORK, src));
  progress({ step: 'transcribe', line: `Transcribing (${P})` });
  const { words } = await transcribe(join(WORK, src), job);
  progress({ step: 'transcribe', line: `${words.length} words transcribed` });
  return { slug, src, words };
}

// Guided starts here: the clip is copied and transcribed, and one still is grabbed at the start of
// the second sentence so every wizard option can be drawn over the buyer's own frame.
async function prepare({ path }, progress) {
  const job = startJob();
  try {
    const { slug, src, words } = await intake(path, job, progress);
    const second = words.findIndex((w, i) => i > 0 && /[.?!]$/.test(words[i - 1].text));
    const at = (words[second] ?? words[Math.floor(words.length / 4)] ?? { start: 1 }).start;
    const still = join(WORK, 'inbox', `${slug}-still.jpg`);
    const ffmpeg = join(TOOLS, 'ffmpeg', 'bin', 'ffmpeg.exe');
    await run(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(at), '-i', join(WORK, src), '-frames:v', '1', '-vf', 'scale=-2:1280', '-q:v', '3', still], { job });
    const from = Math.max(0, second);
    const sample = words.slice(from, from + 4).map((w) => w.text.replace(/[.,!?]+$/, '')).join(' ');
    return { prepared: { slug, src: src.replace(/\\/g, '/'), name: basename(path) }, still: existsSync(still) ? still : null, sample };
  } finally {
    endJob(job);
  }
}

async function editVideo({ path, prepared, engine, speed, template = 'default' }, progress) {
  if (!/^_?[a-z0-9-]+$/.test(template) || !existsSync(join(WORK, 'templates', template, 'style.md'))) template = 'default';
  const job = startJob();
  try {
    // A clip that went through Guided is already copied and transcribed.
    const ready = prepared && /^[a-z0-9-]+$/.test(prepared.slug) && existsSync(join(WORK, 'inbox', `${prepared.slug}.json`));
    const { slug, src } = ready ? prepared : await intake(path, job, progress);
    path = ready ? prepared.name : path;
    const draftName = `outbox/${slug}-v1.mp4`;
    const brief =
      `edit this: ${src.replace(/\\/g, '/')}. Its word-level transcript is inbox/${slug}.json, already done. ` +
      `Follow the free247editor skill's edit flow. For this edit, use templates/${template}/style.md as the style ` +
      `(instead of my-style.md), plus my-rules.md. ${BRIEF_END} ` +
      `Render the draft to ${draftName}. When it is rendered, end your reply with the line DRAFT: ${draftName}`;
    const started = Date.now();
    const out = await runEngine(engine, { brief, speed, job, progress });
    const mp4 = findDraft(slug, 1, out.text, started);
    progress({ step: 'srt', line: 'Making the SRT from the draft' });
    await makeSrt(mp4, job);
    const rec = { slug, name: basename(path), engine, template, session: out.session, versions: [1], current: 1 };
    return { job: saveJob({ ...rec, summary: out.text, created: new Date().toISOString() }) };
  } finally {
    endJob(job);
  }
}

// Note chips: what the engine is told, and the lasting rule in the user's language.
const CHIPS = {
  faster: ['faster pacing: cut more of the pauses', { en: 'Tighter pacing', fil: 'Mas tight ang pacing' }],
  bigger: ['bigger captions', { en: 'Bigger captions', fil: 'Mas malaking captions' }],
  nohook: ['remove the hook text', { en: 'No hook text', fil: 'Walang hook text' }],
  color: ['a different color for the key words in the captions', { en: 'A different key-word color', fil: 'Ibang kulay ng key words' }],
  zoom: ['more zoom-ins on key words', { en: 'More zoom-ins on key words', fil: 'Mas maraming zoom-in sa key words' }],
};

function addRule(rule, words) {
  const file = join(WORK, 'my-rules.md');
  if (!existsSync(file)) writeFileSync(file, '# My rules\n\nLearned from my notes. These beat my-style.md.\n\n');
  const date = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
  appendFileSync(file, `- ${rule} (my words: "${words.replace(/"/g, "'")}", ${date})\n`);
}

async function note({ slug, text = '', chips = [], rule = false, lang = 'en', speed }, progress) {
  const rec = loadJob(slug);
  const picked = chips.filter((c) => CHIPS[c]);
  const typed = String(text).trim();
  if (!picked.length && !typed) throw fail('Pick a quick note or type what to change.', 'empty');
  const job = startJob();
  try {
    const next = Math.max(...rec.versions) + 1;
    const from = rec.current;
    const wants = [...picked.map((c) => CHIPS[c][0]), typed].filter(Boolean);
    const said = [...picked.map((c) => CHIPS[c][1][lang === 'fil' ? 'fil' : 'en']), typed].filter(Boolean);
    let saved = null;
    if (rule) {
      saved = said.join('; ');
      addRule(saved, said.join(', '));
    }
    const draftName = `outbox/${slug}-v${next}.mp4`;
    const brief =
      `Notes on outbox/${slug}-v${from}.mp4: ${wants.join('; ')}. Apply them to the same edit and render ${draftName}. ` +
      `Keep using templates/${rec.template || 'default'}/style.md as the style, plus my-rules.md. ${BRIEF_END} ` +
      `When it is rendered, end your reply with the line DRAFT: ${draftName}`;
    const started = Date.now();
    const out = await runEngine(rec.engine, { brief, resume: rec.session, speed, job, progress });
    const mp4 = findDraft(slug, next, out.text, started);
    progress({ step: 'srt', line: 'Making the SRT from the draft' });
    await makeSrt(mp4, job);
    const notes = { ...(rec.notes || {}), [next]: said.join(', ') };
    const times = { ...(rec.times || {}), [next]: new Date().toISOString() };
    return { job: saveJob({ ...rec, session: out.session || rec.session, versions: [...rec.versions, next], current: next, notes, times, summary: out.text }), rule: saved };
  } finally {
    endJob(job);
  }
}

function use({ slug, version }) {
  const rec = loadJob(slug);
  if (!rec.versions.includes(version)) throw fail('That version does not exist.');
  return { job: saveJob({ ...rec, current: version }) };
}

// The export preset: 1080x1920 (padded if the draft is another size), 30 fps, H.264 (NVENC when
// the GPU has it) + AAC, loudness normalized to about -14 LUFS, in one FFmpeg pass.
async function exportFinal(src, dst, job) {
  const ffmpeg = join(TOOLS, 'ffmpeg', 'bin', 'ffmpeg.exe');
  const common = [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p',
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
  ];
  const nvenc = ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '21', '-b:v', '0', '-profile:v', 'high'];
  const x264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high'];
  let encoder = 'h264_nvenc';
  let r = await run(ffmpeg, [...common, ...nvenc, dst], { job });
  if (r.code !== 0 && !job.cancelled) {
    encoder = 'libx264';
    r = await run(ffmpeg, [...common, ...x264, dst], { job });
  }
  if (r.code !== 0) throw job.cancelled ? fail('Cancelled.', 'cancelled') : fail(`Could not export the final: ${lastLine(r.err)}`);
  return encoder;
}

async function approve({ slug, version, videos }, progress) {
  const rec = loadJob(slug);
  const v = version ?? rec.current;
  if (!videos) throw fail("Can't find the Videos folder.");
  const job = startJob();
  try {
    const dir = join(videos, 'free247editor');
    mkdirSync(dir, { recursive: true });
    const mp4 = join(dir, `${slug}-final.mp4`);
    const srt = join(dir, `${slug}-final.srt`);
    progress({ line: 'Exporting the final: 1080x1920, 30 fps, -14 LUFS' });
    const encoder = await exportFinal(join(OUTBOX, `${slug}-v${v}.mp4`), mp4, job);
    copyFileSync(join(OUTBOX, `${slug}-v${v}.srt`), srt);
    return { job: saveJob({ ...rec, final: { version: v, mp4, srt, encoder } }) };
  } finally {
    endJob(job);
  }
}

// ---------- small OS actions ----------

function reveal({ path }) {
  if (!path || !existsSync(path)) throw fail('This file is gone.');
  // explorer wants /select,"path" as one argument; Windows paths cannot contain quotes.
  spawn('explorer.exe', [`/select,"${resolve(path)}"`], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore' }).unref();
  return {};
}

const LINKS = [TRANSCRIBE_PROVIDER.keyUrl];

// ---------- templates (a template is templates\<id>\style.md; Quick passes the active one) ----------

const TEMPLATES = join(WORK, 'templates');
// Bundled OFL caption fonts; the one a template uses is copied beside it so the render matches.
const FONT_FILES = { anton: 'anton.woff2', bebas: 'bebas-neue.woff2', montserrat: 'montserrat-800.woff2', poppins: 'poppins-700.woff2', archivo: 'archivo-black.woff2' };

function listTemplates() {
  // `_once` holds Guided picks used without saving; it is not a template the buyer sees.
  const ids = existsSync(TEMPLATES) ? readdirSync(TEMPLATES).filter((id) => !id.startsWith('_') && existsSync(join(TEMPLATES, id, 'style.md'))) : [];
  const templates = ids.map((id) => ({ id, name: /^name:\s*(.+)$/m.exec(readFileSync(join(TEMPLATES, id, 'style.md'), 'utf8'))?.[1]?.trim() || id }));
  return { templates: templates.sort((a, b) => (a.id === 'default' ? -1 : b.id === 'default' ? 1 : a.name.localeCompare(b.name))) };
}

function saveTemplate({ name, picks = {}, once = false }) {
  name = once ? 'Guided picks' : String(name || '').trim();
  if (!name) throw fail('Give the template a name.', 'noName');
  if (name.length > 40) throw fail('Keep the name to 40 characters.', 'longName');
  if (!once && listTemplates().templates.some((t) => t.name.toLowerCase() === name.toLowerCase())) throw fail(`You already have a template called ${name}.`, 'nameTaken');
  const base = slugify(name);
  let id = once ? '_once' : base === 'default' ? 'default-2' : base;
  for (let n = 2; !once && existsSync(join(TEMPLATES, id)); n++) id = `${base}-${n}`;
  mkdirSync(join(TEMPLATES, id, 'fonts'), { recursive: true });
  const file = FONT_FILES[picks.font];
  const font = file && existsSync(join(ENGINE, 'fonts', file)) ? `templates/${id}/fonts/${file}` : null;
  if (font) copyFileSync(join(ENGINE, 'fonts', file), join(TEMPLATES, id, 'fonts', file));
  writeFileSync(join(TEMPLATES, id, 'style.md'), guidedFile(name, picks, font));
  return { template: { id, name } };
}

// First-run answers become the Default template, so the first Quick edit already fits the buyer.
function saveStyle({ answers }) {
  const file = join(WORK, 'templates', 'default', 'style.md');
  mkdirSync(join(WORK, 'templates', 'default'), { recursive: true });
  writeFileSync(file, styleFile(answers || {}));
  return { file };
}
function openUrl({ url }) {
  if (!LINKS.includes(url)) throw fail('That link is not allowed.');
  spawn('explorer.exe', [url], { detached: true, stdio: 'ignore' }).unref();
  return {};
}

function cancel() {
  if (current) {
    current.cancelled = true;
    for (const child of current.children) kill(child);
  }
  return {};
}

// ---------- protocol ----------

const handlers = {
  hello: () => ({ version: VERSION, home: HOME, dev: DEV, provider: TRANSCRIBE_PROVIDER }),
  status,
  style: saveStyle,
  templates: listTemplates,
  saveTemplate,
  prepare,
  setup: async (_, progress) => {
    const job = startJob();
    try {
      return await setup(progress, job);
    } finally {
      endJob(job);
    }
  },
  login,
  logout,
  testKey,
  edit: editVideo,
  note,
  use,
  approve,
  reveal,
  openUrl,
  cancel,
};

mkdirSync(HOME, { recursive: true });
// One engine per install: a newer engine (the window was reloaded) writes its pid here, and this
// one then stops its job and exits instead of running twice.
const PID_FILE = join(HOME, 'engine.pid');
writeFileSync(PID_FILE, String(process.pid));
setInterval(() => {
  let owner = '';
  try {
    owner = readFileSync(PID_FILE, 'utf8').trim();
  } catch {}
  if (owner !== String(process.pid)) {
    cancel();
    setTimeout(() => process.exit(0), 300);
  }
}, 2000).unref();
send({ type: 'ready', version: VERSION, home: HOME, dev: DEV });

createInterface({ input: process.stdin })
  .on('line', async (line) => {
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      return;
    }
    const { id, cmd } = req;
    try {
      if (!handlers[cmd]) throw fail(`unknown command ${cmd}`);
      const result = await handlers[cmd](req, (data) => send({ id, type: 'progress', ...data }));
      send({ id, type: 'result', ...result });
    } catch (e) {
      send({ id, type: 'error', message: e.message, code: e.code, step: e.step });
    }
  })
  // The window closed: stop whatever is running and exit.
  .on('close', () => {
    cancel();
    setTimeout(() => process.exit(0), 300);
  });
