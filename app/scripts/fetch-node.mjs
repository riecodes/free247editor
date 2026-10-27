#!/usr/bin/env node
// Downloads the pinned portable Node for Windows into src-tauri/binaries:
//   node-x86_64-pc-windows-msvc.exe  the engine sidecar (Tauri externalBin)
//   npm/                             npm and npx, which the kit's setup needs
// Safe to re-run: skips when the pinned version is already there.
//
//   node scripts/fetch-node.mjs
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bump deliberately; the hash is from https://nodejs.org/dist/v<version>/SHASUMS256.txt
const VERSION = '24.22.1';
const SHA256 = 'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5';

const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'binaries');
const stamp = join(bin, 'node-version.txt');
if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === VERSION) {
  console.log(`Node ${VERSION} already in ${bin}`);
  process.exit(0);
}

const name = `node-v${VERSION}-win-x64`;
const url = `https://nodejs.org/dist/v${VERSION}/${name}.zip`;
console.log(`Downloading ${url}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
const zip = Buffer.from(await res.arrayBuffer());
const got = createHash('sha256').update(zip).digest('hex');
if (got !== SHA256) throw new Error(`SHA-256 mismatch: got ${got}, want ${SHA256}`);

const tmp = join(tmpdir(), `free247editor-${name}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, 'node.zip'), zip);
// Windows' own bsdtar reads zip files; Git Bash's GNU tar does not.
const tar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const r = spawnSync(tar, ['-xf', 'node.zip'], { cwd: tmp, stdio: 'inherit' });
if (r.status !== 0) throw new Error('could not unzip Node');

const src = join(tmp, name);
rmSync(bin, { recursive: true, force: true });
mkdirSync(join(bin, 'npm'), { recursive: true });
cpSync(join(src, 'node.exe'), join(bin, 'node-x86_64-pc-windows-msvc.exe'));
for (const f of ['npm.cmd', 'npx.cmd']) cpSync(join(src, f), join(bin, 'npm', f));
cpSync(join(src, 'node_modules', 'npm'), join(bin, 'npm', 'node_modules', 'npm'), { recursive: true });
writeFileSync(stamp, VERSION);
rmSync(tmp, { recursive: true, force: true });
console.log(`Node ${VERSION} ready in ${bin}`);
