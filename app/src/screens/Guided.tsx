import { convertFileSrc } from "@tauri-apps/api/core"
import { Check } from "lucide-react"
import { useState } from "react"
import { CheckDot } from "@/components/Sidebar"
import { Button } from "@/components/ui/button"
import { FONT_FAMILY, type Picks } from "@/lib/guided"
import { useT, type Key } from "@/lib/strings"
import { cn } from "@/lib/utils"

// After a drop: Quick (the checked template) or Guided (eight steps, each drawn over a still of the
// buyer's own clip), which can end as a saved template.

type Group = { id: string; label: Key; options: { v: string; label: Key }[] }
const STEPS: { id: string; label: Key; groups: Group[] }[] = [
  { id: "start", label: "g.start", groups: [
    { id: "format", label: "g.format", options: [{ v: "vertical", label: "g.vertical" }, { v: "both", label: "g.both" }] },
    { id: "pace", label: "g.pace", options: [{ v: "tight", label: "g.tight" }, { v: "natural", label: "g.natural" }] },
  ] },
  { id: "colours", label: "g.colours", groups: [
    { id: "colour", label: "g.colour", options: [{ v: "yellow", label: "g.yellow" }, { v: "indigo", label: "g.indigo" }, { v: "rose", label: "g.rose" }, { v: "box", label: "g.box" }] },
  ] },
  { id: "fonts", label: "g.fonts", groups: [
    { id: "font", label: "g.font", options: [{ v: "anton", label: "g.anton" }, { v: "bebas", label: "g.bebas" }, { v: "montserrat", label: "g.montserrat" }, { v: "poppins", label: "g.poppins" }, { v: "archivo", label: "g.archivo" }] },
  ] },
  { id: "hook", label: "g.hook", groups: [
    { id: "hook", label: "g.hook", options: [{ v: "big", label: "g.hookBig" }, { v: "question", label: "g.hookQuestion" }, { v: "none", label: "g.none" }] },
  ] },
  { id: "captions", label: "g.captions", groups: [
    { id: "captions", label: "g.capStyle", options: [{ v: "word", label: "g.word" }, { v: "pills", label: "g.pills" }, { v: "sentence", label: "g.sentence" }, { v: "none", label: "g.none" }] },
    { id: "position", label: "g.position", options: [{ v: "upper", label: "g.upper" }, { v: "middle", label: "g.middle" }, { v: "lower", label: "g.lower" }] },
    { id: "safe", label: "g.safe", options: [{ v: "off", label: "g.off" }, { v: "tiktok", label: "g.tiktok" }, { v: "reels", label: "g.reels" }, { v: "shorts", label: "g.shorts" }] },
  ] },
  { id: "visuals", label: "g.visuals", groups: [
    { id: "visuals", label: "g.graphics", options: [{ v: "minimal", label: "g.minimal" }, { v: "some", label: "g.some" }, { v: "heavy", label: "g.heavy" }] },
    { id: "zoom", label: "g.zoom", options: [{ v: "on", label: "g.on" }, { v: "off", label: "g.off" }] },
  ] },
  { id: "extras", label: "g.extras", groups: [
    { id: "sfx", label: "g.sfx", options: [{ v: "pop", label: "g.pop" }, { v: "none", label: "g.none" }] },
    { id: "music", label: "g.music", options: [{ v: "bed", label: "g.bed" }, { v: "none", label: "g.none" }] },
    { id: "cta", label: "g.cta", options: [{ v: "card", label: "g.card" }, { v: "none", label: "g.none" }] },
  ] },
  { id: "watch", label: "g.watch", groups: [] },
]

const KEY_COLOUR: Record<string, string> = { yellow: "#FBBF24", indigo: "#A5B4FC", rose: "#F43F5E", box: "#141622" }
const TOP: Record<string, string> = { upper: "26%", middle: "46%", lower: "66%" }
// Reels-style unsafe areas: the right-side buttons and the caption/username band at the bottom.
const SAFE: Record<string, { right: string; bottom: string }> = { tiktok: { right: "16%", bottom: "22%" }, reels: { right: "14%", bottom: "20%" }, shorts: { right: "15%", bottom: "18%" } }

type ChooseProps = { templateName: string; path: "quick" | "guided"; setPath: (p: "quick" | "guided") => void; onGo: () => void; preparing: boolean }

