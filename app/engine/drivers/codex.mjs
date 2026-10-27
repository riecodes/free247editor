// The buyer's own Codex CLI, headless: `codex exec --json` with the brief on stdin.
import { existsSync } from 'node:fs';
import { CODEX_JS, lastLine, run, WORK } from '../lib.mjs';

// workspace-write keeps writes inside work\; the kit's render and Groq still need the network.
const FLAGS = ['--json', '--skip-git-repo-check', '-s', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true'];

export async function edit({ brief, resume, job, onTool, onText }) {
  if (!existsSync(CODEX_JS)) throw new Error('The Codex CLI is not installed yet. Open setup.');
  const args = resume
    ? [CODEX_JS, 'exec', ...FLAGS, 'resume', resume, '-']
    : [CODEX_JS, 'exec', ...FLAGS, '-C', WORK, '-'];
  let session = resume || null;
  let text = '';
  let failure = null;
  let lastError = '';
  const r = await run(process.execPath, args, {
    cwd: WORK,
    job,
    input: brief,
    onLine: (line) => {
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        return;
      }
      const item = e.item || {};
      if (e.type === 'thread.started') session = e.thread_id;
      else if (e.type === 'item.started' && item.type === 'command_execution') onTool('Bash', { command: item.command });
      else if (e.type === 'item.started' && item.type === 'file_change') onTool('Edit', { file_path: item.changes?.[0]?.path || '' });
      else if (e.type === 'item.completed' && item.type === 'agent_message') onText((text = item.text || ''));
      else if (e.type === 'item.completed' && item.type === 'reasoning') onText(item.text || '');
      else if (e.type === 'turn.failed') failure = e.error?.message || 'turn failed';
      else if (e.type === 'error') lastError = e.message || '';
    },
  });
  if (job.cancelled) throw Object.assign(new Error('Cancelled.'), { code: 'cancelled' });
  if (failure) {
    throw new Error(/limit/i.test(failure) ? `Your ChatGPT plan hit its usage limit: ${failure}` : `Codex could not finish: ${failure}`);
  }
  if (r.code !== 0 && !text) throw new Error(`Codex stopped. ${lastError || lastLine(r.err)}`);
  return { session, text };
}
