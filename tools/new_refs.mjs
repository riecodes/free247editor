// SessionStart hook: tell the agent about reference videos in refvids/ that have no library entry yet.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'refvids');
if (!existsSync(dir)) process.exit(0);

const libPath = join(root, 'styles', 'references', 'library.md');
const lib = existsSync(libPath) ? readFileSync(libPath, 'utf8') : '';
const fresh = readdirSync(dir)
  .filter((f) => /\.(mp4|mov|m4v|webm|mkv)$/i.test(f))
  .filter((f) => !lib.includes(`refvids/${f}`));

if (fresh.length) {
  const list = fresh.map((f) => `refvids/${f}`).join(', ');
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        `New reference video(s) not yet in the Editing Knowledge Library: ${list}. ` +
        'Before anything else this session, tell the user you found them and run the full ' +
        '"Reference videos" analysis from the free247editor skill on each, then save to ' +
        'styles/references/library.md.',
    },
  }));
}
