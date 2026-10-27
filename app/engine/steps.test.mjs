import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stepOf } from './steps.mjs';

const codex = (inner) => ({ command: `"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '${inner}'` });

test('reading files never moves the bar', () => {
  assert.equal(stepOf('Read', { file_path: 'kit/video-projects/a/index.html' }), null);
  assert.equal(stepOf('PowerShell', { command: 'cd kit; cat DESIGN.md index.html' }), null);
  assert.equal(stepOf('Bash', codex('Get-Content index.html')), null);
});

test('Claude descriptions and written files pick the step', () => {
  assert.equal(stepOf('PowerShell', { command: 'ffmpeg -i raw.mp4 -af silencedetect -f null -', description: 'Detect silences' }), 'cut');
  assert.equal(stepOf('Write', { file_path: 'kit/video-projects/a/captions.json' }), 'captions');
  assert.equal(stepOf('Write', { file_path: 'kit/video-projects/a/index.html' }), 'hook');
});

test('only a real render counts as Render', () => {
  assert.equal(stepOf('PowerShell', { command: 'npx hyperframes render --help', description: 'Check render options' }), null);
  assert.equal(stepOf('Bash', codex('npx hyperframes render -q standard -o ../../../outbox/a-v1.mp4')), 'render');
});
