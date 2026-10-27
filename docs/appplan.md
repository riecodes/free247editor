# free247editor app: build spec v1

Written 2026-10-25. This file is the source of truth for the Windows app in `app/`. Read it
top to bottom before writing code.

## What we are building

A free Windows app (MIT, in riecodes/free247editor) that installs everything itself. The
user drops a raw talking-head video on the window and gets an edited MP4 plus an SRT back.
The editing engine is the user's own official Claude Code or Codex CLI, run hidden by the
app. The app never reads, stores or passes on the user's credentials.

### Decisions already made (do not reopen)

1. Name: free247editor.
2. Engine: the user's own CLI, spawned hidden. `claude -p` for Claude Pro or Max,
   `codex exec` for ChatGPT. The user signs in through the CLI's own login flow, which the
   app opens in a visible window. The app only checks the signed-in state and shows which
   plan is in use. Official binaries, unmodified.
3. Engines in v1: Claude and Codex only. No Gemini, OpenCode, Groq LLM or local LLM.
4. Transcription: Groq by default (the app handles the key step). "On this PC" (whisper.cpp)
   is the second choice.
5. Distribution: Microsoft Store plus a direct download (Store is after v1).
6. Windows only.
7. MIT, in this repo.
8. The engine sees what it needs: the transcript plus still frames for face-safe reframing.
9. Light mode by default. A Light / Dark / System pill sits in the header of every screen,
   setup included. The pick is remembered; only System follows Windows.
10. English is the default UI language. Filipino is the optional side of an EN/FIL pill in
    the header. Every FIL string gets a Filipino review that aims for the shortest natural
    phrase. Keep all UI strings in one table with a key, EN and FIL.
11. Copy is short. A screen is a title plus its controls. No helper line, caption or
    sub-heading under a title unless it carries something the user needs: an error, a result,
    or a privacy fact ("Your video stays on this PC.", "We never see your login.").
12. Type: Space Grotesk 600 for titles (letter-spacing -0.025em), Geist for all UI text,
    Geist Mono for numbers, percentages, times, file names and paths. All SIL OFL; bundle them.
13. No brand kit for now: no extra brand colors, fonts, mascot or stickers anywhere in the
    app. Logo: the "Drop" mark in `assets/logo` (approved 2026-10-25): indigo #432DD7 tile,
    #7C86FF clip. The header shows `icon.svg` at 30px next to the first line of
    `wordmark.svg` (no "by riecodes" line at header size), with the "free" and "editor" ink
    #0A0A0A in light and #FAFAFA in dark. The app icon and installer use `icon.ico`.

### Credentials rules

The app drives the user's own installed CLI; it never offers its own Claude or ChatGPT login.

- Never read, copy or parse `~/.claude/.credentials.json`, `~/.codex/auth.json` or any token.
- Sign-in state comes only from `claude auth status --json` and `codex login status`.
- Never call Anthropic or OpenAI endpoints from the app or engine. Only the CLIs do.
- Run the official binaries unmodified.

### Open fact to settle in M3

Whether ChatGPT Free works in the Codex CLI is unclear. Test with a real Free account. If
`codex` answers "upgrade to Plus", the app says so plainly and offers Claude or the upgrade.

## Planned features

| Feature | When |
|---|---|
| First run starts setup by itself in the background; the user only answers six simple questions | v1 |
| Preflight: check free disk (warn under 10 GB) and Windows version before downloading, with a plain message | v1 |
| Proof render: render `outbox/setup-test.mp4` as the last setup check (not shown; the Ready screen is the payoff) | v1 |
| Review shows the draft in a 9:16 phone frame | v1 |
| Say plainly what leaves the PC (Groq audio, transcript and stills to the engine) | v1 |
| Every launch runs `claude auth status --json` / `codex login status` and shows a plain fix inline if one is missing or signed out | v1 |
| Approve runs one FFmpeg export pass: scale or pad to 1080x1920, 30 fps, H.264 (NVENC when present) + AAC, `loudnorm` to -14 LUFS | v1 (M7) |
| Notes become rules: note chips plus free text; "Do this on every video" writes to `my-rules.md` | v1 stretch (M8) |
| Change by asking: note chips plus free text in Review, resumed in the same engine session | v1 stretch (M8) |
| Undo: every draft stays as v1, v2...; "Restore" in the edit log makes an older one current again | v1 stretch (M8) |
| Guided wizard: every option drawn live on a still of the user's clip, then saved as a template | M11 or v1.1 |
| Tap-to-add move chips in Review | v1.1 |
| Loudness and Reels safe-zone checks after render, with warnings inline | v1.1 |
| Face and gaze checks with MediaPipe Tasks (JS/WASM) in the webview, no Python | v1.1 |
| Change one part: select words in the transcript (or drag on a simple timeline); the note goes to the engine with that time range | v1.1 |
| Style from 2 or 3 reference reels: the engine writes `my-style.md`, shown as editable text in Settings | v1.1 |
| A Help button that copies a diagnostic summary (app, CLI and kit versions, last error) to paste in a message | v1.1 |

