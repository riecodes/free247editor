# Testimonial template (landscape and portrait)

The saved editing style for No Money Down / RTC testimonials, from the first approved testimonial (2026-10-22).
Same look in both shapes: set `"format": "landscape"` (1920x1080) or `"portrait"` (1080x1920) in
`testimonial.json`. Everything else in the style is shared.

## The style

- **Story:** open on the speaker's strongest line (hook). Then name and work, why they joined, and the
  supporting reasons (family, results). Then the biggest lesson, the recommendation ("100%"), and a closing
  line. Drop weak lines and keep the last clean take of any retake.
- **Cuts:** tight. Pauses over 0.28 s are trimmed at real silence, never inside a word. Remove "uhm"/"uh" and
  the false starts around them, but leave a filler that runs straight into a word.
- **Framing:** fixed, no face tracking (2026-10-22). Landscape keeps the full frame as shot; portrait from
  landscape footage uses one fixed 9:16 crop placed where the speaker usually is. Emphasis zooms push in on
  the face.
- **Zoom:** only on emphasis lines. Each one eases to 1.10 and back. There is no zoom on every cut.
- **Hook:** a dark label with a short setup line, plus big red text with a white edge in the first seconds,
  on the chest and clear of the face (`"hook": { ..., "top": 770 }` lowers it in landscape; `"minSeconds": 2.6`
  keeps the card up long enough to read when the hook line is very short).
  Subtitles start after the hook.
- **Captions:** Poppins Bold, fixed 42px, white with a drop shadow, no box, one line. Portrait takes up to 3
  words; landscape takes up to 6 words / about 40 characters. "No Money Down" and "BMV" are spelled as in
  my-rules.md. `"capTop": 1150` moves the line up (portrait default 1395, landscape 905). `"capKeywords":
  ["effort", "room rental", ...]` (bare words/phrases from cut.json) shows those words in the hook style:
  red, uppercase, 60px, white outline, with a pop. A phrase only matches inside one caption line.
  `"emphTop": 1330` moves the emphasis cards (portrait default 1020) so they clear a raised caption line.
  `"splits": [{ "from": anchor, "to": anchor, "tag", "title", "note"?, "chart": { "type": "bars"|"stats", "items":
  [{ "label", "display", "value"?, "gold"? }] } }]` (content/ad style): the footage zooms out into a framed card,
  a blurred copy fills the back, and a data panel drops in above (bars grow and count up; stat rows slide in), then
  everything returns to full frame. An item may carry "at": anchor so it lands as it is said. Keep pills, cards
  and zooms out of split windows.
  4K final: `CUT_SCALE=2 node render-cut.mjs` (writes cut-4k.mp4), `FOOTAGE=cut-4k.mp4 node build-comp.mjs`, then render with
  `--resolution portrait-4k` (or landscape-4k) and `--frames-cache-dir` on D: so C: does not fill up.
  `"sounds": { name: "pack/file" }` adds any my-sounds file by name; `"extraSfx": [{ at, k, gain?, offset?, pre?, len? }]` puts a
  sound on a word ("pre": a riser that ends on it); kinetic cards take "boxSfx"/"boxGain" for the red-box pop.
  `"music": false` mixes voice + SFX only (no bed); `"sfxTrim": 6` raises every SFX (default 3 dB).
  `"look": "premium"` restyles the hook, pills, cards, data panels and split frame: frosted glass, hairline borders,
  letter-spaced gold labels, thin red-to-gold accent lines, blur-in entrances (content and ad videos).
  Emphasis types: "words", "big", "strike", plus "title" ({ label, text }: a headline revealed word by word under a
  small gold label) and "stack" ({ lines: [{ text, at, style: gold|dim|white }], until|hold }: lines that land as they
  are said). Any card takes "top" to move it. The hook takes an optional "sub" line.
  "kinetic" ({ from, lines: ["*italic* BIG [BOX]", ...], until|hold, top? }): text like the approved motion-text hook that lands
  word by word on the voice ([SHOWN=spoken] when the box text differs, ~word for an unspoken word); captions step
  aside under it. "full": true makes it a full-screen text scene with no face (the approved full motion-text look: drifting red background,
  or white with "theme": "light"), for a few strong lines. Captions under a kinetic card are hidden; words outside it keep their caption
  ("kineticCaptions": true would keep them all and lift the cards above the caption line; the user prefers them hidden). Keep lines short (2-4 words) so the words stay big.
  `"safe": { "x": 203, "y": 278, "w": 712, "h": 1179 }` (portrait) lays every text block out inside the social apps' safe zone
  (my-style-refs/social-safe-zone-portrait.png): captions, kinetic text, the hook headline, big cards and the name card (a "\n" in hook.big breaks it into two bigger lines) (add "safeCards": true to fit cards and
  panels too; the user wants cards and panels left as they are). A kinetic card always holds its last word ~0.65 s.
  `"capStyle": "kinetic"` animates captions like the motion-text style (my-style-refs/motion-text-style.md): each
  word blurs in as it is spoken, connector words in italic serif, the rest bold sans, capKeywords in a red box.
  Needs assets/gsap.min.js (`npm run new-video` copies it).
