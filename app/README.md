# free247editor for Windows

The desktop app: drop a raw talking-head video on the window and get an edited MP4 plus an
SRT back. It installs its own tools on first run, and the editing is done by the buyer's own
Claude Code or Codex CLI, run hidden. The app never reads, stores or passes on their login;
it only asks each CLI whether it is signed in. The build spec is `../docs/appplan.md`.

## Run it (dev)

Needs Node 22+, Rust (rustup) and the VS Build Tools C++ workload.

```
cd app
npm install
npm run tauri dev
```

`npm run tauri dev` first runs `scripts/fetch-node.mjs`, which downloads the pinned portable
Node (checked by SHA-256) into `src-tauri/binaries/` (git- and Syncthing-ignored). Dev builds
keep their tools and work folder in `%LOCALAPPDATA%\free247editor-dev\`, so they never touch a
real install or this repo's `kit/`.

## Build the installer

```
npm run tauri build
```

Gives a per-user NSIS setup in `src-tauri/target/release/bundle/nsis/` (no admin prompt).

## Checks

```
node engine/main.mjs --selftest     # prints ok
npm test                            # SRT grouping, style files, progress steps
npx tsc -b && npx eslint .
```

## How it fits together

| Part | What it does |
| --- | --- |
| `src/` | React + Tailwind + shadcn UI: first run (setup ring, six questions, hook game), Home (drop zone), Quick or Guided, Editing, Review; EN/FIL and theme pills; every string in `src/lib/strings.ts` |
| `src-tauri/` | Tauri 2 shell: window, the Node sidecar, Groq key in Windows Credential Manager (`set_groq_key`, `has_groq_key`), NSIS config |
| `engine/main.mjs` | The engine, JSON lines on stdin/stdout: status, setup, sign-in, key test, edit, notes, approve |
| `engine/setup.mjs` | First run: preflight, FFmpeg and MinGit (pinned, SHA-256), workspace copy, the kit via the repo's `setup.mjs`, Claude Code and Codex |
| `engine/drivers/` | `claude -p --output-format stream-json` and `codex exec --json`, events turned into progress |
| `engine/srt.mjs` | Words to SRT: at most 42 characters and 2.5 s per cue, breaks at sentence ends and pauses, never overlapping |
| `engine/style.mjs` | First-run answers and Guided picks to a template's `style.md` (front matter plus the sentences the CLI reads) |
| `engine/steps.mjs` | Which progress step a CLI tool call belongs to |
| `engine/fonts/` | The five OFL caption fonts Guided offers (licenses beside them) |

At runtime: `%LOCALAPPDATA%\free247editor\tools\` (FFmpeg, MinGit, Codex), `work\` (the
workspace the CLI edits in, with `templates\default\style.md`), `jobs\` (one JSON per video)
and finals in `Videos\free247editor\`.

What leaves the PC: the audio goes to Groq for the transcript, and the transcript plus a few
still frames go to the buyer's own Claude Code or Codex. The video file stays local.
