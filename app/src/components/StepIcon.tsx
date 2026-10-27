import { CircleAlert, LoaderCircle } from "lucide-react"

export type StepState = "done" | "active" | "todo" | "error" | "warn"

// Done, working, next or failed, told apart by shape and not by color alone.
export function StepIcon({ state }: { state: StepState }) {
  if (state === "done" || state === "warn")
    return (
      <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
        <circle cx="10" cy="10" r="9" className={state === "warn" ? "fill-warn-bg" : "fill-ok-bg"} />
        <path d="M6 10.5l2.6 2.5L14 7.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={state === "warn" ? "stroke-warn-ink" : "stroke-ok"} />
      </svg>
    )
  if (state === "active") return <LoaderCircle className="size-[22px] shrink-0 animate-spin text-brand" aria-hidden="true" />
  if (state === "error") return <CircleAlert className="size-[22px] shrink-0 text-destructive" aria-hidden="true" />
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2" className="stroke-ring" />
    </svg>
  )
}