- **Brand red #aa0000:**
  - section pills at the top ("WHY SHE JOINED", ...)
  - the name card's edge
  - emphasis cards: `words` (box plus red underline), `strike` (the old idea struck, the new one in a red
    pill), `big` (a huge red number)
- **Sound:**
  - Voice cleanup.
  - SFX from my-sounds, peak-normalized (set `"sfx"` on an emphasis card to vary repeated sounds, e.g. pop / ding / thump for three numbers): thump on the hook, whooshes on pills, swish, paper rip and pop on
    the strike card, ding on "100%", and a whoosh on the logo.
  - An uplifting instrumental bed from `my-sounds/Epedemic Music`, about 19-20 dB under the voice while
    speaking (ducked), heard from the very start: skip a quiet intro with `"musicStart"` and set `"musicEven": true`.
  - -14 LUFS master.
- **Ending:** a 3.2 s end screen with the RTC Community logo (`my-style-refs/rtc-logo.png`) on dark; the
  music fades to silence.
- **Deliverables:** one review file per step (below), with notes coming back in chat (no timeline page or
  editor; they were removed to save credits), then the final at high quality.

## The 5 review steps (my-rules.md)

Stop after each step, show the file, and wait for the user's "okay" or notes. A note on an earlier step redoes
only that step and the ones after it. "tuloy-tuloy na" / "diretso na sa final" means run the rest without
stopping. Steps 1-4 are quick previews; only step 5 renders at high quality.

| Step | What | Show |
| --- | --- | --- |
| 1 | Cut + story: tight cuts, uhms/retakes removed, story order, clean voice, fixed framing | `outbox/<slug>-1-cut.mp4` (copy of cut.mp4, no render) + story-order list + what was dropped |
| 2 | Subtitles | `outbox/<slug>-2-subs.mp4` |
| 3 | Motion graphics + emphasis zooms + logo end screen | `outbox/<slug>-3-graphics.mp4` |
| 4 | Sound effects + background music | `outbox/<slug>-4-sound.mp4` |
| 5 | Final: high quality, final checks, step files to the Recycle Bin | `outbox/<slug>-final.mp4` |

## Commands

Run these from the repo root unless noted. `<P>` is `kit/video-projects/<slug>`.

**Step 1: cut + story**

1. Set up the project:
   - `cd kit && npm run new-video -- <slug>`
   - copy the inbox video to `<P>/assets/raw.mp4`
   - copy every file in `templates/testimonial/` into `<P>/assets/`
   - copy `my-style-refs/rtc-logo.png` to `<P>/assets/`
2. Transcribe twice:
   - `node tools/transcribe.mjs <P>/assets/raw.mp4` (writes raw.json)
   - `node tools/transcribe.mjs <P>/assets/raw.mp4 --prompt "Um, so, uh, I joined, uhm, because, ah, I believe, um, in the system. Uh, yeah." --out <P>/assets/raw-fillers.json`
