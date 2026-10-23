# free247editor

![free247editor banner — Drop footage. Shape the story. Refine together.](<https://ghrb.waren.build/render/banner?header=free247editor&subheader=Drop+footage.+Shape+the+story.+Refine+together.&bg=0D1820-1C6B5E&color=FFFFFF&subheadercolor=D8EEE7&headerfont=Inter&subheaderfont=Inter>)

[![License](https://img.shields.io/github/license/riecodes/free247editor?style=flat-square&color=green)](LICENSE) ![Agent Skills](https://img.shields.io/badge/Agent-Skills-8A2BE2?style=flat-square) ![Claude Code](https://img.shields.io/badge/Claude%20Code-ready-D97757?style=flat-square&logo=anthropic&logoColor=white) ![Price](https://img.shields.io/badge/price-free-brightgreen?style=flat-square)

A free, open-source personal video editor that runs inside an AI coding agent, including
Codex, Claude Code, Cursor, Antigravity, Gemini CLI, GitHub Copilot, and Windsurf.

Drop in a raw video and ask for an edit. Get a cut, captioned draft with motion graphics,
zoom-ins, and sound, then give feedback in plain words. It understands English, Tagalog,
and Taglish, and can carry lasting editing notes into future projects.

## ✨ Features

- **Tighter cuts:** remove dead air, breaths, false starts, and retakes.
- **Captions:** choose word-by-word captions, highlighted key words, keyword pills, or subtitles.
- **Short-form editing:** start with vertical 9:16 framing for Reels, TikTok, and Shorts; request a separately composed 16:9 version for YouTube.
- **Motion and reframing:** add animated cards, overlays, and zoom-ins that keep the speaker clear.
- **Style choices:** guide pacing, color, captions, hooks, and sound with plain-language notes.
- **A workflow that learns:** lasting feedback is saved in `my-rules.md` and applied to later edits.
- **Local drafts:** rendered videos stay in `outbox/`; the editor does not post videos for you.

## 🚀 Getting Started

### Requirements

- An AI coding agent that can run terminal commands. The project includes an Agent Skills workflow for Codex and other compatible agents.
- Node.js 22 or newer, Git, FFmpeg (including `ffprobe`), and Chrome or Chromium.
- For transcription, choose a Groq API key or local `faster-whisper` with Python. Groq mode sends extracted audio to Groq; local transcription keeps media on your computer.
- About 1 GB of free disk space.

### Install and set up

Clone the repository and open its folder in your agent:

```sh
git clone https://github.com/riecodes/free247editor.git
cd free247editor
```

In Codex, open this folder as the workspace. Then type `start`. The agent checks your tools,
installs the pinned Herk Edit Kit engine, renders a test video, helps you choose a transcription
option, and walks you through your editing style. Setup needs internet access to download the
engine and any missing dependencies.

When setup finishes, preview `outbox/setup-test.mp4`.

## 📖 Usage

1. Put a source video in `inbox/`, or attach it in your agent's chat.
2. Say **"edit this"** or, in Codex, call `$free247editor`.
3. Review the draft in `outbox/` and describe the changes you want.
4. Continue until the edit is right, then say **"final"** for a full-quality render.

For horizontal YouTube framing, ask for a 16:9 edit. The workflow composes it for that format
instead of simply cropping a vertical version. The output includes an MP4 and an editable
HyperFrames project in `kit/video-projects/<name>`; it does not create a CapCut project. Stock
footage and music are not included. Add your own music and sound effects to `my-sounds/`.

## ⚙️ Configuration

### Transcription

Choose one of these options:

- **Groq:** get a key from [Groq](https://console.groq.com/keys) and add `GROQ_API_KEY` to `.env`. The editor extracts audio from the source video and sends that audio to Groq for transcription.
- **Local:** install Python and `faster-whisper` with `pip install faster-whisper`, then use the local transcription option. Transcription runs on your computer.

The software is free. Your AI agent plan may have its own costs. Groq's current limits and
pricing are set by Groq; the editor will not use paid services such as ElevenLabs or Kie.ai
without asking first.

### Personal style and local files

| Path | Purpose |
| --- | --- |
| `inbox/` | Source footage for edits. |
| `outbox/` | Draft and final MP4s, including the setup preview. |
| `my-style.md` | Your preferred format, pacing, captions, color, graphics, and sound. |
| `my-rules.md` | Lasting preferences learned from your feedback. |
| `my-sounds/` | Music and sound effects you provide. |
| `kit/` | The pinned Herk Edit Kit engine installed by setup. |

Your footage, renders, style, rules, and API key are excluded from Git by `.gitignore`.
When using Groq, extracted audio is sent to Groq as described above.

## 📚 Documentation

- [Editor workflow](.agents/skills/free247editor/SKILL.md): setup, editing, style questions, and how feedback becomes lasting rules.
- [Herk Edit Kit](https://github.com/nateherkai/herk-edit-kit): the editing engine and its video-editing tools.

## 🛠️ Development

The repository has no separate package or test suite. `node setup.mjs` performs the local
setup and renders a test video; it downloads the pinned editing engine into `kit/` and writes
the preview to `outbox/`. To update the engine, change `KIT_COMMIT` in `setup.mjs`. Preserve
any projects under `kit/video-projects/` before replacing the installed `kit/` directory.

Codex and other compatible agents can read the shared skill in `.agents/skills/`. The project
has been tested on Windows 11 with Claude Code; Codex and the other listed agents have not yet
been tested by the maintainers. Claude Code reads the matching skill entry in `.claude/skills/`;
`AGENTS.md` tells agents to load the free247editor skill. The Herk Edit Kit's AI Automation
Society brand assets belong to their owner and are not licensed for reuse.

## 🤝 Contributing

There is no separate contribution guide yet. For a proposed fix or improvement, open an issue
or pull request on the [upstream repository](https://github.com/riecodes/free247editor).
Discuss larger changes in an issue first.

## 🐛 Issues & Support

Report bugs and request improvements in the [upstream issue tracker](https://github.com/riecodes/free247editor/issues).
For questions about a proposed change, use its issue or pull request so the project discussion
stays with the code.

## 📄 License

free247editor is licensed under the [MIT License](LICENSE).

## 👥 Authors & Contributors

Created and maintained by [riecodes](https://github.com/riecodes). See the
[contributors graph](https://github.com/riecodes/free247editor/graphs/contributors) for other
contributors. The editing engine is [Herk Edit Kit](https://github.com/nateherkai/herk-edit-kit)
by [Nate Herk](https://github.com/nateherkai), built on [HyperFrames](https://github.com/heygen-com/hyperframes)
and [GSAP](https://gsap.com/). free247editor is not affiliated with Nate Herk, HeyGen, or any
of the AI agent makers.