export function Choose({ templateName, path, setPath, onGo, preparing }: ChooseProps) {
  const [t] = useT()
  return (
    <main className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-6 pt-10 pb-12">
      <h1 className="font-display text-[34px] leading-[1.12] font-semibold">{t("g.choose")}</h1>
      <div role="radiogroup" aria-label={t("g.choose")} className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
        {(["quick", "guided"] as const).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={path === p} onClick={() => setPath(p)} className={cn("flex min-h-28 flex-col items-start gap-1.5 rounded-2xl border-2 p-4 text-left", path === p ? "border-sel-line bg-sel" : "border-border bg-card")}>
            <span className="flex w-full items-center gap-2">
              <span className="flex-1 text-lg font-bold">{t(p === "quick" ? "g.quick" : "g.guided")}</span>
              {path === p && <CheckDot />}
            </span>
            <span className="text-[13px] text-muted-foreground">{p === "quick" ? templateName : t("g.guidedSub")}</span>
          </button>
        ))}
      </div>
      <div>
        <Button size="lg" className="min-h-[52px] px-[26px] text-base" onClick={onGo} disabled={preparing}>
          {preparing ? t("g.preparing") : path === "quick" ? t("g.goQuick", { name: templateName }) : t("g.goGuided")}
        </Button>
      </div>
    </main>
  )
}

type GuidedProps = {
  still: string | null
  sample: string
  picks: Picks
  setPick: (group: string, value: string) => void
  onBack: () => void
  onSave: (name: string, makeDefault: boolean) => Promise<string | null>
  onEditOnly: () => void
}