## Principles

- **Free, with no payment step.** No price, no license approval.
- **Claude or ChatGPT.** Codex covers users who have ChatGPT instead of a Claude plan.
- **The installer handles all of it.** No winget, no UAC prompts, no PATH edits, no
  ExecutionPolicy Bypass, no Git Bash, no chat. Portable tools live in the app folder, and it
  installs Claude Code and Codex too.
- **Drag and drop is the product.** The home screen is a drop zone; progress is shown per
  step with time left.
- **The engine is hidden.** The user never sees a terminal or a chat. Events from the CLI
  become plain progress lines.
- **Persistent feedback.** Selected states, inline errors and results stay on screen where
  the user acted. No toast-only feedback.
- **Light by default, dark one tap away**, on every screen.
- **Short English copy with a reviewed FIL side** (EN/FIL pill).
- **Tested on Windows** before anyone installs it: a clean Windows user or VM, plus the
  development PCs.
- **Updates that are checked** (after v1): a signed manifest with SHA-256 per part and
  rollback, instead of dropping a zip in a folder.

## v1 scope

The smallest app that:

1. installs per user (NSIS, no admin),
2. sets up its tools and the edit kit on first run, with progress,
3. installs Claude Code and Codex if missing and signs the user in through each CLI's own
   login,
4. takes a Groq key,
5. accepts one dropped video,
6. returns `<slug>-v1.mp4` and `<slug>-v1.srt`, shown in a Review screen with Show in folder
   and Approve (runs the export preset, then saves both to `Videos\free247editor\`).

### Out of v1

Microsoft Store and MSIX, the signed update manifest and rollback, a prebuilt kit archive
(v1 runs the existing `setup.mjs` with portable Git), "On this PC" transcription (M10 stretch),
No AI mode, Guided and saved templates (M11 stretch; v1 ships the Default template), multiple
videos in a queue, Explorer right-click, usage display, MediaPipe face checks, changing only a
selected range, styles made from reference videos, the Help diagnostic button, CapCut export,
macOS.

## Repo layout

The app lives in `app/` and its docs in `docs/`. Leave `kit/` alone (each machine installs its
own). Do not change the root `setup.mjs`, `tools/` or `.agents/skills` unless a milestone
cannot pass without it; if so, make the smallest change.

```
free247editor/
  app/                      the Windows app
    package.json            Vite + React + TypeScript + Tailwind + shadcn
    src/                    UI: screens Setup, Home, Editing, Review; theme pill
    src-tauri/              Tauri 2 (Rust): window, sidecar, keyring commands, NSIS config
      binaries/             node-x86_64-pc-windows-msvc.exe (downloaded, not committed)
    engine/                 Node engine, plain ESM .mjs, no build step
      main.mjs              JSON-lines protocol on stdin/stdout
      setup.mjs             first-run setup steps
      drivers/claude.mjs    spawn claude -p hidden, parse stream-json
      drivers/codex.mjs     spawn codex exec hidden, parse --json
      srt.mjs               words to SRT
      srt.test.mjs          node --test
      default-style.md      the style used until the style quiz exists
    scripts/fetch-node.mjs  downloads the pinned portable Node into src-tauri/binaries
    README.md
  docs/appplan.md           this file
  kit/  setup.mjs  tools/  .agents/  AGENTS.md  ...   unchanged
```

`.gitignore` lists `app/src-tauri/binaries/` and `app/dist/`. `node_modules` and `target` are
ignored too.

## Stack

- **Shell:** Tauri 2, React, TypeScript, Vite, Tailwind, shadcn.
- **Engine:** portable Node 24 as a Tauri sidecar (`externalBin`), running
  `app/engine/main.mjs`. The UI talks to it with `@tauri-apps/plugin-shell`
  (`Command.sidecar`), JSON lines over stdin/stdout. No Rust needed for the protocol.
- **Drops:** `getCurrentWebview().onDragDropEvent()` (real file paths).
- **Secrets:** the Groq key in Windows Credential Manager through the Rust `keyring` crate
  (two Tauri commands: `set_groq_key`, `has_groq_key`; the engine gets it as the
  `GROQ_API_KEY` environment variable when spawned). Never write it to disk.
- **Theme:** CSS tokens with light values on `:root`; the pick saved with
  `@tauri-apps/plugin-store`; System uses `prefers-color-scheme`.
- **Video in Review:** `<video>` with `convertFileSrc()` and the asset protocol scoped to the
  work folder.
- **Folders at runtime:**
  - `%LOCALAPPDATA%\free247editor\tools\` portable FFmpeg, MinGit, Codex CLI
  - `%LOCALAPPDATA%\free247editor\work\` a copy of this repo's workspace files (AGENTS.md,
    CLAUDE.md, `.agents/`, `.claude/`, `tools/`, `setup.mjs`), plus `templates\` (one
    folder per style, `default` first), where `setup.mjs` installs `kit/`
  - `Videos\free247editor\` approved finals
  - Dev builds use `%LOCALAPPDATA%\free247editor-dev\` so testing never touches a real
    install or this repo's `kit/`.

### First-run setup (engine/setup.mjs)

Each step reports `{ step, status, percent, message }`. Each step is skippable when already
done, so a second run is a no-op.

1. Preflight: Windows 10 22H2 or newer, free disk (warn under 10 GB, stop under 4 GB).
2. FFmpeg: download a pinned gyan.dev essentials build, check its SHA-256, unzip into
   `tools\ffmpeg`.
3. Git: download pinned MinGit (64-bit) from the Git for Windows releases, check SHA-256,
   unzip into `tools\git`. Only `setup.mjs` uses it.
4. Workspace: copy the workspace files into `work\` (from the app's bundled resources), and
   `engine/default-style.md` to `work\templates\default\style.md` if missing (see Templates
   below; v1 has only this one).
5. Kit: run `node setup.mjs` in `work\` with `PATH` prefixed by the portable Node, Git and
   FFmpeg folders. It clones the pinned kit, runs `npm ci` and renders the test video. If the
   render fails on Chrome, run `npx hyperframes browser ensure` in the kit and retry once.
6. Claude Code: if `claude` is missing, run the official installer
   (`irm https://claude.ai/install.ps1 | iex`, per user). Do not modify it.
7. Codex: `npm install --prefix tools\codex @openai/codex@<pinned>` with the portable Node.
8. Keep `work\outbox\setup-test.mp4` as the proof the render works; the first-run screens
   (below) show only the ring, not the video or a tool list.

### First-run screens: the wait is the onboarding

No install checklist on screen. The setup steps above run in the background from the first
launch; the user sees one calm loading experience and answers a few simple questions while
it works.

- **One abstract progress element.** A single ring with the overall percent (weighted by the
  download sizes), a friendly phase line and the time left. Map the steps to four phases, never
  tool names: "Inihahanda ang editor mo" (preflight, workspace), "Kinukuha ang video tools"
  (FFmpeg, Git, kit), "Sinusubukan ang unang render" (proof render), "Halos tapos na" (the rest).
  One subtle breathing motion on the ring, off under `prefers-reduced-motion`; no confetti.
- **The questions are the wait.** One question per screen, big tap targets (at least 96 px
  tall cards), the title only (no helper line), Back, Next and Skip on every screen. The setup
  percent sits in a small ring at the top of each question.
  1. Pangalan (text, optional; used for greetings only, stored in settings).
  2. Anong klaseng video: talking head, vlog, tutorial, product.
  3. Saan nagpo-post (multi): TikTok, Reels, Shorts, YouTube.
  4. Language sa videos: Taglish, Tagalog, Bisaya, English, iba-iba.
  5. Vibe: four live sample frames drawn in CSS on a bundled sample still: One Big Word,
     Forest Editorial, Cream Card, Kallaway Split.
  6. Engine: Claude or ChatGPT cards plus the sign-in (see Sign-in), and the Groq key row
     (see Groq key). "Sign in later" skips to No AI for now.
- **Answers write `templates\default\style.md`** (the front matter in Templates plus generated
  sentences), so the first Quick edit already matches the user:
  - make: talking head and tutorial default to tight pace; vlog to natural pace and the
    multi-clip flow; product to a follow card at the end.
  - post: TikTok, Reels or Shorts set vertical 9:16 and that app's safe zone; YouTube alone
    sets horizontal; YouTube plus any other sets both.
  - language: passed to transcription as a language hint (Taglish and Tagalog as `tl`, English
    as `en`; Bisaya and "iba-iba" let the model detect it) and written into the style so captions
    keep the words as spoken.
  - vibe: the style name plus its defining rules (fonts, caption size and place, palette taken
    from the footage).
- **Something light to play.** Beside the ring: "Alin ang mas nakaka-hook?", two hook lines,
  tap the stronger one; the result and the reason stay on screen with Susunod and a running
  score. Bundle at least 10 pairs; it works offline.
- **Order.** Install Claude Code and Codex early in the background (they are small), so the
  sign-in on question 6 is ready by then. If the questions finish first, the Ready screen keeps
  the ring and the game, titled "Tapos na ang mga tanong, <name>. Konting hintay na lang." If
  setup finishes first, it waits quietly; the ring turns to "Ready na" and the questions carry
  on. When both are done: "Ready ka na, <name>!" with one button, "I-drop ang unang video".
- **Errors stay on screen.** A failed step pauses the ring and shows a card under it: what
  happened in plain words, "Try again" (resumes from the failed step), and "Copy details for Eirmon"
  (the Help diagnostics). The questions and the game keep working. Never a toast alone.
- Light mode first, with the theme pill in the header of every first-run screen.

### Sign-in

A signed-in Claude Desktop app does not sign in the Claude Code CLI: Desktop's Code tab uses
its own bundled Claude Code, and `claude auth status --json` still reports `loggedIn: false`.
So: if `claude auth status` says signed in, skip; otherwise open `claude auth login --claudeai`
(browser, one Authorize click).

- Claude: button opens a visible console running `claude auth login --claudeai`. Status:
  `claude auth status --json`, poll every 2 s while the login window is open.
- ChatGPT: button runs `codex login` (opens the browser). Status: `codex login status`.
  Device-code fallback: `codex login --device-auth`.
- The header pill shows the engine and plan once signed in. Signing out is the CLI's own
  `claude auth logout` / `codex logout`.

### Groq key

A "Transcription" block on question 6, under the engine sign-in: two radio cards, the cloud
provider (default, Groq today) and "On this PC" (whisper.cpp, no key). The provider may
change (Bisaya and Taglish accuracy is still being compared), so keep its name, key page URL
and key format in one config object in the engine (`TRANSCRIBE_PROVIDER`) and read the UI
labels from it; nothing else hard-codes "Groq". For the cloud choice: a masked key field,
"Kunin ang libreng key", and "I-test ang key", with the result inline ("Gumana ang key.
Na-save sa Windows Credential Manager." or what to fix). The button opens
https://console.groq.com/keys in the default browser. The user clicks Create API Key and
pastes it into a masked field. Trim whitespace; accept a pasted key with surrounding quotes or
spaces. Validate by transcribing a bundled 3-second sample; show the result inline (never as a
toast alone).

### One edit (engine/main.mjs plus a driver)

1. Copy the dropped file to `work\inbox\<slug>.<ext>`, where the slug is the file name in
   lowercase with anything other than a-z, 0-9 and `-` replaced. Accept mp4, mov, m4v, mkv,
   webm in any orientation; reject anything else inline under the drop zone.
2. Transcribe with `node tools/transcribe.mjs inbox/<slug>.<ext>` (Groq), giving
   `inbox/<slug>.json`.
3. Spawn the engine hidden (`spawn` with an argument array, `windowsHide: true`, `cwd` the
   work folder, never a shell string). Write the brief to stdin:
   > edit this: inbox/<slug>.<ext>. Its word-level transcript is inbox/<slug>.json, already
   > done. Follow the free247editor skill's edit flow. For this edit, use
   > templates/<template>/style.md as the style (instead of my-style.md), plus my-rules.md. Do
   > not ask questions; when something is unclear, choose the default and say which. Render
   > the draft to outbox/<slug>-v1.mp4. When it is rendered, end your reply with the line
   > DRAFT: outbox/<slug>-v1.mp4
   - Claude: `claude -p --output-format stream-json --verbose --permission-mode acceptEdits
     --allowedTools "Bash Read Write Edit Glob Grep"`. If a run stalls on a permission, use
     `--dangerously-skip-permissions`. Keep the `session_id` from the init event.
   - Codex: `codex exec --json -C <work> -s workspace-write --skip-git-repo-check -`. If it
     stalls on an approval, use `--dangerously-bypass-approvals-and-sandbox`. Keep the
     `thread_id` from the first event. A `turn.failed` with a usage-limit message shows its
     reset time in the app.
4. Map events to the five progress steps (Transcribe, Cut, Captions, Hook and motion,
   Render) by tool name and command text; show the latest plain-language line.
5. Find the draft: the `DRAFT:` line, else the newest `outbox/<slug>*.mp4`.
6. SRT: transcribe the draft MP4 itself, then `srt.mjs` groups words into captions (at most
   42 characters and 2.5 s per cue, break at sentence ends and pauses over 0.6 s) and writes
   `outbox/<slug>-v1.srt`. Timing comes from the final cut, so it always lines up.
7. Review: play the draft, Show in folder. Approve runs the export preset (one FFmpeg pass:
   1080x1920 with padding if the draft is another size, 30 fps, H.264 with `h264_nvenc` when
   available else `libx264`, AAC, `loudnorm=I=-14:TP=-1.5:LRA=11`) and writes the MP4 and the
   SRT to `Videos\free247editor\<slug>-final.mp4` / `.srt`.
8. Startup: every launch re-checks both CLIs' sign-in state and the kit, and shows any fix
   inline on the home screen.

## Two paths after the drop: Quick and Guided

- **Quick** (v1): drop and go with the template that has the check in the sidebar. In v1
  there is one template, Default, so the drop goes straight to the edit.
- **Guided** (M11 if v1 is done, else the first v1.1 item): after the drop, a choice screen
  offers Quick or Guided as two radio cards (the pick stays marked). Guided is an eight-step
  wizard: Start (format, pace), Colours, Fonts, Hook, Captions (style, position, safe zone),
  Visuals (graphics amount, zoom), Extras (sound effects, music, end card), Watch. A step bar
  on top (each step clickable, done steps checked), a progress bar, "Step N sa 8", Back and
  "Next: <step>".
- **Live on the user's own clip.** On the drop, FFmpeg grabs one still at the start of the
  second transcript sentence. Every option is drawn as HTML/CSS over that still in the webview
  (caption text in the chosen font, colour and position, the hook card, the safe-zone
  overlay), so each tap updates instantly with no engine call. Bundle the fonts (all SIL OFL:
  Anton, Bebas Neue, Montserrat, Poppins, Archivo Black) in the app and copy the same files into
  the kit project, so the preview matches the render.
- **Watch** renders a 6-second preview of the clip with the chosen captions and hook, using a
  fixed HyperFrames preview composition (no engine call). If that composition is not ready,
  Watch shows the still with the choices and a summary.
- **Save as my template.** Watch ends with "Save as my template" (primary) and "Edit
  without saving". Saving opens a right-side drawer: name (required, unique, trimmed,
  40 characters), the summary of choices, "Use for Quick" (on by default), then
  "Save and edit". The new template appears in the sidebar with the check, plus an
  inline "Na-save" line that stays.
- **Templates are style files, the single source both paths read.** Each one is
  `work\templates\<slug>\style.md`: a front-matter block with the wizard values, then plain
  sentences the app writes from them, which is what the engine reads. Quick passes the active
  template's path in the brief. The sidebar lists them as a radio group; the active one is
  stored in the app settings. This is also where v1.1's "style from 2 or 3 reference reels"
  writes its result.

  ```
  ---
  name: Style ko 1
  format: vertical
  pace: tight
  colour: yellow
  font: anton
  hook: big
  captions: word
  position: upper
  safe: off
  visuals: some
  zoom: on
  sfx: pop
  music: none
  cta: none
  ---
  Vertical 9:16. Tight pace: cut every breath and pause. Captions word by word in Anton,
  white with yellow key words, in the upper third. ...
  ```

- **Sidebar** (home, the choice screen, Guided and Review): Engine ("Claude connected · Pro"
  or "ChatGPT connected · Plus", from the status commands; plan usage only when the CLI
  reports it in its events, otherwise no meter), Templates, and on Review an Edit log of every
  version with its note and time, where "Restore" makes an older version current (the undo).
  The engine line ships with M3, the edit log with M8, templates with M11.
- **Safe zone** overlay for TikTok, Reels and Shorts: in the Captions step (M11) and as a
  toggle on the Review player (v1.1).

## Milestones, in order, each with its check

Run each check before starting the next milestone.

| # | Milestone | Check |
|---|---|---|
| M0 | Scaffold `app/` (Tauri 2 + React + shadcn), header with the theme pill and the EN/FIL pill, one strings table, fonts per Decision 12 | `npm run tauri dev` opens in light mode; the pill switches to Dark and System; the choice survives a restart |
| M1 | Engine sidecar and JSON-lines protocol | `node app/engine/main.mjs --selftest` prints `ok`; the app shows "Engine ready" |
| M2 | First-run setup steps 1 to 5 and 8, behind the first-run screens (ring, six questions, hook game, Ready) | On an empty `%LOCALAPPDATA%\free247editor-dev`, the app shows the ring with no tool list, the questions can be answered while setup runs, the answers produce `templates\default\style.md` with the expected front matter, and setup ends with `work\outbox\setup-test.mp4` rendered; with the network cut mid-download, the paused card appears and "Subukan ulit" resumes; a second run finishes in seconds and changes nothing |
| M3 | Claude Code and Codex install, sign-in, and the startup check | After login the pill shows the plan from `claude auth status --json` / `codex login status`; after `claude auth logout` the next launch shows signed out with the fix inline. Try one ChatGPT Free account and write down what `codex` says |
| M4 | Groq key in Credential Manager | Saving a key transcribes the 3-second sample and shows the words inline; the key appears in Credential Manager and nowhere on disk (`grep` the work folder) |
| M5 | Drop to draft with Claude | Dropping a 30 to 60 s vertical sample gives `outbox/<slug>-v1.mp4` that plays; no console window flashes; the claude process has exited |
| M6 | Same with Codex | Same check with the Codex engine selected |
| M7 | SRT, Review and the export preset | `node --test app/engine/srt.test.mjs` passes; the SRT lines up with the draft in VLC; Approve puts both files in `Videos\free247editor\`, and `ffprobe` shows 1080x1920, 30 fps, h264 + aac while an `ebur128` pass reads about -14 LUFS |
| M8 | Stretch: notes to v2, and undo | A note chip plus text resumes the same session (`claude --resume <id>` / `codex exec resume <id>`) and gives `-v2.mp4`; "Do this on every video" adds a line to `my-rules.md`; "Restore" on v1 makes it current again |
| M9 | Installer | `npm run tauri build` gives an NSIS per-user setup exe; on a clean Windows user account it installs without an admin prompt, first-run setup passes, and one edit (M5) works |
| M10 | Stretch: "On this PC" transcription | whisper.cpp (pinned release, CUDA build when an NVIDIA GPU is present, else CPU) writes the same JSON shape as `tools/transcribe.mjs` |
| M11 | Stretch: Guided, templates and the sidebar list (else first in v1.1) | After a drop, choosing Guided walks all 8 steps with each tap redrawing the still at once; Save writes `templates\<slug>\style.md` with the front matter above, the sidebar shows it checked, and the next Quick edit's brief names that file |

## UI rules for every screen

- Light by default; the theme pill is on every screen (see Decision 9).
- Feedback stays where the user acted: selected cards and chips keep a visible selected
  state (border, fill and a check icon, never color alone); errors appear inline next to the
  control with what to do; results stay on screen.
- Touch targets at least 44 px; visible focus rings; real `<button>` and `<label>`.
- No em dashes anywhere (code, comments, UI copy, commit messages).
- English by default, FIL on the pill, every string from the one strings table (Decision 10).
  The language pill is exactly two options, EN | FIL, never a third, and EN is the default.
- FIL string rulings (2026-10-25): the language option "Mixed" reads "Mixed" in both EN and
  FIL (no "Halo-halo"); "Try ulit" is approved; "Habang nag-aantay" stays as written.
- Title plus controls; subtext only for errors, results and privacy facts (Decision 11).
- Fonts per Decision 12; no brand kit (Decision 13).
