// Paths and process helpers shared by the engine modules.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE = dirname(fileURLToPath(import.meta.url));
// Installed app: the workspace files and npm are resources beside engine/. Dev: this repo.
const bundled = existsSync(join(ENGINE, '..', 'workspace'));
export const SOURCE = bundled ? join(ENGINE, '..', 'workspace') : join(ENGINE, '..', '..');
export const NPM = bundled ? join(ENGINE, '..', 'npm') : join(ENGINE, '..', 'src-tauri', 'binaries', 'npm');
export const NPM_CLI = join(NPM, 'node_modules', 'npm', 'bin', 'npm-cli.js');
export const NPX_CLI = join(NPM, 'node_modules', 'npm', 'bin', 'npx-cli.js');
// Dev builds use their own folder so testing never touches a real install.
export const DEV = !process.argv.includes('--prod');
export const HOME = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), DEV ? 'free247editor-dev' : 'free247editor');
export const TOOLS = join(HOME, 'tools');
export const WORK = join(HOME, 'work');
export const CODEX_JS = join(TOOLS, 'codex', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');

// The cloud transcription provider. The window's labels come from here, so switching providers
// is one edit (plus tools/transcribe.mjs).
export const TRANSCRIBE_PROVIDER = {
  id: 'groq',
  name: 'Groq',
  keyUrl: 'https://console.groq.com/keys',
  keyPattern: '^gsk_[A-Za-z0-9]{20,}$',
  keyHint: 'gsk_...',
};

const PATH_KEY = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
const pathDirs = () => (process.env[PATH_KEY] || '').split(';').filter(Boolean);

// Our own Node, npm, Git and FFmpeg come first, so the kit and the CLIs use the tested versions.
export function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  // A Claude Code session that started this app (a developer's terminal) must not leak into the engine's.
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  const ours = [dirname(process.execPath), NPM, join(TOOLS, 'git', 'cmd'), join(TOOLS, 'ffmpeg', 'bin')];
  env[PATH_KEY] = [...ours, ...pathDirs()].join(';');
  // npx.cmd hands off to a global npm when one exists; point "global" at ours so it never does.
  env.npm_config_prefix = NPM;
  return env;
}

// The official installer puts claude.exe in ~/.local/bin and adds it to PATH, but this process may
// predate that install, so look there too.
export function findClaude() {
  for (const dir of [...pathDirs(), join(homedir(), '.local', 'bin')]) {
    const exe = join(dir, 'claude.exe');
    if (existsSync(exe)) return exe;
  }
  return null;
}

const tail = (s, n = 4000) => (s.length > n ? s.slice(-n) : s);

// Runs a program hidden (never a shell string). `onLine` gets each stdout line; a `job` collects
// the child so Cancel can stop it. Resolves { code, out, err } and never rejects.
export function run(cmd, args, { cwd = WORK, env = childEnv(), onLine, input, job, timeout, verbatim = false } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env, windowsHide: true, windowsVerbatimArguments: verbatim });
    } catch (e) {
      resolve({ code: -1, out: '', err: e.message });
      return;
    }
    job?.children.add(child);
    let out = '';
    let err = '';
    let buf = '';
    const timer = timeout && setTimeout(() => kill(child), timeout);
    child.stdout.on('data', (d) => {
      const s = d.toString();
      if (!onLine) return void (out = tail(out + s, 1 << 20));
      buf += s;
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        onLine(buf.slice(0, i).replace(/\r$/, ''));
        buf = buf.slice(i + 1);
      }
    });
    child.stderr.on('data', (d) => (err = tail(err + d)));
    const done = (code, e) => {
      clearTimeout(timer);
      job?.children.delete(child);
      if (onLine && buf) onLine(buf);
      resolve({ code, out, err: e ? e.message : err });
    };
    child.on('error', (e) => done(-1, e));
    child.on('close', (code) => done(code ?? -1));
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}

// Stops a process and everything it started (Windows has no process groups for this).
export function kill(child) {
  if (child?.pid && child.exitCode === null) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  }
}

export const lastLine = (s) => (s || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
