import type { Job } from "@/lib/engine"
import { useT } from "@/lib/strings"
import { cn } from "@/lib/utils"

export type Speed = "best" | "fast"
export type Template = { id: string; name: string }
type Props = {
  engineLine: string
  engineOk: boolean
  speed?: Speed
  setSpeed?: (s: Speed) => void
  templates: Template[]
  template: string
  setTemplate: (id: string) => void
  saved?: string | null
  job?: Job | null
  onRestore?: (version: number) => void
  busy?: boolean
}

const h2 = "text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase"
const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "")

// Engine, templates and (on Review) the edit log, where Restore makes an older version current.
export function Sidebar({ engineLine, engineOk, speed, setSpeed, templates, template, setTemplate, saved, job, onRestore, busy }: Props) {
  const [t] = useT()
  return (
    <aside aria-label={`${t("side.engine")}, ${t("side.templates")}`} className="flex w-full shrink-0 flex-col gap-6 border-b bg-header px-4 py-5 md:w-[260px] md:border-r md:border-b-0">
      <section className="flex flex-col gap-2">
        <h2 className={h2}>{t("side.engine")}</h2>
        <p className="flex items-center gap-2 font-semibold">
          <span className={cn("size-2 shrink-0 rounded-full", engineOk ? "bg-ok" : "bg-warn")} aria-hidden="true" />
          {engineLine}
        </p>
        {speed && setSpeed && (
          <div role="group" aria-label={t("side.model")} className="inline-flex gap-0.5 self-start rounded-full border bg-card p-[3px]">
            {(["best", "fast"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                onClick={() => setSpeed(s)}
                className={cn("min-h-9 rounded-full px-3 text-[13px] font-semibold", speed === s ? "bg-seg text-seg-ink" : "text-muted-foreground hover:text-foreground")}
              >
                {t(s === "best" ? "side.best" : "side.fast")}
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={h2}>{t("side.templates")}</h2>
        <div role="radiogroup" aria-label={t("side.templates")} className="flex flex-col gap-1.5">
          {(templates.length ? templates : [{ id: "default", name: "Default" }]).map((tp) => {
            const on = tp.id === template
            return (
              <button
                key={tp.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTemplate(tp.id)}
                className={cn("flex min-h-11 items-center gap-2 rounded-[10px] border px-3 text-left", on ? "border-sel-line bg-sel" : "bg-card")}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{tp.id === "default" ? t("side.default") : tp.name}</span>
                {on && <CheckDot />}
              </button>
            )
          })}
        </div>
        {saved && (
          <p role="status" className="rounded-[10px] bg-ok-bg px-2.5 py-2 text-[13px] font-semibold text-ok-ink">
            {t("side.saved", { name: saved })}
          </p>
        )}
      </section>
      {job && (
        <section className="flex flex-col gap-2">
          <h2 className={h2}>{t("side.log")}</h2>
          <ol className="flex flex-col gap-1.5">
            {[...job.versions].reverse().map((v) => {
              const current = v === job.current
              return (
                <li key={v} className={cn("flex items-center gap-2 rounded-[10px] border bg-card px-2.5 py-2", current && "border-sel-line")}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      v{v} <span className="font-mono text-xs font-medium text-muted-foreground">{v === 1 ? time(job.created) : time(job.times?.[v])}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{v === 1 ? t("side.firstDraft") : job.notes?.[v] || t("side.yourNote")}</p>
                  </div>
                  {current ? (
                    <span className="text-xs font-bold text-brand">{t("side.inUse")}</span>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => onRestore?.(v)} className="min-h-9 rounded-lg border border-input px-2.5 text-[13px] font-semibold hover:bg-secondary disabled:opacity-50">
                      {t("side.restore")}
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </aside>
  )
}

export function CheckDot() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="8" fill="#4F46E5" />
      <path d="M4.5 8.2l2.2 2.1 4.8-4.6" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
