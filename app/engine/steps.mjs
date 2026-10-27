// Which of the five progress steps a CLI tool call belongs to (Transcribe is done by the engine).
// Reading files never moves the bar; Claude's own description of a command says more than the
// command; only a real render counts as Render.
const STEP_RULES = [
  ['cut', /cut|silence|retake|\bedl\b|trim|takes|clean/i],
  ['captions', /caption|subtitle|\.srt\b|\.ass\b/i],
  ['hook', /hook|gsap|motion|composition|index\.html|DESIGN\.md|OPEN-LOOPS|beat|card/i],
];
const READ_ONLY = /^(?:cd\s+\S+\s*(?:;|&&)\s*)?(?:Get-Content|gc|cat|type|ls|dir|Get-ChildItem|gci|rg|grep|Select-String|sls|head|tail|findstr|Test-Path|Get-Item|pwd|echo|Write-Output)\b/i;

export function stepOf(name, input) {
  if (!['Bash', 'PowerShell', 'Write', 'Edit'].includes(name)) return null;
  // Codex wraps each command as "...pwsh.exe" -Command '...'; look at what runs inside.
  const cmd = String(input.command || '').replace(/^"[^"]*(?:pwsh|powershell)(?:\.exe)?"\s+(?:-NoProfile\s+)?-Command\s+['"]?/i, '');
  if (READ_ONLY.test(cmd.trim())) return null;
  if (/hyperframes\s+render(?![^\n;]*--help)|outbox[\\/][\w.-]+\.mp4/i.test(cmd)) return 'render';
  const text = name === 'Write' || name === 'Edit' ? String(input.file_path || '') : String(input.description || cmd);
  return STEP_RULES.find(([, re]) => re.test(text))?.[0] ?? null;
}
