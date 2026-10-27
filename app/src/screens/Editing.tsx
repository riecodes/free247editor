import { useEffect, useState } from "react"
import { StepIcon, type StepState } from "@/components/StepIcon"
import { Button } from "@/components/ui/button"
import { STATE_COLOR } from "@/lib/copy"
import { useT, type Key } from "@/lib/strings"
import { cn } from "@/lib/utils"

export type EditRun = {
  kind: "edit" | "note" | "approve"
  name: string
  version: number
  step: string
  line: string
  started: number
  stepStarted: number
  error?: string
}

const STEPS: { id: string; label: Key }[] = [
  { id: "transcribe", label: "edit.transcribe" },
  { id: "cut", label: "edit.cut" },
  { id: "captions", label: "edit.captions" },
  { id: "hook", label: "edit.hook" },
  { id: "render", label: "edit.render" },
]
const ORDER = ["transcribe", "cut", "captions", "hook", "render", "srt"]
// Where each step starts on the bar; inside a step the bar creeps toward the next one.
const BASE: Record<string, number> = { transcribe: 0, cut: 12, captions: 35, hook: 55, render: 80, srt: 95 }

function percent(run: EditRun, now: number) {
  const i = ORDER.indexOf(run.step)
  const from = BASE[run.step] ?? 0
  const to = i < ORDER.length - 1 ? BASE[ORDER[i + 1]] : 99
  const creep = 1 - Math.exp(-(now - run.stepStarted) / 150000)
  return Math.min(99, Math.round(from + (to - from) * 0.9 * creep))
}

type Props = { run: EditRun; provider: string; onCancel: () => void; onBack: () => void; onRetry: () => void }

export function Editing({ run, provider, onCancel, onBack, onRetry }: Props) {
  const [t] = useT()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  // The SRT is made during the Render step.
  const at = Math.min(ORDER.indexOf(run.step), 4)
  const pct = percent(run, now)
  const elapsed = now - run.started
  const left = pct >= 15 && elapsed > 45000 ? (elapsed * (100 - pct)) / pct / 60000 : null
  const eta = left === null ? t("eta.estimating") : left < 1 ? t("eta.underMinute") : t("eta.minutes", { n: Math.round(left) })
  const stateText: Record<StepState, string> = { done: t("state.done"), active: t("state.active"), todo: t("state.todo"), error: t("state.error"), warn: t("state.warn") }
  return (
    <main className="mx-auto flex w-full max-w-[880px] flex-col gap-[22px] px-6 pt-10 pb-12">
      <div className="min-w-0">
        <p className="text-xs font-bold tracking-[0.08em] text-brand uppercase">{run.kind === "note" ? t("edit.making", { v: run.version }) : t("edit.editing")}</p>
        <h1 className="mt-0.5 font-display text-[26px] font-semibold [overflow-wrap:anywhere]">{run.name}</h1>
      </div>

      {run.error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-card p-4">
          <p className="font-semibold text-destructive">{run.error}</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={onRetry}>{t("edit.retry")}</Button>
            <Button variant="outline" onClick={onBack}>
              {t("edit.back")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between font-semibold">
            <span className="font-mono">{t("edit.pct", { pct })}</span>
            <span className="font-mono font-medium text-muted-foreground">{eta}</span>
          </div>
          <div role="progressbar" aria-label={t("edit.editing")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2.5 overflow-hidden rounded-full bg-track">
            <div className="h-full rounded-full bg-bar transition-[width] duration-1000" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <ol className="flex flex-col rounded-2xl border bg-card">
        {STEPS.map((s, i) => {
          const state: StepState = run.error && i === at ? "error" : i < at ? "done" : i === at ? "active" : "todo"
          return (
            <li key={s.id} className={cn("flex items-center gap-3.5 px-4 py-3.5", i > 0 && "border-t")}>
              <StepIcon state={state} />
              <div className="min-w-0 flex-1">
                <p className={cn("font-semibold", state === "todo" && "text-muted-foreground")}>{t(s.label)}</p>
                {state === "active" && run.line && <p className="truncate text-[13px] text-muted-foreground">{run.line}</p>}
              </div>
              <span className={cn("text-xs font-bold", STATE_COLOR[state])}>{stateText[state]}</span>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-[1_1_320px] text-sm text-muted-foreground">{t("edit.privacy", { p: provider })}</p>
        {!run.error && (
          <Button variant="outline" onClick={onCancel}>
            {t("edit.cancel")}
          </Button>
        )}
      </div>
    </main>
  )
}
