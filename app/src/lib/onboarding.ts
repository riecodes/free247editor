// First run: the questions asked while setup runs, the vibe samples and the hook game.
// The answers write templates\default\style.md (see engine/style.mjs).
import type { Key } from "./strings"

export type Answers = { name?: string; make?: string; post?: string[]; lang?: string; vibe?: string }
type Option = { v: string; label: string }
export type Question = { id: keyof Answers | "engine"; kind: "text" | "one" | "many" | "vibe" | "engine"; title: Key; options?: Option[] }

// Labels that are string-table keys get translated; brand and language names stay as written.
export const QUESTIONS: Question[] = [
  { id: "name", kind: "text", title: "q.name" },
  {
    id: "make",
    kind: "one",
    title: "q.make",
    options: [
      { v: "talking", label: "opt.talking" },
      { v: "vlog", label: "opt.vlog" },
      { v: "tutorial", label: "opt.tutorial" },
      { v: "product", label: "opt.product" },
    ],
  },
  {
    id: "post",
    kind: "many",
    title: "q.post",
    options: [
      { v: "tiktok", label: "TikTok" },
      { v: "reels", label: "Reels" },
      { v: "shorts", label: "Shorts" },
      { v: "youtube", label: "YouTube" },
    ],
  },
  {
    id: "lang",
    kind: "one",
    title: "q.lang",
    options: [
      { v: "taglish", label: "Taglish" },
      { v: "tagalog", label: "Tagalog" },
      { v: "bisaya", label: "Bisaya" },
      { v: "english", label: "English" },
      { v: "mixed", label: "opt.mixed" },
    ],
  },
  { id: "vibe", kind: "vibe", title: "q.vibe" },
  { id: "engine", kind: "engine", title: "q.engine" },
]

// Proven Claude-made reel styles (the claudeedits research), drawn in CSS on the vibe cards.
export const VIBES = [
  { v: "bigword", label: "One Big Word" },
  { v: "forest", label: "Forest Editorial" },
  { v: "cream", label: "Cream Card" },
  { v: "split", label: "Kallaway Split" },
] as const