export function Guided({ still, sample, picks, setPick, onBack, onSave, onEditOnly }: GuidedProps) {
  const [t] = useT()
  const [step, setStep] = useState(0)
  const [drawer, setDrawer] = useState(false)
  const [name, setName] = useState("")
  const [makeDefault, setMakeDefault] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const s = STEPS[step]
  const label = (group: string, v: string) => {
    for (const st of STEPS) for (const g of st.groups) if (g.id === group) return t(g.options.find((o) => o.v === v)?.label ?? "g.none")
    return v
  }
  const summary = ["format", "colour", "font", "hook", "captions", "position", "visuals"].map((g) => label(g, picks[g]))

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return setError(t("g.nameEmpty"))
    setSaving(true)
    setError(await onSave(trimmed, makeDefault))
    setSaving(false)
  }

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-6 pt-8 pb-12">
      <nav aria-label={t("g.steps")} className="flex flex-wrap gap-1.5">
        {STEPS.map((st, i) => (
          <button
            key={st.id}
            type="button"
            aria-current={i === step ? "step" : undefined}
            onClick={() => setStep(i)}
            className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold", i === step ? "border-seg bg-seg text-seg-ink" : i < step ? "border-sel-line bg-sel text-brand" : "text-muted-foreground")}
          >
            {i < step && <Check className="size-3.5" aria-hidden="true" />}
            {t(st.label)}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track" aria-hidden="true">
          <div className="h-full rounded-full bg-bar" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
        <span className="font-mono text-[13px] text-muted-foreground">{t("g.stepOf", { n: step + 1 })}</span>
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <Preview still={still} sample={sample} picks={picks} />
        <section className="flex min-w-0 flex-[999_1_420px] flex-col gap-5">
          <h1 className="font-display text-[30px] leading-[1.12] font-semibold">{t(s.label)}</h1>
          {s.groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-2">
              <h2 className="text-sm font-bold text-muted-foreground">{t(g.label)}</h2>
              <div role="radiogroup" aria-label={t(g.label)} className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
                {g.options.map((o) => {
                  const on = picks[g.id] === o.v
                  return (
                    <button key={o.v} type="button" role="radio" aria-checked={on} onClick={() => setPick(g.id, o.v)} className={cn("flex min-h-14 items-center gap-2 rounded-xl border-2 px-3 text-left font-semibold", on ? "border-sel-line bg-sel" : "border-border bg-card")}>
                      {g.id === "colour" && <span className="size-4 shrink-0 rounded-full border" style={{ background: KEY_COLOUR[o.v] === "#141622" ? "#FFFFFF" : KEY_COLOUR[o.v] }} aria-hidden="true" />}
                      <span className="flex-1" style={g.id === "font" ? { fontFamily: FONT_FAMILY[o.v], fontSize: 20, fontWeight: 400 } : undefined}>
                        {t(o.label)}
                      </span>
                      {on && <CheckDot />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {s.id === "watch" && (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-wrap gap-2">
                {summary.map((x, i) => (
                  <li key={i} className="rounded-full bg-secondary px-3 py-1 text-sm">
                    {x}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2.5">
                <Button size="lg" onClick={() => setDrawer(true)}>
                  {t("g.save")}
                </Button>
                <Button variant="outline" size="lg" onClick={onEditOnly}>
                  {t("g.editOnly")}
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3 pt-1">
            <Button variant="outline" size="lg" onClick={() => (step === 0 ? onBack() : setStep(step - 1))}>
              {t("q.back")}
            </Button>
            {step < STEPS.length - 1 && (
              <Button size="lg" onClick={() => setStep(step + 1)}>
                {t("g.next", { step: t(STEPS[step + 1].label) })}
              </Button>
            )}
          </div>
        </section>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <aside role="dialog" aria-modal="true" aria-label={t("g.save")} className="flex h-full w-full max-w-[420px] flex-col gap-4 overflow-y-auto border-l bg-background p-6">
            <h2 className="font-display text-2xl font-semibold">{t("g.save")}</h2>
            <label htmlFor="tpl-name" className="font-bold">
              {t("g.name")}
            </label>
            <input
              id="tpl-name"
              value={name}
              maxLength={40}
              autoFocus
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              aria-invalid={Boolean(error)}
              className={cn("min-h-12 rounded-xl border bg-card px-3 text-base", error ? "border-destructive" : "border-input")}
            />
            {error && (
              <p role="alert" className="font-semibold text-destructive">
                {error}
              </p>
            )}
            <ul className="flex flex-wrap gap-2">
              {summary.map((x, i) => (
                <li key={i} className="rounded-full bg-secondary px-3 py-1 text-sm">
                  {x}
                </li>
              ))}
            </ul>
            <label htmlFor="tpl-default" className="flex min-h-11 cursor-pointer items-center gap-2.5">
              <input id="tpl-default" type="checkbox" checked={makeDefault} onChange={() => setMakeDefault(!makeDefault)} className="size-[18px] accent-[#4F46E5]" />
              <span>{t("g.makeDefault")}</span>
            </label>
            <div className="mt-auto flex flex-wrap gap-2.5">
              <Button size="lg" onClick={save} disabled={saving}>
                {t("g.saveEdit")}
              </Button>
              <Button variant="outline" size="lg" onClick={() => setDrawer(false)}>
                {t("q.back")}
              </Button>
            </div>
          </aside>
        </div>
      )}
    </main>
  )
}

// Every pick is drawn over the buyer's own frame at once (no engine call).
function Preview({ still, sample, picks }: { still: string | null; sample: string; picks: Picks }) {
  const words = (sample || "Ito yung sample").split(/\s+/)
  const key = KEY_COLOUR[picks.colour]
  const font = { fontFamily: FONT_FAMILY[picks.font], fontWeight: 400 }
  const safe = SAFE[picks.safe]
  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[300px] shrink-0 overflow-hidden rounded-[18px] border bg-[#0b0d11]">
      {still && <img src={convertFileSrc(still)} alt="" className="absolute inset-0 size-full object-cover" />}
      {picks.hook !== "none" &&
        (picks.hook === "question" ? (
          <span className="absolute inset-x-[8%] top-[6%] rounded-xl bg-white px-3 py-2 text-center text-[15px] leading-tight text-[#141622]" style={font}>
            {words.slice(0, 3).join(" ")}?
          </span>
        ) : (
          <span className="absolute inset-x-[6%] top-[6%] text-center text-[26px] leading-none text-white uppercase [text-shadow:0_3px_12px_rgba(0,0,0,0.6)]" style={font}>
            {words.slice(0, 3).join(" ")}
          </span>
        ))}
      {picks.captions !== "none" && (
        <span className="absolute inset-x-[6%] text-center leading-tight" style={{ top: TOP[picks.position] }}>
          {picks.captions === "sentence" ? (
            <span className="rounded-md bg-black/55 px-2 py-1 text-[15px] text-white" style={font}>
              {words.join(" ")}
            </span>
          ) : picks.captions === "pills" ? (
            <span className="inline-flex flex-wrap justify-center gap-1">
              {words.map((w, i) => (
                <span key={i} className="rounded-md px-1.5 py-0.5 text-[20px] uppercase" style={{ ...font, background: i === 1 ? key : "rgba(0,0,0,0.55)", color: i === 1 && picks.colour !== "box" ? "#141622" : "#FFFFFF" }}>
                  {w}
                </span>
              ))}
            </span>
          ) : picks.colour === "box" ? (
            <span className="rounded-md bg-white px-2 py-1 text-[26px] text-[#141622] uppercase" style={font}>
              {words[1] ?? words[0]}
            </span>
          ) : (
            <span className="text-[30px] uppercase [text-shadow:0_3px_12px_rgba(0,0,0,0.7)]" style={{ ...font, color: key }}>
              {words[1] ?? words[0]}
            </span>
          )}
        </span>
      )}
      {safe && (
        <>
          <span className="absolute top-0 right-0 bottom-0 border-l-2 border-dashed border-[#F43F5E] bg-[#F43F5E]/15" style={{ width: safe.right }} aria-hidden="true" />
          <span className="absolute right-0 bottom-0 left-0 border-t-2 border-dashed border-[#F43F5E] bg-[#F43F5E]/15" style={{ height: safe.bottom }} aria-hidden="true" />
        </>
      )}
    </div>
  )
}
