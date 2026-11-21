# Looks library

One folder per Look. Each has `look.md` (when to use it and the design rules), `look.json` (fonts, caption rules,
motion), `look.css` (layout and treatment) and `fonts/` (the .woff2 files it ships).

| Look | Feels like | Fonts | Captions | Cards | Motion |
|---|---|---|---|---|---|
| `luxury` | calm, expensive, editorial | Playfair Display + Inter Light | serif sentence case, low band on a dark shade, gold italic key words | no boxes, gold hairlines | slow blur fades, 4 % push |
| `bold` | loud, fast, opinionated | Inter Tight 900 | 1-2 giant outlined caps words, key word on a volt box | tilted solid-color stickers, hard shadows | 0.15 s overshoot pops, punch zooms |
| `minimal` | clear, modern, trustworthy | Plus Jakarta Sans | small left-aligned frosted chip, bold + sage underline | frosted white cards, sage checks | calm 0.3-0.5 s rises |
| `warm` | friendly, human, cozy | Fraunces + DM Sans + Great Vibes | cream pill low on the frame, terracotta serif key words | taped paper notes, script titles | soft bounces, warm grade |

## Picking a Look

1. Read the transcript and look at the footage. Match it against each `look.md` "When to use".
2. Read `history.json`. Do not pick the Look used last, unless the user names it.
3. Put the Look's name in the storyboard ("Look: Warm lifestyle") so the user can swap before the render.
4. After the user approves, build with `--record <slug>` so `history.json` gets the new entry.

## Building

`python looks/build_look.py <look> <project_dir> <config.json> [--record <slug>]`
writes `index.html` with the Look's fonts, captions, hook, list card and motion. See the docstring for the config.
Ad-hoc effects (ai-impact templates, CTA cards) should use the Look's colors and fonts from `look.json`/`look.css`.

## Preview

`kit/video-projects/looks-preview/` holds the same 8.5 s of footage built in every Look
(`outbox/looks-preview-<look>.mp4`, side-by-side in `outbox/looks-preview-sheet.jpg`).
