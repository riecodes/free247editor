// The buyer's own Claude Code, headless: `claude -p` with the brief on stdin, stream-json events out.
import { findClaude, lastLine, run, WORK } from '../lib.mjs';

// Only the project's settings: a buyer's own hooks, plugins and MCP servers stay out of the edit.
const ARGS = [
  '-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
  // PowerShell is Claude Code's shell on a PC without Git Bash.
  '--allowedTools', 'Bash,PowerShell,Read,Write,Edit,Glob,Grep,Skill',
  '--setting-sources', 'project,local', '--strict-mcp-config',
];

// `model` is unset for the CLI's own default for the plan (Sonnet on Pro, the strongest on Max),
// or 'sonnet' when the buyer picks Faster.
export async function edit({ brief, resume, model, job, onTool, onText }) {
  const exe = findClaude();
  if (!exe) throw new Error("Can't find Claude Code. Open setup to install it.");
  let session = resume || null;
  let result = null;
  const args = [...ARGS, ...(model ? ['--model', model] : []), ...(resume ? ['--resume', resume] : [])];
  const r = await run(exe, args, {
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
      if (e.session_id) session = e.session_id;
      if (e.type === 'assistant') {
        for (const c of e.message?.content || []) {
          if (c.type === 'tool_use') onTool(c.name, c.input || {});
          else if (c.type === 'text') onText(c.text);
        }
      }
      if (e.type === 'result') result = e;
    },
  });
  if (job.cancelled) throw Object.assign(new Error('Cancelled.'), { code: 'cancelled' });
  if (!result) throw new Error(`Claude Code stopped. ${lastLine(r.err)}`);
  if (result.is_error || result.subtype !== 'success') {
    const msg = String(result.result || result.subtype);
    throw new Error(/limit/i.test(msg) ? `Your Claude plan hit its usage limit: ${msg}` : `Claude Code could not finish: ${msg}`);
  }
  return { session, text: result.result || '' };
}
