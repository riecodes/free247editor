// First-run setup. Each step reports { step, status, percent, message } and is skipped when
// already done, so a second run changes nothing.
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync, statSync } from 'node:fs';
import { release } from 'node:os';
import { dirname, join } from 'node:path';
import { CODEX_JS, ENGINE, HOME, NPM_CLI, NPX_CLI, SOURCE, TOOLS, WORK, findClaude, lastLine, run } from './lib.mjs';

// Pinned downloads. Bump deliberately, with the SHA-256 from the release page.
const FFMPEG = {
  url: 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip',
  sha256: '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba',
  inner: 'ffmpeg-9.0.2-essentials_build',
};
const MINGIT = {
  url: 'https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.3/MinGit-2.56.0.3-64-bit.zip',
  sha256: '2e5619966e588fde5f8122c5557cad50c0fbafcaed736689f40ec1dfb1d78ea7',
};
const CODEX_VERSION = '0.164.0';

export const TEST_VIDEO = join(WORK, 'outbox', 'setup-test.mp4');
// What the engine (Claude Code or Codex) reads in work\, copied from the app's own files.
const WORKSPACE = ['AGENTS.md', 'CLAUDE.md', 'setup.mjs', '.env.example', 'tools', '.agents', join('.claude', 'skills')];
const TAR = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

// Claude Code and Codex come early (they are small), so sign-in is ready by the last question.
// `weight` is each step's share of the overall progress ring, roughly its download size.
export const STEPS = [
  { id: 'preflight', weight: 1, done: () => false, run: preflight },
  { id: 'claude', weight: 8, done: () => Boolean(findClaude()), run: claude },
  { id: 'codex', weight: 6, done: () => existsSync(CODEX_JS), run: codex },
  { id: 'ffmpeg', weight: 28, done: () => existsSync(join(TOOLS, 'ffmpeg', 'bin', 'ffmpeg.exe')), run: (r) => unpack(FFMPEG, 'ffmpeg', r) },
  { id: 'git', weight: 10, done: () => existsSync(join(TOOLS, 'git', 'cmd', 'git.exe')), run: (r) => unpack(MINGIT, 'git', r) },
  { id: 'workspace', weight: 1, done: () => syncWorkspace(false) === 0, run: () => void syncWorkspace(true) },
  { id: 'kit', weight: 46, done: () => existsSync(join(WORK, 'kit', 'node_modules', 'hyperframes')) && existsSync(TEST_VIDEO), run: kit },
];

export async function setup(progress, job) {
  for (const s of STEPS) {
    if (s.done()) {
      progress({ step: s.id, status: 'done', percent: 100, message: 'Ready' });
      continue;
    }
    progress({ step: s.id, status: 'running', percent: 0, message: '' });
    try {
      const out = await s.run((percent, message) => progress({ step: s.id, status: 'running', percent, message }), job);
      progress({ step: s.id, status: out?.warn ? 'warn' : 'done', percent: 100, message: out?.warn || out || 'Ready' });
    } catch (e) {
      if (job.cancelled) Object.assign(e, { message: 'Cancelled.', code: 'cancelled' });
      progress({ step: s.id, status: 'error', percent: 0, message: e.message });
      throw Object.assign(e, { step: s.id });
    }
  }
  return { testVideo: TEST_VIDEO };
}

async function preflight() {
  const build = Number(release().split('.')[2]);
  if (build < 19045) throw new Error('This app needs Windows 10 22H2 or newer. Update Windows, then try again.');
  mkdirSync(HOME, { recursive: true });
  const { bavail, bsize } = statfsSync(HOME);
  const gb = (bavail * bsize) / 2 ** 30;
  if (gb < 4) throw new Error(`Only ${gb.toFixed(1)} GB is free. It needs at least 4 GB (10 GB is better). Free up some space, then try again.`);
  if (gb < 10) return { warn: `Only ${gb.toFixed(1)} GB is free. It will work, but 10 GB or more is better.` };
  return `Windows build ${build}, ${Math.floor(gb)} GB free`;
}

const mb = (n) => (n / 2 ** 20).toFixed(0);

async function download(url, sha256, dest, report) {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) throw Object.assign(new Error('The download failed. Check your internet, then try again.'), { code: 'offline' });
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = createHash('sha256');
  const file = createWriteStream(dest);
  let got = 0;
  let shown = -1;
  for await (const chunk of res.body) {
    hash.update(chunk);
    got += chunk.length;
    if (!file.write(chunk)) await once(file, 'drain');
    const pct = total ? Math.floor((got * 100) / total) : 0;
    if (pct !== shown) report((shown = pct), `${mb(got)} / ${mb(total)} MB`);
  }
  await new Promise((resolve, reject) => file.end((e) => (e ? reject(e) : resolve())));
  if (hash.digest('hex') !== sha256) {
    rmSync(dest, { force: true });
    throw new Error('The download was damaged (SHA-256 mismatch). Try again.');
  }
}

