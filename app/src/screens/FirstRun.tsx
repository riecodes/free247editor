import { useState } from "react"
import { CheckDot } from "@/components/Sidebar"
import { StepIcon } from "@/components/StepIcon"
import { TranscribeKey } from "@/components/TranscribeKey"
import { Button } from "@/components/ui/button"
import type { Engine, Provider, Status } from "@/lib/engine"
import { HOOKS, QUESTIONS, VIBES, type Answers } from "@/lib/onboarding"
import { isKey, useT } from "@/lib/strings"
import { cn } from "@/lib/utils"

export type SetupView = { pct: number; eta: string; phase: string; done: boolean; error: string | null }

const CIRC = 2 * Math.PI * 78

function Ring({ setup }: { setup: SetupView }) {
  return (
    <div className="f247-breathe relative size-[184px]" role="progressbar" aria-label="Setup" aria-valuemin={0} aria-valuemax={100} aria-valuenow={setup.pct}>
      <svg width="184" height="184" viewBox="0 0 184 184" aria-hidden="true" className="absolute inset-0 -rotate-90">
        <circle cx="92" cy="92" r="78" fill="none" strokeWidth="10" className="stroke-track" />
        <circle cx="92" cy="92" r="78" fill="none" stroke="#4F46E5" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(setup.pct / 100) * CIRC} ${CIRC}`} className="transition-[stroke-dasharray] duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[38px] font-semibold tracking-tight">{setup.pct}%</span>
        <span className="text-xs text-muted-foreground">{setup.eta}</span>
      </div>
    </div>
  )
}

function MiniRing({ setup }: { setup: SetupView }) {
  const [t] = useT()
  const c = 2 * Math.PI * 8
  return (
    <span role="progressbar" aria-label="Setup" aria-valuemin={0} aria-valuemax={100} aria-valuenow={setup.pct} className="inline-flex min-h-8 items-center gap-2 rounded-full border bg-card px-3 text-[13px] font-semibold">
      <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" className="-rotate-90">
        <circle cx="10" cy="10" r="8" fill="none" strokeWidth="3" className="stroke-track" />
        <circle cx="10" cy="10" r="8" fill="none" stroke="#4F46E5" strokeWidth="3" strokeDasharray={`${(setup.pct / 100) * c} ${c}`} />
      </svg>
      {setup.error ? t("setup.shortPaused") : setup.done ? t("setup.shortReady") : t("setup.short", { pct: setup.pct })}
    </span>
  )
}

type WaitProps = {
  mode: "wait" | "ready"
  setup: SetupView
  name: string
  onRetry: () => void
  onCopy: () => Promise<void>
  onStart: () => void
  onDrop: () => void
}

// The wait is the onboarding: one ring, friendly phase lines, and a small game beside it.
export function Wait({ mode, setup, name, onRetry, onCopy, onStart, onDrop }: WaitProps) {
  const [t] = useT()
  const [copied, setCopied] = useState(false)
  const hi = name ? `, ${name}` : ""
  const title = mode === "wait" ? t("wait.title") : setup.done ? t("wait.ready", { name: hi }) : t("wait.almost", { name: hi })
  return (
    <main className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-12 px-6 py-12">
      <section className="flex min-w-0 flex-[1_1_360px] flex-col gap-[22px]">
        <Ring setup={setup} />
        <div className="flex flex-col gap-2">
          <h1 className="max-w-[16ch] font-display text-[34px] leading-[1.12] font-semibold tracking-tight">{title}</h1>
          <p aria-live="polite" className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
            <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
            {setup.phase}
          </p>
        </div>
        {setup.error && (
          <div role="alert" className="flex flex-col gap-2.5 rounded-2xl border border-destructive bg-card px-4 py-3.5">
            <p className="font-bold text-destructive">{t("setup.stoppedAt", { pct: setup.pct })}</p>
            <p className="text-sm text-muted-foreground">
              {setup.error} {t("setup.keepGoing")}
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Button onClick={onRetry}>{t("setup.retry")}</Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await onCopy()
                  setCopied(true)
                }}
              >
                {t("setup.copy")}
              </Button>
            </div>
            {copied && <p className="text-sm font-semibold text-ok-ink">{t("setup.copied")}</p>}
          </div>
        )}
        {mode === "wait" ? (
          <div>
            <Button size="lg" className="min-h-[52px] px-[26px] text-base" onClick={onStart}>
              {t("wait.start")}
            </Button>
          </div>
        ) : (
          setup.done && (
            <div>
              <Button size="lg" className="min-h-[52px] px-[26px] text-base" onClick={onDrop}>
                {t("wait.drop")}
              </Button>
            </div>
          )
        )}
      </section>
      <HookGame />
    </main>
  )
}

function HookGame() {
  const [t, lang] = useT()
  const [i, setI] = useState(0)
  const [pick, setPick] = useState<"A" | "B" | null>(null)
  const [score, setScore] = useState(0)
  const [count, setCount] = useState(0)
  const pair = HOOKS[i]
  const last = i === HOOKS.length - 1
  const line = (l: "A" | "B") => (l === "A" ? pair.a : pair.b)[lang]
  return (
    <section aria-label={t("game.label")} className="flex min-w-0 flex-[1_1_380px] flex-col gap-3.5 rounded-[22px] border bg-card p-[22px]">
      <div className="flex items-center justify-between gap-2.5">
        <p className="text-xs font-bold tracking-[0.08em] text-brand uppercase">{t("game.label")}</p>
        <p className="text-[13px] font-bold">{t("game.score", { s: score, n: count })}</p>
      </div>
      <h2 className="font-display text-[22px] font-semibold tracking-tight">{t("game.title")}</h2>
      <div className="flex flex-wrap items-stretch gap-4">
        <div aria-hidden="true" className="relative h-[213px] w-[120px] shrink-0 overflow-hidden rounded-[14px] bg-[#0b0d11]">
          <Silhouette />
          <span className={cn("absolute top-[10%] right-[8%] left-[8%] rounded-lg p-1.5 text-center text-[11px] leading-[1.15] font-extrabold text-white", pick ? "bg-[#4F46E5]" : "bg-[#2C313D]")}>
            {pick ? line(pick) : t("game.idle")}
          </span>
        </div>
        <div role="radiogroup" aria-label={t("game.title")} className="flex min-w-0 flex-[1_1_200px] flex-col gap-2.5">
          {(["A", "B"] as const).map((letter) => {
            const mine = pick === letter
            const right = letter === pair.good
            return (
              <button
                key={letter}
                type="button"
                role="radio"
                aria-checked={mine}
                onClick={() => {
                  if (pick) return
                  setPick(letter)
                  setCount(count + 1)
                  if (right) setScore(score + 1)
                }}
                className={cn(
                  "flex min-h-16 items-center gap-2.5 rounded-[14px] border-2 px-3.5 py-2.5 text-left",
                  pick ? (right ? "border-ok" : mine ? "border-destructive" : "border-border") : "border-border",
                  mine ? "bg-sel" : "bg-background"
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-extrabold">{letter}</span>
                <span className="flex-1 font-semibold">{line(letter)}</span>
                {pick && right && <StepIcon state="done" />}
              </button>
            )
          })}
        </div>
      </div>
      {pick && (
        <div role="status" className={cn("flex flex-wrap items-center gap-2.5 rounded-[14px] px-3.5 py-3", pick === pair.good ? "bg-ok-bg" : "bg-secondary")}>
          <p className="min-w-0 flex-[1_1_220px] text-sm">
            <span className="font-bold">{pick === pair.good ? t("game.right") : t("game.stronger", { x: pair.good })}</span> {pair.why[lang]}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setI((i + 1) % HOOKS.length)
              setPick(null)
              if (last) {
                setScore(0)
                setCount(0)
              }
            }}
          >
            {last ? t("game.again") : t("game.next")}
          </Button>
        </div>
      )}
    </section>
  )
}

function Silhouette() {
  return (
    <svg viewBox="0 0 90 160" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full" aria-hidden="true">
      <circle cx="45" cy="92" r="17" fill="#1F232C" />
      <path d="M14 160c2-30 15-44 31-44s29 14 31 44z" fill="#1F232C" />
    </svg>
  )
}

// The four vibes drawn in CSS over a stand-in frame, so a tap shows the look at once.
function VibeFrame({ v }: { v: string }) {
  if (v === "split")
    return (
      <span className="absolute inset-0 bg-white">
        <span className="absolute inset-x-0 top-0 h-[56%] bg-[linear-gradient(#E5E7EB_1px,transparent_1px),linear-gradient(90deg,#E5E7EB_1px,transparent_1px)] bg-[size:14px_14px]" />
        <span className="absolute top-[14%] left-[10%] rounded-full bg-[#141622] px-2 py-0.5 text-[9px] font-bold text-white">Today</span>
        <span className="absolute top-[26%] left-[10%] text-[13px] leading-[1.05] font-extrabold text-[#141622]">
          BE THE
          <br />
          CREATIVE
          <br />
          DIRECTOR
        </span>
        <span className="absolute inset-x-[6%] top-[60%] bottom-[4%] overflow-hidden rounded-xl bg-[#0b0d11]">
          <Silhouette />
        </span>
        <span className="absolute inset-x-0 bottom-[41%] text-center text-[10px] font-extrabold text-[#141622]">yourself.</span>
      </span>
    )
  if (v === "cream")
    return (
      <span className="absolute inset-0 bg-[#F6F3EE]">
        <span className="absolute inset-x-[14%] top-[17%] bottom-[22%] overflow-hidden rounded-[14px] bg-[#0b0d11]">
          <Silhouette />
        </span>
        <span className="absolute top-[9%] left-1/2 -translate-x-1/2 rounded-full border border-[#E8E2D8] bg-white px-2 py-0.5 text-[9px] font-bold whitespace-nowrap text-[#141622]">Tip #3</span>
        <span className="absolute inset-x-[8%] bottom-[8%] text-center text-[11px] leading-[1.2] font-extrabold text-[#141622]">
          No timeline.
          <br />
          <span className="text-[#D97757]">Just one drop.</span>
        </span>
      </span>
    )
  return (
    <span className={cn("absolute inset-0", v === "forest" ? "bg-[#1F3A2C]" : "bg-[#0b0d11]")}>
      <Silhouette />
      {v === "bigword" ? (
        <span className="absolute inset-x-0 top-[9%] text-center text-[26px] font-extrabold text-white [text-shadow:0_4px_18px_rgba(0,0,0,0.4)]">ORAS</span>
      ) : (
        <>
          <span className="absolute inset-x-[8%] top-[12%] text-center font-[Georgia,serif] text-[30px] text-[#EFE7D6] italic">never.</span>
          <span className="absolute bottom-[24%] left-1/2 -translate-x-1/2 rounded-full bg-[#1F3A2C] px-2.5 py-0.5 font-[Georgia,serif] text-[13px] whitespace-nowrap text-[#EFE7D6] ring-1 ring-[#EFE7D6]/30">edit it</span>
        </>
      )}
    </span>
  )
}

type QProps = {
  step: number
  setStep: (n: number) => void
  answers: Answers
  setAnswer: (patch: Answers) => void
  setup: SetupView
  status: Status
  provider: Provider
  groq: boolean
  engine: Engine
  setEngine: (e: Engine) => void
  signIn: (e: Engine, device?: boolean) => void
  signingIn: Engine | null
  signInError: string | null
  onGroq: () => void
  onBackToWait: () => void
  onFinish: () => void
}

// One question per screen while setup runs; every answer is saved to the Default template.
export function Questions(p: QProps) {
  const [t] = useT()
  const q = QUESTIONS[p.step]
  const last = p.step === QUESTIONS.length - 1
  const next = () => (last ? p.onFinish() : p.setStep(p.step + 1))
  const label = (s: string) => (isKey(s) ? t(s) : s)
  return (
    <main className="mx-auto flex w-full max-w-[860px] flex-col gap-[26px] px-6 pt-10 pb-12">
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="flex flex-[1_1_200px] gap-1.5" aria-hidden="true">
          {QUESTIONS.map((_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= p.step ? "bg-[#4F46E5]" : "bg-track")} />
          ))}
        </div>
        <span className="text-[13px] text-muted-foreground">{t("q.count", { n: p.step + 1 })}</span>
        <MiniRing setup={p.setup} />
      </div>
      <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-tight">{t(q.title)}</h1>

      {q.kind === "text" && (
        <div className="flex max-w-[480px] flex-col gap-2">
          <label htmlFor="q-name" className="font-bold">
            {t("q.nameLabel")}
          </label>
          <input
            id="q-name"
            value={p.answers.name ?? ""}
            onChange={(e) => p.setAnswer({ name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && next()}
            autoComplete="given-name"
            maxLength={40}
            placeholder={t("q.namePlaceholder")}
            className="min-h-14 rounded-[14px] border border-input bg-card px-4 text-lg"
          />
        </div>
      )}

      {(q.kind === "one" || q.kind === "many") && (
        <div role={q.kind === "many" ? "group" : "radiogroup"} aria-label={t(q.title)} className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
          {q.options!.map((o) => {
            const value = p.answers[q.id as keyof Answers]
            const on = q.kind === "many" ? ((value as string[] | undefined) ?? []).includes(o.v) : value === o.v
            const pick = () => {
              if (q.kind === "one") return p.setAnswer({ [q.id]: o.v })
              const list = (value as string[] | undefined) ?? []
              p.setAnswer({ [q.id]: on ? list.filter((x) => x !== o.v) : [...list, o.v] })
            }
            return (
              <button
                key={o.v}
                type="button"
                role={q.kind === "many" ? "checkbox" : "radio"}
                aria-checked={on}
                onClick={pick}
                className={cn("flex min-h-24 items-center gap-2 rounded-2xl border-2 p-4 text-left", on ? "border-sel-line bg-sel" : "border-border bg-card")}
              >
                <span className="flex-1 text-lg font-bold">{label(o.label)}</span>
                {on && <CheckDot />}
              </button>
            )
          })}
        </div>
      )}

      {q.kind === "vibe" && (
        <div role="radiogroup" aria-label={t(q.title)} className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          {VIBES.map((v) => {
            const on = p.answers.vibe === v.v
            return (
              <button
                key={v.v}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => p.setAnswer({ vibe: v.v })}
                className={cn("flex flex-col gap-2.5 rounded-[18px] border-2 p-2.5 text-left", on ? "border-sel-line bg-sel" : "border-border bg-card")}
              >
                <span aria-hidden="true" className="relative block aspect-[9/16] w-full overflow-hidden rounded-xl">
                  <VibeFrame v={v.v} />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="flex-1 font-bold">{v.label}</span>
                  {on && <CheckDot />}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {q.kind === "engine" && (
        <div className="flex flex-col gap-3.5">
          <div role="radiogroup" aria-label={t(q.title)} className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            {(["claude", "codex"] as const).map((id) => {
              const on = id === p.engine
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => p.setEngine(id)}
                  className={cn("flex min-h-28 flex-col items-start gap-1.5 rounded-2xl border-2 p-4 text-left", on ? "border-sel-line bg-sel" : "border-border bg-card")}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="flex-1 text-base font-bold">{t(`ai.${id}.title`)}</span>
                    {on && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-strong">
                        <CheckDot />
                        {t("ai.selected")}
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] font-semibold text-brand">{t(`ai.${id}.via`)}</span>
                  {p.status[id].loggedIn && <span className="mt-auto text-xs text-ok-ink">{t("ai.signedIn", { plan: p.status[id].plan ?? "" })}</span>}
                </button>
              )
            })}
          </div>
          <SignInPanel {...p} />
          <TranscribeKey provider={p.provider} has={p.groq} onSaved={p.onGroq} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1.5">
        <Button variant="outline" size="lg" className="min-h-[52px]" onClick={() => (p.step === 0 ? p.onBackToWait() : p.setStep(p.step - 1))}>
          {t("q.back")}
        </Button>
        <span className="flex-1" />
        <Button variant="link" className="min-h-[52px] px-4 text-muted-foreground underline" onClick={() => (last ? p.onFinish() : p.setStep(p.step + 1))}>
          {last ? t("q.later") : t("q.skip")}
        </Button>
        <Button size="lg" className="min-h-[52px] px-[26px] text-base" onClick={next}>
          {last ? t("q.done") : t("q.next")}
        </Button>
      </div>
    </main>
  )
}

const CLI = { claude: "Claude Code", codex: "Codex" } as const

export function SignInPanel({ status, engine, signIn, signingIn, signInError }: Pick<QProps, "status" | "engine" | "signIn" | "signingIn" | "signInError">) {
  const [t] = useT()
  const cli = status[engine]
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      {!cli.installed ? (
        <p className="text-muted-foreground">{t("ai.installing", { cli: CLI[engine] })}</p>
      ) : cli.loggedIn ? (
        <p role="status" className="flex items-center gap-2 font-semibold">
          <StepIcon state="done" />
          {t("ai.done", { cli: CLI[engine], plan: cli.plan ?? "" })}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => signIn(engine)} disabled={signingIn !== null}>
            {signingIn === engine ? t("ai.waiting") : t(`ai.${engine}.action`)}
          </Button>
          <span className="flex-[1_1_220px] text-[13px] text-muted-foreground">{signingIn === engine ? t("ai.waitingHow") : t(`ai.${engine}.how`)}</span>
          {engine === "codex" && (
            <Button variant="link" onClick={() => signIn("codex", true)} disabled={signingIn !== null}>
              {t("ai.device")}
            </Button>
          )}
        </div>
      )}
      {signInError && (
        <p role="alert" className="font-semibold text-destructive">
          {signInError}
        </p>
      )}
    </div>
  )
}