3. Write `<P>/assets/testimonial.json` from `testimonial.example.json`:
   - `format` (ask landscape or portrait)
   - `sections` in story order, with edges set at silence (check the energy envelope)
   - `fillers` from raw-fillers.json, with edges at silence or the dip before the next word
4. In `<P>/assets`: `node edit-plan.mjs`, then `python -E -P track-face.py`, then `node render-cut.mjs`.
5. Re-transcribe the cut:
   - `node tools/transcribe.mjs <P>/assets/cut.mp4` (writes cut.json, used for captions and anchors)
   - the filler prompt again into `cut-fillers.json`
   Check that every word at the joins is whole and no fillers remain (prompt-biased "uh" at a tight join can
   be a transcriber artifact, so confirm with the energy envelope).
6. Copy `<P>/assets/cut.mp4` to `outbox/<slug>-1-cut.mp4`, open it, and list the story order and what was
   dropped. **Stop for the user's okay.**

**Step 2: subtitles**

Fix misheard words first with `wordFixes` in `testimonial.json`, e.g. `{ "seq": ["bmb"], "text": "BMV" }`
(seq = bare cut.json words: lowercase, punctuation stripped). Check names, numbers ("$" on pesos), and
meaning flips ("isn't" for "is").

7. In `<P>/assets`: `node build-comp.mjs --stage=subs`, then `node mix-audio.mjs --voice-only`. In `<P>`:
   `npx hyperframes lint`, then `npx hyperframes render --quality draft --output renders/2-subs.mp4`. Check
   the longest caption fits. Copy it to `outbox/<slug>-2-subs.mp4` and open it. **Stop.**

**Step 3: motion graphics + zooms + end screen**

8. Fill in `hook`, `name`, `pills`, `emphasis`, `zooms`, and `outro` in `testimonial.json` (anchors on cut.json
   words). Then `node build-comp.mjs --stage=graphics` and `node mix-audio.mjs --voice-only`, lint, and
   render `renders/3-graphics.mp4`. Inspect the hook, each card, the zoom windows, and the end screen. Copy it
   to `outbox/<slug>-3-graphics.mp4` and open it. **Stop.** (Lint has 0 errors; preflight's root data-start
   "blocker" is a known false positive.)

**Step 4: sound effects + music**

9. `node build-comp.mjs`, then `node prep-music.mjs`, then `BED_STEM=../review/bed-ducked.wav node mix-audio.mjs`.
   Measure the bed-to-voice gap and tune `bedGain` until it's 19-20 dB. Render `renders/4-sound.mp4` and
   check the loudness and the audio ending. Copy it to `outbox/<slug>-4-sound.mp4` and open it. **Stop.**

**Step 5: final**

10. `npx hyperframes render --quality high --output renders/final.mp4`. Final checks: about -14 LUFS, peak
    at or below -1 dBFS, frames, the end screen. Copy it to `outbox/<slug>-final.mp4`, open it, and move the
    step files (outbox and renders) to the Recycle Bin.

## Files

| File | Does |
| --- | --- |
| `testimonial.example.json` | a filled-in sample (made-up speaker): the format, story sections, fillers, cards, zooms, music, outro |
| `edit-plan.mjs` | sections minus fillers, tightened pauses → `edl.json` |
| `track-face.py` | finds where the speaker usually is (no tracking) → fixed crop + zoom origin in `crop-geom.json` |
| `render-cut.mjs` | one-pass cut, reframe, voice cleanup → `cut.mp4`, `voice.wav` |
| `build-comp.mjs` | captions, cards, zooms, end screen → `index.html`, `sfx-cues.json`, `render-inputs.json` (its timeline-data/edits support is left over from the removed editor and harmless) |
| `prep-music.mjs` | music bed from `my-sounds` → `bed-music.wav` |
| `mix-audio.mjs` | voice + SFX + ducked bed → `mix.wav` |
