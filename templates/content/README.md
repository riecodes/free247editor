# Content template (tips, explainers, "3 simple steps", ads with one CTA)

The saved editing style for content videos: one speaker teaching or selling straight to camera (often at a whiteboard),
usually one long take. Built from the approved content edits (2026-11-18/19) and the motion style the user
set on 2026-11-23 (`my-style-refs/`, the approved motion reel). Portrait by default (`"format": "landscape"` works too).

It is a template of its own, separate from `templates/testimonial/` (user note 2026-11-24: "ihiwalay mo siya ... para
hindi nalilito"): its own scripts (cut, framing, captions, motion graphics, music, mix) read its own config,
`content.json`, written by `plan-cut.mjs`. Change content videos here only; the testimonial template is not touched.

## The style

- **Story:** open on the hook: the strongest or recap line ("So that's why in these 3 simple steps you can get to know
  how much loan you can get"), moved to the open and removed from its old place. Then the talk in order: each step or
  tip, the worked example, and ONE call to action at the end (a second CTA goes: client note). Under 3 minutes;
  shorter is better.
- **Cuts:** tight. Remove repeats while writing on the board, false starts, held uh/um, asides to the room or the
  audience back-and-forth, and a second run-through of something already explained. Verbal tags ("okay", "right",
  "alright") are cut automatically where the energy curve has a clean dip on both sides. Every edge snaps to the quietest
  20 ms, so cuts land between words. Quiet rooms need a hand-set `silenceDb` (earlier quiet rooms: -58 / -60).
- **Framing:** fixed crop per piece; `"reframe": "smooth"` follows a speaker who walks to the board, slowly (a 1.6 s
  moving median, never jittery). `centerNudge` fixes a stretch where a turned head throws the centering off.
- **Captions:** Poppins Bold, one line, raised (`capTop`), inside the social safe zone. Numbers as written on screen:
  RM/₱/$ amounts with commas, "70%" (`wordFixes`; check every number against what he says). No caption under a
  kinetic card or the name card.
- **Motion graphics follow `my-style-refs/` (read `my-style-refs/motion-text-style.md` and look at `my-style-refs/motion/`,
  including the approved motion reel `approved-motion-reel.mp4`, before planning step 3):**
  - Kinetic text leads: word by word on the voice, small *italic serif* connectors, one big bold hero word, the key word
    in a red `[BOX]` that wipes in. Hero letters start spread and blurred and snap together; serif words blur in.
  - Transitions: a full scene's color sweeps up from the bottom as a wave with a moving wavy edge and lifts off upward
    back to the footage; same-color scenes back to back keep the background and only the words change; words leave with
    the reel's exits in turn (zoom through, slide away, squash, shrink). No iris or soft dissolve.
  - Over the speaker: kinetic text in the lower-middle with a soft dark shade; always a slow push-in and drifting
    background; brand red #aa0000 + black/white only.
  - Hook as kinetic text, word by word on the voice, the payoff as a full red scene.
  - Each step or key idea: a kinetic card with the step as the hero word and the key word in a red box.
  - The strongest lines as long full-screen scenes (red fluid, or white with `theme: 'light'`), with the reel's wave-up /
    lift-off transitions and text exits.
  - **Numbers get a data panel** (`splits`): the footage zooms out into a framed card and a panel drops in above: bars
    that count up, or stat rows that slide in as each number is said (RM10,000 → x 70% → RM7,000).
  - One CTA pill on the call to action. `look: 'premium'`.
  - Name card only when the speaker introduces himself.
- **B-roll (user note 2026-11-24: "clip plus motion B-roll, pati free stock"):** cut away from the speaker where a
  picture says it better, while the voice keeps going.
  - **Clips** (`broll` in `plan-cut.mjs`): the user's own footage (inbox clips they call B-roll) or free stock, saved in
    `assets/broll/`. `mode: 'full'` cuts away full screen with the reel's wave in, a slow push-in and the lift-off out;
    `mode: 'frame'` keeps the speaker and shows the clip in a framed window between the face and the captions. Images
    (.jpg/.png) work the same way. Run `node prep-broll.mjs` after editing the list (light H.264 copies, already cropped).
  - **Motion-graphic B-roll** (`art` on a full kinetic scene, free, no footage needed): an `icon` that draws on (house,
    key, money, chart, calendar, target, bulb, people, check, phone), a `count` that counts up to an amount as it is said
    (RM1,040,000), a rising `chart`, or a `checklist` that ticks each step as it is said.
  - **Free stock** (`tools/stock.mjs`, Pexels and Pixabay, free to use): `node tools/stock.mjs search "house keys"
    --orientation portrait` lists clips (id, seconds, size, source page); `node tools/stock.mjs get pexels:<id> --out
    <P>/assets/broll/house.mp4` downloads one and logs its credits in `broll/broll-credits.json`. Needs a free
    `PEXELS_API_KEY` and/or `PIXABAY_API_KEY` in `.env` (never in chat). Show the user each clip (name, source page,
    size) and get an okay before downloading it.
  - Keep B-roll short (2-4 s), on the words it shows, and out of split windows and full text scenes. Captions stay on.
- **Sound:** voice cleanup; SFX on every card and scene (deep whoosh on full scenes, box pops, cha-ching / money on
  amounts, riser into the CTA); a chill, upbeat bed (lo-fi / jazzy like "Dawn - Cushy", never sad) heard from the start,
  about 20 dB under the voice; -14 LUFS.
- **Ending:** client content ends on the CTA (no logo end screen). RTC content ends on the RTC logo
  (`outro: { logo: 'rtc-logo.png', seconds: 3.2 }`).

## The 5 review steps (my-rules.md)

Same as every video: Cut → Subtitles → Graphics → Sound → Final, stopping for the user's okay after each. Steps 1-4 send
a light preview (`outbox/<slug>-<n>-<step>-preview.mp4`, 540x960, CRF 30); step 5 renders 1080p high quality (4K only
when asked), then the step files go to the Recycle Bin. Notes come in the chat (no VideoHub).

## Commands

`<P>` is `kit/video-projects/<slug>`. Run from the repo root unless noted.

1. Set up:
   - `cd kit && npm run new-video -- <slug>`
   - copy the inbox video to `<P>/assets/raw.mp4`
   - copy every file in `templates/content/` except this README into `<P>/assets/`, then rename
     `plan-cut.example.mjs` to `plan-cut.mjs`
   - B-roll clips or photos go in `<P>/assets/broll/` (from the inbox, or `tools/stock.mjs get`)
   - RTC content only: copy `my-style-refs/rtc-logo.png` to `<P>/assets/`
2. Transcribe twice:
   - `node tools/transcribe.mjs <P>/assets/raw.mp4` (writes raw.json; add `--prompt` with a Taglish line for Taglish speech)
   - `node tools/transcribe.mjs <P>/assets/raw.mp4 --prompt "Um, so, uh, I joined, uhm, because, ah, I believe, um, in the system. Uh, yeah." --out <P>/assets/raw-fillers.json`
3. Fill in `plan-cut.mjs` step 1 (sections, fillers, silenceDb), then in `<P>/assets`:
   `node plan-cut.mjs`, `node edit-plan.mjs`, `python -E -P track-face.py`, `node render-cut.mjs`.
   Re-transcribe `cut.mp4` (cut.json + cut-fillers.json) and check every join on its own. **Stop for the okay.**
4. Step 2: `wordFixes` and `capTop`, `node build-comp.mjs --stage=subs`, `node mix-audio.mjs --voice-only`, lint, draft
   render. **Stop.**
5. Step 3: the graphics part of `plan-cut.mjs` (anchors on cut.json words, B-roll included), `node prep-broll.mjs`,
   `node build-comp.mjs --stage=graphics`,
   lint, draft render, check each card, panel, scene handoff and the ending. **Stop.**
6. Step 4: `node build-comp.mjs`, `node prep-music.mjs`, `BED_STEM=../review/bed-ducked.wav node mix-audio.mjs`; measure
   the bed gap per part (about 20 dB), render, check -14 LUFS. **Stop.**
7. Step 5: `npx hyperframes render --quality high --output renders/final.mp4`, final checks, copy to
   `outbox/<slug>-final.mp4`, step files to the Recycle Bin.

## Files

| File | Does |
| --- | --- |
| `plan-cut.example.mjs` | the content plan to copy and fill: story sections, cuts, automatic tag cutting, captions, motion graphics, panels, sound; writes `content.json` |
| `edit-plan.mjs` | sections minus cuts, tightened pauses → `edl.json` |
| `track-face.py` | per-piece crop centered on the speaker (`reframe: 'smooth'` follows slowly, `centerNudge`) → `crop-geom.json` |
| `render-cut.mjs` | one-pass cut, reframe, voice cleanup → `cut.mp4`, `voice.wav` |
| `build-comp.mjs` | captions, kinetic cards, full scenes and transitions, data panels, zooms, end screen → `index.html`, `sfx-cues.json` |
| `prep-broll.mjs` | light H.264 copies of the B-roll clips, cropped to the frame they fill → `broll/_prep/` |
| `prep-music.mjs` | music bed from `my-sounds` → `bed-music.wav` |
| `mix-audio.mjs` | voice + SFX + ducked bed → `mix.wav` |
