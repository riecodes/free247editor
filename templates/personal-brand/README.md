# Personal-brand template (a creator's own talking-head style)

For a creator's personal-brand videos (TikTok / Reels): the speaker sits at a desk and talks to camera. It is kept apart
from the testimonial and content templates so that each brand keeps its own look. Its scripts read their own config,
`brand.json`, written by `plan-cut.mjs`.

It was rebuilt from one creator's best-performing video and the notes on its remake (2026-11-24/25). The motion-graphic
B-roll looks come from the sample reels in `my-style-refs/motion/` and a grid reference picture from the user.

## The videos

One mindset or money idea in Taglish, with a "this, not that" flip, two everyday examples, a quotable closing line and a
sign-off. About 60-90 s. Raw clips are 4K portrait phone takes with retakes.

## The style

- **Cut:** the last clean take of each line, in the script's order; tight but natural. Every pause is evened to about
  0.3 s, and the soft tail of each word is kept (the words trail off, and a tighter cut clipped them). Clean voice
  (`cleanVoice: 'medium'`). A look down at the start of a take is hidden with an L-cut (`lcuts`) or covered by a scene.
- **Framing:** ONE steady frame for the whole video (no following, no per-cut crops), punched in (`cropZoom: 1.3`, face
  at 0.45) so the sign on the wall shows on top.
- **Captions (the brand's own):** white Poppins Bold, 2-3 words, on the upper chest (`capTop: 1240`, clear of the chin),
  a rounded gold highlight behind each word while it is said, punctuation kept (`capStyle: 'karaoke'`,
  `capPunct: true`).
- **Pop-out text (`type: 'overlay'`):** plain text over the footage, no boxes, soft shadow.
  - Hook: two blocks that stay up together: a small white line and a big gold italic line at the top left, and another
    pair at the lower right on the chest.
  - Small / BIG / small stacks between the wall sign and the head, on the key phrases; the big word settles from a
    faint ghost.
  - A sign-off line in the same look.
  - Every pop-out text hides the captions under it, because they doubled (user note).
- **Motion-graphic B-roll (no stock clips):** full scenes where the words land as they are said, with an icon drawn on
  the idea and the key word in a gold highlight box.
  - `theme: 'paper'`: a Champagne `#E7D9D7` vignette with Mocha `#68504C` text and decor, a grey swoosh arc, halftone
    dots and a slowly turning asterisk. Used for ideas, answers and examples.
  - `theme: 'grid'` (user notes 2026-11-25: not black, not violet, not silver gray; from the user's reference picture):
    - Look: charcoal with a fine 56 px grid. A soft light glides over it and lights the grid lines gold where it passes.
    - Motion: the grid pans slowly and sweeps open from the center on the way in.
    - Text: white serif words, gold gradient hero words and a gold box. Used for the problem and the hard truth.
  - Behind the words of every scene, a giant outline of its key word slides slowly. A light glint sweeps each gold box
    after it opens.
  - After Effects-level motion (user note 2026-11-25):
    - The scene opens as an iris from the words' center, with a thin gold ring on its edge, and closes the same way.
    - Nothing is static: a slow camera moves on every background; on `paper`, gold trim-path lines draw on.
    - Words rise out of a mask with expo easing and a motion blur.
    - Back-to-back scenes of one look keep the background.
- **Sound (user note 2026-11-25):** no background music. Sound effects only, on whatever happens on screen
  (`music: false`, `textSfx: true`):
  - a soft pluck as each text line lands, a deep hit on big words, the box sounds, and a whoosh in and out of every scene;
  - every sound lines up its loudest moment with the moment its text lands (never on captions);
  - the mix is at -14 LUFS.
- **Colors:** gold `#d2ae63` (the caption highlight) for highlights and gold words; champagne, mocha, charcoal and white.
  No logo end screen.

## Steps and commands

Every video goes through the same 5 review steps as the other templates: Cut → Subtitles → Graphics → Sound → Final. Each
step needs an okay, and its light preview goes to `outbox/`.

1. Set up with `cd kit && npm run new-video -- <slug>`.
2. Copy the raw take to `<P>/assets/raw.mp4`. Remux a .mov first:
   `ffmpeg -i raw.mov -map 0:v:0 -map 0:a:0 -c copy -tag:v hvc1 raw.mp4`.
3. Copy every file here except this README into `<P>/assets/`, and rename `plan-cut.example.mjs` to `plan-cut.mjs`.
4. Run the content template's commands (`templates/content/README.md`, "Commands"):
   - transcribe twice
   - `plan-cut`, `edit-plan`, `track-face`, `render-cut`
   - `build-comp --stage=subs|graphics`, `mix-audio`
   - `npx hyperframes render --sdr`

Always pass `--sdr`. Phone takes are HDR (HLG), which sends the renderer down its slow HDR path (30+ min). With `--sdr`, a
90 s draft takes about 2 min and looks the same.

## Files

| File | Does |
| --- | --- |
| `plan-cut.example.mjs` | the plan with the brand's defaults (room, framing, pauses, captions, brand, sound) and examples of its text and scenes; writes `brand.json` |
| `edit-plan.mjs`, `track-face.py`, `render-cut.mjs` | cut with even pauses, one steady punched-in frame, L-cuts, voice cleanup |
| `build-comp.mjs` | captions, pop-out text, motion-graphic scenes, transitions, the sound cues |
| `prep-broll.mjs`, `prep-music.mjs`, `mix-audio.mjs` | optional clips, an optional music bed, the mix (each sound aligned by its hit) |
