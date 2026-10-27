import { convertFileSrc } from "@tauri-apps/api/core"
import { Check } from "lucide-react"
import { useState } from "react"
import { StepIcon } from "@/components/StepIcon"
import { Button } from "@/components/ui/button"
import type { Job } from "@/lib/engine"
import { useT, type Key } from "@/lib/strings"
import { cn } from "@/lib/utils"

const CHIPS: { id: string; label: Key }[] = [
  { id: "faster", label: "rev.faster" },
  { id: "bigger", label: "rev.bigger" },
  { id: "nohook", label: "rev.nohook" },
  { id: "color", label: "rev.color" },
  { id: "zoom", label: "rev.zoom" },
]

type Props = {
  job: Job
  viewing: number
  setViewing: (v: number) => void
  busy: boolean
  error: string | null
  rule: string | null
  onUse: (v: number) => void
  onNote: (note: { chips: string[]; text: string; rule: boolean }) => void
  onApprove: () => void
  onReveal: (path: string) => void
  onAgain: () => void
}

export function Review({ job, viewing, setViewing, busy, error, rule, onUse, onNote, onApprove, onReveal, onAgain }: Props) {
  const [t] = useT()
  const [chips, setChips] = useState<string[]>([])
  const [text, setText] = useState("")
  const [makeRule, setMakeRule] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const file = job.files[viewing] ?? job.files[job.current]
  const next = Math.max(...job.versions) + 1

  const send = () => {
    if (!chips.length && !text.trim()) return setNoteError(t("rev.noteEmpty"))
    onNote({ chips, text, rule: makeRule })
  }

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-wrap items-start gap-8 px-6 pt-8 pb-12">
      <section className="mx-auto flex min-w-0 flex-[0_1_340px] flex-col gap-2.5">
        <div className="relative aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-[18px] border bg-[#0b0d11]">
          <video key={file.mp4} src={convertFileSrc(file.mp4)} controls preload="metadata" className="absolute inset-0 size-full object-contain" />
          <span className="pointer-events-none absolute top-2.5 left-2.5 rounded-md bg-black/60 px-2 py-0.5 font-mono text-xs font-bold text-white">{t("rev.draft", { v: viewing })}</span>
        </div>
        <Button variant="outline" onClick={() => onReveal(file.mp4)}>
          {t("rev.show")}
        </Button>
      </section>

      <section className="flex min-w-0 flex-[999_1_440px] flex-col gap-[18px]">
        {job.final && (
          <div role="status" className="flex flex-col gap-3 rounded-2xl border border-final-line bg-final p-[18px]">
            <p className="flex items-center gap-2.5 font-display text-[22px] font-semibold text-final-strong">
              <StepIcon state="done" />
              {t("rev.final")}
            </p>
            <p className="text-final-ink [overflow-wrap:anywhere]">
              {t("rev.savedTo")} <span className="font-mono text-[13px] text-final-strong">Videos\free247editor\{job.slug}-final.mp4</span> + <span className="font-mono text-[13px] text-final-strong">.srt</span>
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Button variant="final" onClick={() => onReveal(job.final!.mp4)}>
                {t("rev.show")}
              </Button>
              <Button variant="outline" className="border-final-line text-final-strong" onClick={onAgain}>
                {t("rev.another")}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold [overflow-wrap:anywhere]">{job.name}</h1>
          <div role="group" aria-label="Drafts" className="flex flex-wrap items-center gap-2">
            {job.versions.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={v === viewing}
                onClick={() => setViewing(v)}
                className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 font-mono font-bold", v === viewing ? "border-sel-line bg-sel" : "border-input")}
              >
                {v === viewing && <Check className="size-3.5 text-brand" aria-hidden="true" />}v{v}
                {v === job.current && <span className="font-sans text-xs font-semibold text-muted-foreground">{t("rev.inUse")}</span>}
              </button>
            ))}
            {viewing !== job.current && (
              <Button variant="outline" onClick={() => onUse(viewing)} disabled={busy}>
                {t("rev.use", { v: viewing })}
              </Button>
            )}
          </div>
          {viewing > 1 && job.notes?.[viewing] && <p className="text-muted-foreground">{t("rev.changed", { v: viewing, note: job.notes[viewing] })}</p>}
        </div>

        <div className="flex flex-col gap-3.5 rounded-2xl border bg-card p-[18px]">
          <h2 className="text-[17px] font-bold">{t("rev.what")}</h2>
          <div role="group" aria-label={t("rev.what")} className="flex flex-wrap gap-2">
            {CHIPS.map((c) => {
              const on = chips.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setChips(on ? chips.filter((x) => x !== c.id) : [...chips, c.id])
                    setNoteError(null)
                  }}
                  className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold", on ? "border-sel-line bg-sel" : "border-input")}
                >
                  {on && <Check className="size-3.5 text-brand" aria-hidden="true" />}
                  {t(c.label)}
                </button>
              )
            })}
          </div>
          <label htmlFor="note-text" className="text-[13px] font-semibold text-muted-foreground">
            {t("rev.noteLabel")}
          </label>
          <textarea
            id="note-text"
            rows={3}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setNoteError(null)
            }}
            placeholder={t("rev.notePlaceholder")}
            className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5"
          />
          <label htmlFor="make-rule" className="flex min-h-11 cursor-pointer items-center gap-2.5">
            <input id="make-rule" type="checkbox" checked={makeRule} onChange={() => setMakeRule(!makeRule)} className="size-[18px] accent-[#4F46E5]" />
            <span>{t("rev.rule")}</span>
          </label>
          {(noteError || error) && (
            <p role="alert" className="font-semibold text-destructive">
              {noteError || error}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" size="lg" onClick={send} disabled={busy}>
              {t("rev.send", { v: next })}
            </Button>
            <Button size="lg" onClick={onApprove} disabled={busy}>
              {busy ? t("rev.exporting") : job.final ? t("rev.approveAgain", { v: job.current }) : t("rev.approve")}
            </Button>
          </div>
        </div>
        {rule && (
          <p className="inline-flex items-center gap-2 self-start rounded-xl bg-secondary px-3 py-2 text-sm">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 2.5h10v11l-5-3-5 3z" fill="none" strokeWidth="1.6" strokeLinejoin="round" className="stroke-warn" />
            </svg>
            {t("rev.ruleSaved", { rule })}
          </p>
        )}
      </section>
    </main>
  )
}
