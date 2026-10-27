// Small shared helpers for the screens (all words live in strings.ts).
import type { StepState } from "@/components/StepIcon"
import type { EditRun } from "@/screens/Editing"

export const STATE_COLOR: Record<StepState, string> = {
  done: "text-ok-ink",
  active: "text-brand",
  todo: "text-faint",
  error: "text-destructive",
  warn: "text-warn-ink",
}

export function newRun(kind: EditRun["kind"], name: string, version: number, step: string): EditRun {
  const now = Date.now()
  return { kind, name, version, step, line: "", started: now, stepStarted: now }
}
