import { setLang, useT } from "@/lib/strings"
import { cn } from "@/lib/utils"

// English by default; FIL is one tap away and remembered.
export function LangPill() {
  const [, lang] = useT()
  return (
    <div role="group" aria-label="Language" className="inline-flex gap-0.5 rounded-full border bg-card p-[3px]">
      {(["en", "fil"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={cn("min-h-[38px] rounded-full px-3 text-xs font-bold", lang === l ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
