import { CircleAlert } from "lucide-react"
import { useState } from "react"
import { TranscribeKey } from "@/components/TranscribeKey"
import { Button } from "@/components/ui/button"
import type { Engine, Job, Provider, Status } from "@/lib/engine"
import { useT } from "@/lib/strings"
import { cn } from "@/lib/utils"

type Props = {
  status: Status
  provider: Provider
  groq: boolean
  engine: Engine
  dragging: boolean
  dropError: string | null
  onPickFile: () => void
  onOpen: (job: Job) => void
  goSetup: () => void
  goEngine: () => void
  signIn: (e: Engine) => void
  signingIn: Engine | null
  signInError: string | null
  onGroq: () => void
}

const CLI = { claude: "Claude Code", codex: "Codex" } as const

// The drop zone is the home screen; the startup check's fixes sit above it, where they can be done.
export function Home(p: Props) {
  const [t] = useT()
  const cli = p.status[p.engine]
  // Once shown, the key panel stays for this visit so its result stays where the user acted.
  const [keyPanel] = useState(!p.groq)
  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-6 pt-8 pb-12">
      {!p.status.setupDone && (
        <Fix text={t("home.setupNotDone")}>
          <Button variant="outline" onClick={p.goSetup}>
            {t("home.continueSetup")}
          </Button>
        </Fix>
      )}
      {p.status.setupDone && !cli.loggedIn && (
        <Fix text={p.signingIn === p.engine ? t("ai.waitingHow") : t("home.signedOut", { cli: CLI[p.engine] })}>
          <Button onClick={() => p.signIn(p.engine)} disabled={p.signingIn !== null || !cli.installed}>
            {p.signingIn === p.engine ? t("ai.waiting") : t(`ai.${p.engine}.action`)}
          </Button>
          <Button variant="link" onClick={p.goEngine}>
            {t("app.changeAi")}
          </Button>
          {p.signInError && (
            <p role="alert" className="basis-full font-semibold text-destructive">
              {p.signInError}
            </p>
          )}
        </Fix>
      )}
      {p.status.setupDone && (keyPanel || !p.groq) && <TranscribeKey provider={p.provider} has={p.groq} onSaved={p.onGroq} />}

      <button
        type="button"
        onClick={p.onPickFile}
        className={cn(
          "flex min-h-[360px] flex-col items-center justify-center gap-3.5 rounded-[22px] border-2 border-dashed px-6 py-8 text-center",
          p.dragging ? "border-drop-line-on bg-drop-on" : "border-drop-line bg-drop"
        )}
      >
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" className="text-brand">
          <rect x="16" y="6" width="32" height="52" rx="6" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M28 24v16l12-8z" fill="currentColor" />
        </svg>
        <span className="max-w-[16ch] font-display text-[40px] leading-[1.1] font-semibold">{p.dragging ? t("home.release") : t("home.drop")}</span>
        <span className="font-mono text-sm text-muted-foreground">{t("home.formats")}</span>
        <span className="inline-flex min-h-11 items-center rounded-xl border border-input bg-secondary px-[18px] font-semibold">{t("home.pick")}</span>
      </button>
      {p.dropError && (
        <p role="alert" className="-mt-2 font-semibold text-destructive">
          {p.dropError}
        </p>
      )}

      {p.status.jobs.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-bold tracking-[0.06em] text-muted-foreground uppercase">{t("home.recents")}</h2>
          <ul className="flex flex-col gap-2">
            {p.status.jobs.map((job) => (
              <li key={job.slug}>
                <button type="button" onClick={() => p.onOpen(job)} className={cn("flex w-full items-center gap-3.5 rounded-2xl border bg-card py-2.5 pr-3.5 pl-2.5 text-left", !job.final && "border-warn-line")}>
                  <span className="flex h-[60px] w-[34px] shrink-0 items-center justify-center rounded-md bg-track" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <path d="M3 1.5v9l7.5-4.5z" className="fill-faint" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm font-semibold">{job.name}</span>
                    <span className={cn("text-[13px] font-semibold", job.final ? "text-ok-ink" : "text-warn-ink")}>
                      {job.final ? t("home.final", { v: job.final.version }) : t("home.draft", { v: job.current })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

function Fix({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warn-line bg-warn-bg p-4">
      <CircleAlert className="size-5 shrink-0 text-warn-ink" aria-hidden="true" />
      <p className="min-w-0 flex-[1_1_260px] font-semibold">{text}</p>
      {children}
    </div>
  )
}