type Bi = { en: string; fil: string }
// "Which hook is stronger?": the stronger line and why. Works offline.
export const HOOKS: { a: Bi; b: Bi; good: "A" | "B"; why: Bi }[] = [
  { a: { en: "Video editing tips", fil: "Tips sa video editing" }, b: { en: "3 mistakes in your first video", fil: "3 mali sa unang video mo" }, good: "B", why: { en: "A number and a direct promise: viewers know what they'll get.", fil: "May number at diretsong pangako, alam agad ng viewer ang makukuha." } },
  { a: { en: "This is why nobody watches your videos", fil: "Eto kung bakit walang nanonood sa video mo" }, b: { en: "Hey guys, welcome back to the channel", fil: "Hello guys, welcome back sa channel" }, good: "A", why: { en: "It hits the viewer's problem right away. A greeting wastes 2 seconds.", fil: "Diretso sa problema ng viewer. Sayang ang 2 seconds sa greeting." } },
  { a: { en: "I made a video", fil: "Gumawa ako ng video" }, b: { en: "I made this without CapCut", fil: "Ginawa ko 'to nang walang CapCut" }, good: "B", why: { en: "It breaks an expectation, so they want to know how.", fil: "Di nila ine-expect, kaya gusto nilang malaman paano." } },
  { a: { en: "How to save money", fil: "Paano mag-ipon ng pera" }, b: { en: "I saved ₱50,000 in 6 months. Here's how", fil: "Naka-₱50,000 ako in 6 months. Eto paano." }, good: "B", why: { en: "A concrete result and timeframe make it believable.", fil: "May exact na result at oras, kaya believable." } },
  { a: { en: "Don't do this on a first date", fil: "Wag mong gawin 'to sa first date" }, b: { en: "Tips for dating", fil: "Tips sa dating" }, good: "A", why: { en: "It reads like a warning, so they don't want to miss it.", fil: "Parang warning, kaya ayaw nilang ma-miss." } },
  { a: { en: "New phone review", fil: "Review ng bagong phone" }, b: { en: "I bought the cheapest phone so you don't have to", fil: "Binili ko ang pinakamurang phone para di mo na kailangan" }, good: "B", why: { en: "You took the risk for them, so they have a reason to watch.", fil: "Ikaw na ang sumugal, kaya may dahilan silang manood." } },
  { a: { en: "I tried editing with Claude. Here's what happened", fil: "Tinry kong mag-edit gamit si Claude. Eto ang nangyari" }, b: { en: "Video editing with AI", fil: "Video editing with AI" }, good: "A", why: { en: "A story with a question at the end: what happened?", fil: "Kwento na may tanong sa dulo: ano ang nangyari?" } },
  { a: { en: "Everything you've been told about colds is wrong", fil: "Mali lahat ng sinabi sa'yo tungkol sa sipon" }, b: { en: "How to cure a cold", fil: "Paano gamutin ang sipon" }, good: "A", why: { en: "It contradicts what they know, so they stop scrolling.", fil: "Kontra sa alam nila, kaya napapatigil sila." } },
  { a: { en: "Day 1 of learning to code", fil: "Day 1 ng pag-aaral ng coding" }, b: { en: "I learned to code in 30 days. Day 1.", fil: "Natuto akong mag-code sa 30 araw. Day 1." }, good: "B", why: { en: "A clear finish line makes them want to follow along to Day 30.", fil: "May malinaw na dulo, kaya gusto nilang sumama hanggang Day 30." } },
  { a: { en: "The only app your business needs", fil: "Isang app lang ang kailangan ng negosyo mo" }, b: { en: "Apps for business", fil: "Apps para sa negosyo" }, good: "A", why: { en: "One answer is more intriguing and easier to remember.", fil: "Isang sagot lang, kaya mas nakaka-curious at madaling tandaan." } },
  { a: { en: "POV: your first post got 200 views", fil: "POV: first post mo at 200 views lang" }, b: { en: "How to get more views", fil: "Paano dumami ang views" }, good: "A", why: { en: "A relatable scene; they see themselves in it.", fil: "Relatable, nakikita nila ang sarili nila." } },
  { a: { en: "Why kids learn faster than we do", fil: "Bakit mas mabilis matuto ang mga bata kaysa sa atin" }, b: { en: "Learning tips", fil: "Learning tips" }, good: "A", why: { en: "A question with a surprising comparison.", fil: "Tanong na may nakakagulat na comparison." } },
]

export type SetupRun = { status: string; percent: number; message: string }
export type SetupStep = { id: string; weight: number; done: boolean }

// One ring for the whole setup, weighted by each step's download size.
export function setupPercent(steps: SetupStep[], runs: Record<string, SetupRun>) {
  const total = steps.reduce((n, s) => n + s.weight, 0) || 1
  const got = steps.reduce((n, s) => {
    const r = runs[s.id]
    if (r?.status === "done" || r?.status === "warn" || (!r && s.done)) return n + s.weight
    if (r?.status === "running") return n + (s.weight * (r.percent || 0)) / 100
    return n
  }, 0)
  return Math.min(100, Math.floor((got * 100) / total))
}

// Friendly phase lines, never tool names.
export function setupPhase(runs: Record<string, SetupRun>, pct: number, done: boolean, paused: boolean): Key {
  if (paused) return "phase.paused"
  if (done) return "phase.ready"
  if (pct >= 95) return "phase.almost"
  const running = Object.entries(runs).find(([, r]) => r.status === "running")
  if (!running) return "phase.prepare"
  const [id, r] = running
  if (id === "kit" && r.percent >= 75) return "phase.render"
  if (id === "ffmpeg" || id === "git" || id === "kit") return "phase.tools"
  return "phase.prepare"
}

export function setupEta(started: number, now: number, pct: number, done: boolean): [Key, { n?: number }] {
  if (done) return ["eta.done", {}]
  const elapsed = now - started
  if (!started || pct < 5 || elapsed < 10000) return ["eta.estimating", {}]
  const left = (elapsed * (100 - pct)) / pct / 60000
  return left < 1 ? ["eta.underMinute", {}] : ["eta.minutes", { n: Math.round(left) }]
}