// Downloads a pinned zip and unpacks it into tools\<name>, renamed into place only when complete.
async function unpack({ url, sha256, inner }, name, report) {
  mkdirSync(TOOLS, { recursive: true });
  const zip = join(TOOLS, `${name}.zip`);
  const tmp = join(TOOLS, `${name}.tmp`);
  await download(url, sha256, zip, (pct, msg) => report(Math.round(pct * 0.9), msg));
  report(92, 'Unzipping');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp);
  const r = await run(TAR, ['-xf', zip, '-C', tmp], { cwd: TOOLS });
  if (r.code !== 0) throw new Error(`Could not unzip ${name}: ${lastLine(r.err)}`);
  rmSync(join(TOOLS, name), { recursive: true, force: true });
  renameSync(inner ? join(tmp, inner) : tmp, join(TOOLS, name));
  rmSync(tmp, { recursive: true, force: true });
  rmSync(zip, { force: true });
}

function* files(rel) {
  if (statSync(join(SOURCE, rel)).isDirectory()) {
    for (const name of readdirSync(join(SOURCE, rel))) yield* files(join(rel, name));
  } else yield rel;
}

// Copies the workspace files that differ (or are missing) into work\. Returns how many differ.
export function syncWorkspace(write) {
  let changed = 0;
  for (const entry of WORKSPACE) {
    for (const rel of files(entry)) {
      const src = join(SOURCE, rel);
      const dst = join(WORK, rel);
      if (existsSync(dst) && readFileSync(src).equals(readFileSync(dst))) continue;
      changed++;
      if (write) {
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, dst);
      }
    }
  }
  // The caption fonts Guided previews and templates use (OFL), shown from here by the window.
  for (const name of readdirSync(join(ENGINE, 'fonts'))) {
    const src = join(ENGINE, 'fonts', name);
    const dst = join(WORK, 'fonts', name);
    if (existsSync(dst) && readFileSync(src).equals(readFileSync(dst))) continue;
    changed++;
    if (write) {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
  }
  // v1 has one template, Default; a template is the style file the edit brief names.
  const style = join(WORK, 'templates', 'default', 'style.md');
  if (!existsSync(style)) {
    changed++;
    if (write) {
      mkdirSync(dirname(style), { recursive: true });
      copyFileSync(join(ENGINE, 'default-style.md'), style);
    }
  }
  return changed;
}

const KIT_STAGES = [
  [/^== Checking tools/, 3, 'Checking the tools'],
  [/^== Installing the editing engine/, 8, 'Downloading the edit kit (pinned version)'],
  [/^== Installing kit packages/, 25, 'Installing the kit packages'],
  [/^== Rendering a test video/, 75, 'Rendering the test video'],
  [/^== Transcription/, 97, 'Almost done'],
];

// Runs the repo's own setup.mjs in work\: clones the pinned kit, npm ci, renders the test video.
async function kit(report, job) {
  const lines = [];
  const attempt = () =>
    run(process.execPath, ['setup.mjs'], {
      cwd: WORK,
      job,
      onLine: (line) => {
        lines.push(line);
        if (lines.length > 40) lines.shift();
        const stage = KIT_STAGES.find(([re]) => re.test(line));
        if (stage) report(stage[1], stage[2]);
      },
    });
  let r = await attempt();
  if (r.code !== 0 && !job.cancelled && lines.some((l) => /test render failed/i.test(l))) {
    report(80, 'Fixing the renderer (Chrome Headless Shell)');
    await run(process.execPath, [NPX_CLI, '--yes', 'hyperframes', 'browser', 'ensure'], { cwd: join(WORK, 'kit'), job });
    r = await attempt();
  }
  if (r.code !== 0) {
    const stopped = lines.find((l) => l.startsWith('SETUP STOPPED'));
    throw new Error(stopped ? stopped.replace('SETUP STOPPED: ', 'Setup stopped: ') : `The kit setup stopped. ${lastLine(lines.join('\n') || r.err)}`);
  }
}

// The official installer, unmodified, per user (no admin).
async function claude(report, job) {
  report(10, 'Running the official Claude Code installer');
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'irm https://claude.ai/install.ps1 | iex'], {
    cwd: HOME,
    job,
    onLine: (line) => line.trim() && report(50, line.trim().slice(0, 140)),
  });
  if (!findClaude()) throw new Error(`Claude Code did not install. ${lastLine(r.err)}`);
}

async function codex(report, job) {
  report(10, `Installing the official Codex CLI ${CODEX_VERSION}`);
  const dir = join(TOOLS, 'codex');
  mkdirSync(dir, { recursive: true });
  const r = await run(process.execPath, [NPM_CLI, 'install', '--prefix', dir, `@openai/codex@${CODEX_VERSION}`, '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, job });
  if (!existsSync(CODEX_JS)) throw new Error(`The Codex CLI did not install. ${lastLine(r.err)}`);
}
