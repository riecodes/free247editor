import { invoke } from "@tauri-apps/api/core"
import { useState } from "react"
import { CheckDot } from "@/components/Sidebar"
import { StepIcon } from "@/components/StepIcon"
import { Button } from "@/components/ui/button"
import { call, type EngineError, type Provider } from "@/lib/engine"
import { errorText, useT } from "@/lib/strings"
import { cn } from "@/lib/utils"

// Transcription: the cloud provider (labels from the engine's TRANSCRIBE_PROVIDER) or, later, this PC.
// The key is checked on a bundled 3-second sample, then kept in Windows Credential Manager.
export function TranscribeKey({ provider, has, onSaved }: { provider: Provider; has: boolean; onSaved: () => void }) {
  const [t] = useT()
  const p = provider.name
  const [editing, setEditing] = useState(!has)
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [heard, setHeard] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const test = async () => {
    const clean = key.trim().replace(/^["'\s]+|["'\s]+$/g, "")
    if (!clean) return setError(t("tx.pasteFirst", { p }))
    setBusy(true)
    setError(null)
    try {
      const { text } = await call<{ text: string }>("testKey", { key: clean })
      await invoke("set_groq_key", { key: clean })
      setKey("")
      setHeard(text)
      setEditing(false)
      onSaved()
    } catch (e) {
      setError(errorText(t, e as EngineError, p))
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <h3 className="font-bold">{t("tx.title")}</h3>
      <div role="radiogroup" aria-label={t("tx.title")} className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <button type="button" role="radio" aria-checked="true" className="flex min-h-16 flex-col items-start gap-1 rounded-xl border-2 border-sel-line bg-sel p-3 text-left">
          <span className="flex w-full items-center gap-2 font-bold">
            <span className="flex-1">{t("tx.cloud", { p })}</span>
            <CheckDot />
          </span>
          <span className="text-[13px] text-muted-foreground">{t("tx.cloudPrivacy", { p })}</span>
        </button>
        <button type="button" role="radio" aria-checked="false" disabled className="flex min-h-16 flex-col items-start gap-1 rounded-xl border-2 border-border bg-card p-3 text-left opacity-60">
          <span className="font-bold">{t("tx.local")}</span>
          <span className="text-[13px] text-muted-foreground">{t("tx.localSoon")}</span>
        </button>
      </div>
      {heard !== null && (
        <p role="status" className="flex items-start gap-2 font-semibold">
          <StepIcon state="done" />
          {t("tx.works", { text: heard })}
        </p>
      )}
      {!editing ? (
        <div className="flex flex-wrap items-center gap-3">
          {heard === null && (
            <p className="flex items-center gap-2 font-semibold">
              <StepIcon state="done" />
              {t("tx.saved", { p })}
            </p>
          )}
          <Button variant="link" onClick={() => setEditing(true)}>
            {t("tx.change")}
          </Button>
        </div>
      ) : (
        <>
          <label htmlFor="transcribe-key" className="text-[13px] font-semibold text-muted-foreground">
            {t("tx.keyLabel", { p })}
          </label>
          <div className="flex flex-wrap gap-3">
            <input
              id="transcribe-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => {
                setKey(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => e.key === "Enter" && test()}
              placeholder={provider.keyHint}
              aria-invalid={Boolean(error)}
              className={cn("min-h-11 min-w-0 flex-[1_1_240px] rounded-xl border bg-background px-3", error ? "border-destructive" : "border-input")}
            />
            <Button variant="outline" onClick={() => call("openUrl", { url: provider.keyUrl })}>
              {t("tx.get")}
            </Button>
            <Button onClick={test} disabled={busy}>
              {busy ? t("tx.testing") : t("tx.test")}
            </Button>
          </div>
          {error && (
            <p role="alert" className="font-semibold text-destructive">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  )
}
